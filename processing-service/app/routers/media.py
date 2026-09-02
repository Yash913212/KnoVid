"""Media ingestion endpoints: /process, /analyze."""
import asyncio
import logging

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

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
def process_video(req: ProcessRequest, _auth: None = Depends(require_auth)):
    if not req.url and not req.filePath:
        raise HTTPException(400, "Either url or filePath required")

    title: str | None = None
    if req.url:
        video_path = asyncio.run(download_video(req.url, req.videoId))
        title = fetch_title(req.url)
    else:
        video_path = _safe_video_path(req.filePath or "")

    if not video_path.exists():
        raise HTTPException(400, "Video file not found")

    duration = get_duration(video_path)
    if duration > settings.max_video_duration_s:
        raise HTTPException(
            413,
            f"Video duration {int(duration)}s exceeds the "
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

    # Semantic chapter segmentation — new in 1.1. Deterministic by default,
    # LLM-refined titles when a provider is available.
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
        title=title,
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