"""Centralised configuration for the KnoVid processing service.

All environment variables are read once here so the rest of the package can
import a single, well-typed configuration object instead of scattering
``os.getenv`` calls throughout the code.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Resolve relative to this file so it works regardless of CWD.
BACKEND_ENV = Path(__file__).resolve().parents[3] / "backend" / ".env"
SERVICE_ENV = Path(__file__).resolve().parents[2] / ".env"
DEFAULT_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "backend" / "uploads"

# Load service env first, then backend env for any missing vars (e.g. OPENROUTER_API_KEY)
load_dotenv(SERVICE_ENV)
load_dotenv(BACKEND_ENV, override=False)


class Settings:
    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        load_dotenv(SERVICE_ENV, override=True)
        load_dotenv(BACKEND_ENV, override=False)

        self.upload_dir = Path(os.getenv("UPLOAD_DIR", str(DEFAULT_UPLOAD_DIR))).resolve()
        self.whisper_model = os.getenv("WHISPER_MODEL", "base")
        self.hf_token = os.getenv("HF_TOKEN", "")

        # Optional shared secret. When set, every endpoint requires the backend
        # to present it via the X-Processing-Auth header.
        self.processing_auth_token = os.getenv("PROCESSING_AUTH_TOKEN", "")

        # OpenRouter / LLM provider settings.
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
        self.llm_api_key = self.openrouter_api_key or os.getenv("LLM_API_KEY", "").strip()
        self.llm_api_url = os.getenv("LLM_API_URL", "").strip()

        if self.openrouter_api_key or self.llm_api_key.startswith("sk-or"):
            self.llm_api_url = self.llm_api_url or "https://openrouter.ai/api/v1"
        self.llm_api_url = self.llm_api_url or "https://openrouter.ai/api/v1"

        self.llm_model = os.getenv("LLM_MODEL", "nvidia/nemotron-3.5-lightning:free")
        self.ollama_enabled = os.getenv("OLLAMA_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
        self.ollama_api_url = os.getenv("OLLAMA_API_URL", "http://localhost:11434/v1")
        self.ollama_api_key = os.getenv("OLLAMA_API_KEY", "ollama")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "qwen3:8b")

        # CORS origins for browser access.
        self.cors_origins = [
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if o.strip()
        ]

        # Reject videos longer than this (Whisper transcription cost guard).
        self.max_video_duration_s = int(os.getenv("MAX_VIDEO_DURATION_S", "10800"))  # 3h
        self.download_timeout_s = int(os.getenv("DOWNLOAD_TIMEOUT_S", "600"))


settings = Settings()

