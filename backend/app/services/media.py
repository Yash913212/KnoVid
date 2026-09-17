"""Media pipeline: URL download, audio extraction, Whisper transcription,
pyannote speaker diarization, and duration probing."""
import asyncio
import ipaddress
import logging
import re
import secrets
import socket
import subprocess
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.models import get_diarization, get_whisper
from app.schemas.schemas import SegmentOut

logger = logging.getLogger(__name__)

# Browser-like UA reduces YouTube's bot detection (HTTP 403 on download).
YT_DLP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

TRANSIENT_MARKERS = ("403", "challenge", "unable to download video data", "Requested format is not available")


def require_auth(request: Request) -> None:
    """Dependency that enforces the shared secret when one is configured."""
    if not settings.processing_auth_token:
        return
    provided = request.headers.get("x-processing-auth", "")
    if not secrets.compare_digest(provided, settings.processing_auth_token):
        raise HTTPException(401, "Unauthorized")


def _safe_video_path(path: str) -> Path:
    """Resolve a client-supplied file path and refuse anything outside UPLOAD_DIR.

    This is the critical hardening for the arbitrary-file-read hole: the
    resolved path must be a file inside the uploads sandbox.
    """
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = settings.upload_dir / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(settings.upload_dir.resolve())
    except ValueError:
        raise HTTPException(400, "filePath must be inside the uploads directory")
    return candidate


