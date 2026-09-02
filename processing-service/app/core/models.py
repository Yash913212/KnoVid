"""Thread-safe lazy loading of heavy ML models.

Whisper / spaCy / pyannote are gigabytes of memory and take seconds to load,
so they are loaded once per process. A lock guards double-initialisation and
prevents concurrent mutation of the global singletons.
"""
import logging
import subprocess
import threading

from app.core.config import settings

logger = logging.getLogger(__name__)

_whisper_model = None
_diarization_pipeline = None
_nlp = None
_model_lock = threading.Lock()


def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        with _model_lock:
            if _whisper_model is None:
                import whisper
                logger.info("Loading whisper model %s", settings.whisper_model)
                _whisper_model = whisper.load_model(settings.whisper_model)
    return _whisper_model


def get_diarization():
    global _diarization_pipeline
    if _diarization_pipeline is None and settings.hf_token:
        with _model_lock:
            if _diarization_pipeline is None:
                from pyannote.audio import Pipeline
                logger.info("Loading speaker-diarization pipeline")
                _diarization_pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=settings.hf_token,
                )
    return _diarization_pipeline


def get_spacy():
    global _nlp
    if _nlp is None:
        with _model_lock:
            if _nlp is None:
                import spacy
                try:
                    _nlp = spacy.load("en_core_web_sm")
                except OSError:
                    logger.info("Downloading en_core_web_sm model")
                    subprocess.run(
                        ["python", "-m", "spacy", "download", "en_core_web_sm"],
                        check=True,
                    )
                    _nlp = spacy.load("en_core_web_sm")
    return _nlp
