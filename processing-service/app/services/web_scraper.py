"""Universal web scraper and article ingestion service.

Extracts clean article text, metadata, headings, and outlines from any web URL
(Wikipedia, news, blogs, documentation, online PDFs, or standard web pages).
Converts web content into timed segments and semantic chapters compatible with
the KnoVid knowledge pipeline.
"""
import io
import logging
import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel

from app.schemas.schemas import ChapterOut, SegmentOut

logger = logging.getLogger(__name__)

# Realistic browser User-Agent
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 (compatible; KnoVid/1.0)"
)

# Known video/audio domains that yt-dlp should handle directly
KNOWN_MEDIA_DOMAINS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
    "vimeo.com", "player.vimeo.com",
    "twitch.tv", "www.twitch.tv",
    "soundcloud.com", "m.soundcloud.com",
    "dailymotion.com", "www.dailymotion.com",
    "tiktok.com", "www.tiktok.com",
}

# Known direct media file extensions
MEDIA_EXTENSIONS = (
    ".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv", ".wmv",
    ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"
)

# Reading speed: words per second (~160 words per minute = 2.67 wps)
WORDS_PER_SECOND = 2.67


def is_media_url(url: str) -> bool:
    """Check if the URL points directly to a known video/audio platform or file."""
    try:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        path = (parsed.path or "").lower()

        if any(hostname == d or hostname.endswith("." + d) for d in KNOWN_MEDIA_DOMAINS):
            return True

        if any(path.endswith(ext) for ext in MEDIA_EXTENSIONS):
            return True

        return False
    except Exception:
        return False


def _clean_text(text: str) -> str:
    """Normalize whitespace and clean up line breaks."""
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class ScrapedWebContent(BaseModel):
    title: str
    url: str
    language: str
    duration: float
    segments: list[SegmentOut]
    chapters: list[ChapterOut]
    full_text: str


async def fetch_and_parse_url(url: str) -> ScrapedWebContent:
    """Fetch any URL via HTTP and parse its textual content into segments and chapters."""
    headers = {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

    content_type = resp.headers.get("content-type", "").lower()

    if "application/pdf" in content_type or url.lower().endswith(".pdf"):
        return parse_pdf_bytes(resp.content, url)

    return parse_html_content(resp.text, url)


def parse_html_content(html_text: str, url: str) -> ScrapedWebContent:
    """Parse HTML text, extract title, structured sections, and convert to segments."""
    soup = BeautifulSoup(html_text, "html.parser")

    # Extract title
    title = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"].strip()
    if not title:
        title_tag = soup.find("title")
        if title_tag and title_tag.text:
            title = title_tag.text.strip()
    if not title:
        h1 = soup.find("h1")
        if h1 and h1.text:
            title = h1.text.strip()
    if not title:
        domain = urlparse(url).hostname or "Webpage"
        title = f"Article from {domain}"

    # Clean domain name as default speaker
    domain = urlparse(url).hostname or "Webpage"
    source_speaker = domain.replace("www.", "").split(".")[0].capitalize()

    # Remove unwanted / noise elements
    for noise in soup([
        "script", "style", "nav", "footer", "header", "aside",
        "noscript", "iframe", "form", "svg", "button", "figure"
    ]):
        noise.decompose()

    # Find main article container if present (article, main, or body)
    container = soup.find("article") or soup.find("main") or soup.find(id=re.compile(r"content|main|article", re.I)) or soup.body or soup

    # Extract structured blocks (headings and paragraphs)
    blocks: list[tuple[str, str]] = []  # (tag_type, text)
    for el in container.find_all(["h1", "h2", "h3", "h4", "p", "li", "blockquote"]):
        text = _clean_text(el.get_text())
        if not text or len(text) < 15:
            continue
        tag_name = el.name.lower()
        blocks.append((tag_name, text))

    if not blocks:
        # Fallback to whole text if individual tags were scarce
        raw_text = _clean_text(container.get_text())
        paragraphs = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 20]
        blocks = [("p", p) for p in paragraphs]

    if not blocks:
        blocks = [("p", f"No readable text could be extracted from {url}.")]

    # Build segments and chapters
    segments: list[SegmentOut] = []
    chapters: list[ChapterOut] = []

    current_section = "Introduction"
    current_time = 0.0
    chapter_start_time = 0.0
    chapter_idx = 0
    chapter_keywords: list[str] = []

    for tag, text in blocks:
        # If heading, mark a new section / chapter
        if tag in ("h1", "h2", "h3"):
            if current_time > chapter_start_time and chapter_start_time >= 0:
                chapters.append(ChapterOut(
                    id=f"ch_{chapter_idx}",
                    title=current_section[:80],
                    start=round(chapter_start_time, 2),
                    end=round(current_time, 2),
                    summary=f"Section discussing {current_section}",
                    keywords=chapter_keywords[:5],
                ))
                chapter_idx += 1
                chapter_keywords = []

            current_section = text
            chapter_start_time = current_time
            # Also emit heading as a brief orienting segment
            duration = max(3.0, len(text.split()) / WORDS_PER_SECOND)
            segments.append(SegmentOut(
                start=round(current_time, 2),
                end=round(current_time + duration, 2),
                speaker=source_speaker,
                language="en",
                text=f"## {text}",
                confidence=1.0,
            ))
            current_time += duration
            continue

        # Paragraph or list item
        # Split very long paragraphs (>100 words) into readable chunks
        words = text.split()
        chunk_size = 65
        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            chunk_text = " ".join(chunk_words)
            duration = max(3.0, len(chunk_words) / WORDS_PER_SECOND)

            segments.append(SegmentOut(
                start=round(current_time, 2),
                end=round(current_time + duration, 2),
                speaker=f"{source_speaker}: {current_section[:24]}",
                language="en",
                text=chunk_text,
                confidence=1.0,
            ))
            current_time += duration

            # Collect keywords roughly
            for w in chunk_words:
                if len(w) > 6 and w.isalpha():
                    chapter_keywords.append(w.lower())

    # Final chapter wrap-up
    if current_time > chapter_start_time:
        chapters.append(ChapterOut(
            id=f"ch_{chapter_idx}",
            title=current_section[:80],
            start=round(chapter_start_time, 2),
            end=round(current_time, 2),
            summary=f"Key insights regarding {current_section}",
            keywords=chapter_keywords[:5],
        ))

    total_duration = max(10.0, round(current_time, 2))
    full_text = " ".join(s.text for s in segments)

    return ScrapedWebContent(
        title=title[:200],
        url=url,
        language="en",
        duration=total_duration,
        segments=segments,
        chapters=chapters,
        full_text=full_text,
    )


