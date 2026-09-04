"""Media and document ingestion endpoints: /process, /analyze.

Supports:
- Any Web URL (articles, Wikipedia, news, documentation, online PDFs)
- Media streaming URLs (YouTube, Vimeo, direct video/audio)
- Uploaded documents (PDF, DOCX, TXT, Markdown, CSV, JSON)
- Uploaded media (Video: MP4, WebM, MKV, MOV; Audio: MP3, WAV, M4A, FLAC)
"""
import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.schemas.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ProcessRequest,
    ProcessResponse,
)
from app.services.analysis import extract_entities, extract_keywords, extract_topics
from app.services.chapters import refine_chapter_titles, segment_chapters
from app.services.document_parser import is_document_file, parse_uploaded_document
from app.services.llm import llm_available
from app.services.media import (
    _safe_video_path,
    assign_speakers,
    download_video,
    extract_audio,
    fetch_title,
    get_duration,
    require_auth,
    transcribe,
    translate_segments_sync,
)
from app.services.web_scraper import fetch_and_parse_url, is_media_url

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
def process_video(req: ProcessRequest, _auth: None = Depends(require_auth)):
    if not req.url and not req.filePath:
        raise HTTPException(400, "Either url or filePath required")

    # ──────────────────────────────────────────────────────────────────────────
    # CASE 1: Web URL Analysis (Any URL: web page, article, PDF, or video stream)
    # ──────────────────────────────────────────────────────────────────────────
    if req.url:
        target_url = req.url.strip()

        # If it's a known media platform or direct audio/video URL, try downloading with yt-dlp first
        if is_media_url(target_url):
            try:
                video_path = asyncio.run(download_video(target_url, req.videoId))
                title = fetch_title(target_url)
                return _process_media_pipeline(video_path, req, title)
            except Exception as e:
                logger.info("Media download failed for %s, falling back to web scraper: %s", target_url, e)

        # For any web article, Wikipedia, blog, online PDF, or web document:
        try:
            logger.info("Ingesting URL as web content / document: %s", target_url)
            scraped = asyncio.run(fetch_and_parse_url(target_url))

            # Save the scraped text content in uploads for persistence
            text_file = settings.upload_dir / f"{req.videoId}.txt"
            settings.upload_dir.mkdir(parents=True, exist_ok=True)
            text_file.write_text(scraped.full_text, encoding="utf-8")

            chapters = scraped.chapters
            if chapters and llm_available():
                try:
                    chapters = asyncio.run(refine_chapter_titles(chapters))
                except Exception as e:
                    logger.warning("Could not refine chapter titles: %s", e)

            return ProcessResponse(
                videoId=req.videoId,
                status="done",
                duration=scraped.duration,
                language=scraped.language,
                segments=scraped.segments,
                chapters=chapters,
                filePath=str(text_file),
                title=scraped.title,
            )
        except Exception as err:
            logger.error("Failed to parse web URL %s: %s", target_url, err, exc_info=True)
            raise HTTPException(500, f"Failed to analyze URL: {str(err)}")

    # ──────────────────────────────────────────────────────────────────────────
    # CASE 2: Uploaded File Analysis (PDF, DOCX, TXT, Audio, or Video)
    # ──────────────────────────────────────────────────────────────────────────
    video_path = _safe_video_path(req.filePath or "")
    if not video_path.exists():
        raise HTTPException(400, "File not found")

    # Document upload (PDF, DOCX, TXT, MD, CSV, JSON)
    if is_document_file(video_path):
        try:
            logger.info("Processing uploaded document: %s (%s)", video_path.name, video_path.suffix)
            doc = parse_uploaded_document(video_path)

            chapters = doc.chapters
            if chapters and llm_available():
                try:
                    chapters = asyncio.run(refine_chapter_titles(chapters))
                except Exception as e:
                    logger.warning("Could not refine chapter titles: %s", e)

            return ProcessResponse(
                videoId=req.videoId,
                status="done",
                duration=doc.duration,
                language=doc.language,
                segments=doc.segments,
                chapters=chapters,
                filePath=str(video_path),
                title=doc.title,
            )
        except Exception as err:
            logger.error("Document parsing failed for %s: %s", video_path, err, exc_info=True)
            raise HTTPException(500, f"Failed to parse document: {str(err)}")

    # Audio or Video upload
    return _process_media_pipeline(video_path, req, title=None)


def _process_media_pipeline(video_path: Path, req: ProcessRequest, title: str | None = None) -> ProcessResponse:
    """Run duration probe, audio extraction, Whisper transcription, and diarization."""
    duration = get_duration(video_path)
    if duration > settings.max_video_duration_s:
        raise HTTPException(
            413,
            f"Media duration {int(duration)}s exceeds the "
            f"{settings.max_video_duration_s}s processing limit",
        )
    audio_path = extract_audio(video_path, req.videoId)

    segments, detected_language = transcribe(audio_path, req.targetLanguage)
    assign_speakers(audio_path, segments, duration)

    output_language = detected_language
    target = (req.targetLanguage or "").strip().lower()
    if target and target != "en" and target != detected_language.lower():
        translated = translate_segments_sync(segments, target)
        if translated:
            segments = translated
            output_language = target

    chapters = segment_chapters(segments)
    if chapters and llm_available():
        chapters = asyncio.run(refine_chapter_titles(chapters))

    return ProcessResponse(
        videoId=req.videoId,
        status="done",
        duration=duration,
        language=output_language,
        segments=segments,
        chapters=chapters,
        filePath=str(video_path),
        title=title or video_path.stem.replace("-", " ").replace("_", " ").title(),
    )


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_transcript(req: AnalyzeRequest, _auth: None = Depends(require_auth)):
    nodes = []
    edges = []
    seen_id: set[str] = set()

    full_text = " ".join(s.text for s in req.segments)

    entities = extract_entities(req.segments, full_text, seen_id)
    nodes.extend(entities["nodes"])
    edges.extend(entities["edges"])

    keywords = extract_keywords(req.segments, full_text, seen_id)
    nodes.extend(keywords["nodes"])
    edges.extend(keywords["edges"])

    topics = extract_topics(req.segments, full_text, seen_id)
    nodes.extend(topics["nodes"])
    edges.extend(topics["edges"])

    return AnalyzeResponse(
        videoId=req.videoId,
        nodes=nodes,
        edges=edges,
    )