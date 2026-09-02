"""KnoVid processing service — FastAPI app entry point.

Handles video ingestion (URL/uploads), Whisper transcription, speaker
diarization, knowledge-graph analysis, semantic chapter auto-segmentation,
and LLM-backed content generation with deterministic fallbacks.
"""
import logging
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.content import router as content_router
from app.routers.media import router as media_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On boot: ensure the uploads directory exists and prune stale files."""
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    # WAVs extracted during transcription are intermediate artifacts. Prune
    # any left over from a previous crashed run on startup.
    for leftover in settings.upload_dir.glob("*.wav"):
        if leftover.stat().st_mtime < 3600 * 8:
            stash = settings.upload_dir / ".trash"
            stash.mkdir(exist_ok=True)
            shutil.move(str(leftover), str(stash / leftover.name))
        logger.info("Stashed stale audio artifact %s", leftover.name)

    app.state.upload_dir = settings.upload_dir
    logger.info("Processing service ready (upload dir: %s)", settings.upload_dir)
    yield


app = FastAPI(
    title="KnoVid Processing Service",
    version="1.1.0",
    description=(
        "Transcription, diarization, knowledge-graph analysis, semantic "
        "chapter segmentation and LLM content generation for KnoVid."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(media_router, tags=["media"])
app.include_router(content_router, tags=["content"])


@app.get("/health")
def health():
    """Readiness probe used by the backend/frontend and uptime monitors."""
    return {
        "status": "ok",
        "service": "processing",
        "version": "1.1.0",
        "uploadDir": str(settings.upload_dir),
        "loads": {"whisper": settings.whisper_model},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)