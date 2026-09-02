"""Semantic chapter auto-segmentation.

A lightweight topic-segmentation heuristic: sliding TF-IDF windows whose
vocabulary overlap dips below a threshold mark a topic boundary. Each chapter
gets a title (most representative phrase), a summary, and keyword tags — all
deterministic, so it works without an LLM. An optional LLM pass can refine
titles when one is configured.
"""
import logging

from sklearn.feature_extraction.text import TfidfVectorizer

from app.core.config import settings
from app.schemas.schemas import ChapterOut, SegmentOut
from app.services.llm import call_llm

logger = logging.getLogger(__name__)

_WINDOW = 8          # segments per coherence window
_OVERLAP = 4         # overlap between consecutive windows
_MIN_BREAK = 0.40    # cosine drop that signals a topic change
_MIN_CHAPTER_LEN = 3  # minimum segments in a chapter


def _window_vectors(segments: list[SegmentOut]):
    """TF-IDF vectors for each sliding window of transcript text.

    Returns (windows, texts) or None when there is too little text to build
    coherent windows.
    """
    texts = [s.text for s in segments if s.text.strip()]
    if len(texts) < _WINDOW + 1:
        return None
    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            max_features=200,
            ngram_range=(1, 2),
        )
        matrix = vectorizer.fit_transform(texts)
    except Exception:  # noqa: BLE001
        logger.debug("TF-IDF unavailable for chapters; skipping")
        return None

    windows = []
    step = _WINDOW - _OVERLAP
    for i in range(0, len(texts) - _WINDOW + 1, step):
        segment = slice(i, i + _WINDOW)
        windows.append(matrix[segment].sum(axis=0))
    return windows, texts


def _cosine(a, b) -> float:
    from numpy.linalg import norm
    na, nb = norm(a), norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float((a @ b.T) / (na * nb))


def _boundaries(segments: list[SegmentOut]) -> list[int]:
    """Return transcript-segment indices where a topic boundary occurs."""
    built = _window_vectors(segments)
    if built is None:
        return []
    windows, _texts = built
    if len(windows) < 2:
        return []

    boundaries: list[int] = []
    step = _WINDOW - _OVERLAP
    for i in range(1, len(windows)):
        sim = _cosine(windows[i - 1], windows[i])
        if sim < _MIN_BREAK:
            # The break lands at the middle of the overlapping region.
            boundary_segment = i * step + _OVERLAP // 2
            boundaries.append(boundary_segment)
    return boundaries


def _top_terms(segments: list[SegmentOut], k: int = 5) -> list[str]:
    texts = [s.text for s in segments if s.text.strip()]
    if not texts:
        return []
    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            max_features=60,
            ngram_range=(1, 2),
        )
        matrix = vectorizer.fit_transform(texts)
        scores = zip(vectorizer.get_feature_names_out(), matrix.sum(axis=0).tolist()[0])
        ranked = sorted(scores, key=lambda x: x[1], reverse=True)[:k]
        return [t for t, _s in ranked]
    except Exception:  # noqa: BLE001
        return []


def _title_from_keywords(keywords: list[str]) -> str:
    if not keywords:
        return "Untitled chapter"
    title = " ".join(keywords[:2]).title()
    return title[:64]


def segment_chapters(segments: list[SegmentOut]) -> list[ChapterOut]:
    """Split segments into semantic chapters and name each one."""
    if not segments:
        return []

    boundaries = _boundaries(segments)
    chapter_ranges: list[tuple[int, int]] = []
    start = 0
    for b in boundaries + [len(segments)]:
        if b - start >= _MIN_CHAPTER_LEN:
            chapter_ranges.append((start, b))
            start = b
    if start < len(segments) and (len(segments) - start) >= _MIN_CHAPTER_LEN:
        chapter_ranges.append((start, len(segments)))

    chapters: list[ChapterOut] = []
    for idx, (lo, hi) in enumerate(chapter_ranges):
        chapter_segments = segments[lo:hi]
        start_ts = chapter_segments[0].start
        end_ts = chapter_segments[-1].end
        keywords = _top_terms(chapter_segments)
        title = _title_from_keywords(keywords)
        summary = " ".join(s.text for s in chapter_segments[:2])[:220]
        chapters.append(ChapterOut(
            id=f"ch_{idx + 1}",
            title=title,
            start=start_ts,
            end=end_ts,
            summary=summary,
            keywords=keywords,
        ))
    return chapters


async def refine_chapter_titles(chapters: list[ChapterOut]) -> list[ChapterOut]:
    """Optionally ask the LLM to produce concise, human-readable titles."""
    if not chapters or not settings.llm_api_key and not settings.ollama_enabled:
        return chapters

    blocks = "\n".join(
        f"[{i + 1}] {c.title} — {c.summary[:120]}" for i, c in enumerate(chapters)
    )
    system = (
        "You are a video editor. Given numbered auto-generated chapters of a "
        "transcript (title + short summary each), return exactly one short, "
        "memorable chapter title per line in the format '[number] Title' (max "
        "8 words). Do not add explanations."
    )
    result = await call_llm(system, blocks)
    if not result:
        return chapters

    import re
    overrides: dict[int, str] = {}
    for line in result.strip().splitlines():
        m = re.match(r"^\s*\[(\d+)\]\s*(.+)$", line)
        if m:
            overrides[int(m.group(1))] = m.group(2).strip()[:64]

    for i, chapter in enumerate(chapters, start=1):
        if i in overrides:
            chapter.title = overrides[i]
    return chapters