def parse_pdf_bytes(pdf_bytes: bytes, source_name: str) -> ScrapedWebContent:
    """Extract text from PDF bytes using pypdf and structure into segments and chapters."""
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    num_pages = len(reader.pages)

    title = ""
    if reader.metadata and reader.metadata.title:
        title = str(reader.metadata.title).strip()
    if not title:
        title = source_name.split("/")[-1].split("\\")[-1].replace(".pdf", "").replace("-", " ").replace("_", " ").title()

    segments: list[SegmentOut] = []
    chapters: list[ChapterOut] = []

    current_time = 0.0
    for page_idx, page in enumerate(reader.pages):
        page_text = _clean_text(page.extract_text() or "")
        if not page_text:
            continue

        page_start = current_time
        paragraphs = [p.strip() for p in page_text.split("\n\n") if len(p.strip()) > 10]
        if not paragraphs:
            paragraphs = [page_text]

        for p in paragraphs:
            words = p.split()
            chunk_size = 70
            for i in range(0, len(words), chunk_size):
                chunk_words = words[i:i + chunk_size]
                chunk_text = " ".join(chunk_words)
                duration = max(3.0, len(chunk_words) / WORDS_PER_SECOND)

                segments.append(SegmentOut(
                    start=round(current_time, 2),
                    end=round(current_time + duration, 2),
                    speaker=f"Page {page_idx + 1}",
                    language="en",
                    text=chunk_text,
                    confidence=1.0,
                ))
                current_time += duration

        # Add page as a chapter
        chapters.append(ChapterOut(
            id=f"ch_{page_idx}",
            title=f"Page {page_idx + 1}",
            start=round(page_start, 2),
            end=round(current_time, 2),
            summary=f"Content from page {page_idx + 1} of {num_pages}",
            keywords=[],
        ))

    total_duration = max(10.0, round(current_time, 2))
    full_text = " ".join(s.text for s in segments)

    return ScrapedWebContent(
        title=title[:200],
        url=source_name,
        language="en",
        duration=total_duration,
        segments=segments,
        chapters=chapters,
        full_text=full_text,
    )