def _validate_download_url(url: str) -> None:
    """Reject non-http(s) URLs and hosts that resolve to private/loopback
    addresses so the service cannot be used as an SSRF proxy."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(400, "Only http/https URLs are supported")
    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}:
        raise HTTPException(400, "URL host is not allowed")
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        try:
            ip = ipaddress.ip_address(socket.gethostbyname(hostname))
        except OSError:
            raise HTTPException(400, "URL host could not be resolved")
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
        raise HTTPException(400, "URL host is not allowed")


def fetch_title(url: str) -> str | None:
    """Resolve the source page title via yt-dlp (metadata only, no download)."""
    try:
        result = subprocess.run(
            [
                sys.executable, "-m", "yt_dlp",
                "--no-playlist",
                "--js-runtimes", "node",
                "--remote-components", "ejs:github",
                "--user-agent", YT_DLP_UA,
                "--no-download", "--print", "%(title)s",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        title = (result.stdout or "").strip().splitlines()
        return title[0][:200] if title else None
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


async def download_video(url: str, video_id: str) -> Path:
    _validate_download_url(url)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(settings.upload_dir / f"{video_id}.%(ext)s")

    # YouTube radio links include a `list=RD...` parameter. Keep the selected
    # video instead of letting yt-dlp expand the entire radio playlist.
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if parsed.hostname and parsed.hostname.lower() in {"youtube.com", "www.youtube.com", "m.youtube.com"} and query.get("v"):
        url = urlunparse(parsed._replace(query=urlencode({"v": query["v"][0]})))

    base_args = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist",
        "--js-runtimes", "node",
        "--remote-components", "ejs:github",
        "--user-agent", YT_DLP_UA,
        "--add-header", "Accept-Language:en-US,en;q=0.9",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "-o", output_template,
    ]

    # YouTube occasionally bot-blocks the default client with HTTP 403 or
    # challenge failures. Retry once with alternate player clients first.
    attempts = [
        base_args + [url],
        base_args + ["--extractor-args", "youtube:player_client=default,android_vr,tv", url],
    ]

    last_detail = "unknown downloader error"
    for attempt in attempts:
        try:
            subprocess.run(attempt, check=True, capture_output=True, text=True, timeout=settings.download_timeout_s)
            break
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or e.stdout or "unknown downloader error").strip()
            last_detail = detail[-2000:]
            if not any(m in detail.lower() for m in TRANSIENT_MARKERS):
                raise HTTPException(500, "yt-dlp failed")
            logger.warning("yt-dlp transient failure on attempt 1, retrying: %s", detail[-300:])
        except subprocess.TimeoutExpired:
            raise HTTPException(500, "Download timed out")
        except FileNotFoundError:
            raise HTTPException(500, "yt-dlp is not installed or is not available on PATH")
    else:
        raise HTTPException(500, "yt-dlp failed")

    for f in settings.upload_dir.iterdir():
        if f.stem.startswith(video_id) and f.suffix in (".mp4", ".mkv", ".webm"):
            return f
    raise HTTPException(500, "Downloaded file not found")


def extract_audio(video_path: Path, video_id: str) -> Path:
    audio_path = settings.upload_dir / f"{video_id}.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-nostdin",
            "-i", str(video_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(audio_path),
        ],
        check=True,
        capture_output=True,
        timeout=settings.download_timeout_s,
    )
    return audio_path


def transcribe(audio_path: Path, target_language: str = "en") -> tuple[list[SegmentOut], str]:
    model = get_whisper()

    # Whisper ships a built-in X→English translation task. Defaulting the
    # transcript to English means any-language videos come out readable.
    if (target_language or "").strip().lower() == "en":
        result = model.transcribe(str(audio_path), task="translate", word_timestamps=True)
        lang = "en"
    else:
        result = model.transcribe(str(audio_path), task="transcribe", word_timestamps=True)
        lang = result.get("language", "en")

    segments = []
    for seg in result["segments"]:
        segments.append(SegmentOut(
            start=seg["start"],
            end=seg["end"],
            speaker="",
            language=lang,
            text=seg["text"].strip(),
            confidence=seg.get("confidence", 0.0),
        ))

    return segments, lang


def assign_speakers(audio_path: Path, segments: list[SegmentOut], duration: float) -> None:
    pipeline = get_diarization()
    if pipeline is None:
        return

    try:
        diarization = pipeline({"uri": "audio", "audio": str(audio_path)})
    except Exception as e:  # noqa: BLE001
        logger.warning("Diarization failed, skipping speaker assignment: %s", e)
        return

    speaker_turns = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speaker_turns.append({
            "start": turn.start,
            "end": turn.end,
            "speaker": speaker,
        })

    if not speaker_turns:
        return

    for seg in segments:
        overlaps: dict[str, float] = {}
        for turn in speaker_turns:
            overlap_start = max(seg.start, turn["start"])
            overlap_end = min(seg.end, turn["end"])
            overlap = max(0.0, overlap_end - overlap_start)
            if overlap > 0:
                spk = turn["speaker"]
                overlaps[spk] = overlaps.get(spk, 0.0) + overlap

        if overlaps:
            best = max(overlaps, key=overlaps.get)
            seg.speaker = best


def get_duration(path: Path) -> float:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return float(result.stdout.strip())
    except Exception:  # noqa: BLE001
        # Fallback: parse ffmpeg's duration line, "Duration: 00:01:23.45, ...".
        try:
            result = subprocess.run(
                ["ffmpeg", "-i", str(path)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            for line in result.stderr.splitlines():
                line = line.strip()
                if line.startswith("Duration:"):
                    dur = line.split(",")[0].replace("Duration:", "").strip()
                    h, m, s = dur.split(":")
                    return int(h) * 3600 + int(m) * 60 + float(s)
        except Exception:  # noqa: BLE001
            pass
        return 0.0


def slug(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = s.strip("_")
    return s[:48]


STOP_WORDS = {
    "this", "that", "with", "from", "have", "been", "were", "what",
    "when", "where", "which", "their", "them", "about", "would",
    "could", "should", "there", "other", "more", "some", "such",
    "also", "than", "then", "very", "just", "like", "into", "over",
    "after", "before", "between", "through", "during", "without",
    "because", "these", "those", "while", "well", "back", "still",
    "here", "there", "each", "both", "much", "many", "most", "few",
    "only", "really", "actually", "basically", "essentially",
}


def extract_keyword_fallback(full_text: str) -> list[tuple[str, int]]:
    """Regex/Counter fallback for TF-IDF keyword extraction failures."""
    words = re.findall(r"\b[a-zA-Z]{4,}\b", full_text.lower())
    common = [w for w in words if w not in STOP_WORDS]
    return Counter(common).most_common(20)


def find_timestamp(word: str, seg_lookup: list[tuple[float, str]]) -> float | None:
    """Return the timestamp of the first segment containing ``word``."""
    for ts, text in seg_lookup:
        if word.lower() in text:
            return ts
    return None


def translate_segments_sync(
    segments: list[SegmentOut], target_language: str
) -> list[SegmentOut] | None:
    """Translate transcribed segments to a target language via the LLM.

    Used when the requested transcript language is not English (Whisper's
    translation task is English-only). Returns None when no LLM is available.
    """
    if not segments:
        return None
    from app.services.llm import call_llm

    texts = [s.text for s in segments]
    batch_text = "\n".join(f"[{i}] {t}" for i, t in enumerate(texts))
    system = (
        f"You are a professional translator. Translate the following transcript lines "
        f"into {target_language} (language code: {target_language}). Respond with each "
        f"line in the exact format '[index] translation', preserving the numbering. "
        f"Output only the translations, no explanations."
    )

    try:
        translated = asyncio.run(call_llm(system, batch_text))
    except Exception as e:  # noqa: BLE001
        logger.warning("LLM translation failed: %s", e)
        return None

    if not translated:
        return None

    translated_map: dict[int, str] = {}
    for line in translated.strip().split("\n"):
        m = re.match(r"^\[(\d+)\]\s*(.*)", line.strip())
        if m:
            translated_map[int(m.group(1))] = m.group(2).strip()

    out = []
    for i, seg in enumerate(segments):
        out.append(SegmentOut(
            start=seg.start,
            end=seg.end,
            speaker=seg.speaker,
            language=target_language,
            text=translated_map.get(i, seg.text),
            confidence=seg.confidence,
        ))
    return out