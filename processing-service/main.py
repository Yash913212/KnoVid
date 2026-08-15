import os
import re
import sys
import secrets
import socket
import ipaddress
import subprocess
import asyncio
from pathlib import Path
from collections import Counter
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

app = FastAPI(title="KnoVid Processing Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve uploads relative to this file so it works regardless of CWD.
DEFAULT_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "backend" / "uploads"
load_dotenv(Path(__file__).with_name(".env"))

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(DEFAULT_UPLOAD_DIR))).resolve()
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
HF_TOKEN = os.getenv("HF_TOKEN", "")

# Optional shared secret. When set, every endpoint requires the backend to
# present it via the X-Processing-Auth header (constant-time comparison).
PROCESSING_AUTH_TOKEN = os.getenv("PROCESSING_AUTH_TOKEN", "")


def require_auth(request: Request):
    if not PROCESSING_AUTH_TOKEN:
        return
    provided = request.headers.get("x-processing-auth", "")
    if not secrets.compare_digest(provided, PROCESSING_AUTH_TOKEN):
        raise HTTPException(401, "Unauthorized")

_whisper_model = None
_diarization_pipeline = None
_nlp = None


def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        import whisper
        _whisper_model = whisper.load_model(MODEL_SIZE)
    return _whisper_model


def get_diarization():
    global _diarization_pipeline
    if _diarization_pipeline is None and HF_TOKEN:
        from pyannote.audio import Pipeline
        _diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=HF_TOKEN,
        )
    return _diarization_pipeline


def get_spacy():
    global _nlp
    if _nlp is None:
        import spacy
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"], check=True)
            _nlp = spacy.load("en_core_web_sm")
    return _nlp


class ProcessRequest(BaseModel):
    videoId: str
    url: str | None = None
    filePath: str | None = None
    # ISO 639-1 target language for the transcript. "en" (default) makes
    # Whisper translate any-language audio straight to English.
    targetLanguage: str = "en"


class SegmentOut(BaseModel):
    start: float
    end: float
    speaker: str
    language: str
    text: str
    confidence: float


class ProcessResponse(BaseModel):
    videoId: str
    status: str
    duration: float
    language: str
    segments: list[SegmentOut]
    filePath: str | None = None
    # Real media title from the source platform (None for uploads).
    title: str | None = None


class AnalyzeRequest(BaseModel):
    videoId: str
    segments: list[SegmentOut]


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    timestampRef: float | None = None
    summary: str | None = None
    metadata: dict = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str


class AnalyzeResponse(BaseModel):
    videoId: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]


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


@app.post("/process", response_model=ProcessResponse)
def process_video(req: ProcessRequest, _auth: None = Depends(require_auth)):
    video_path: Path | None = None
    title: str | None = None

    if req.url:
        video_path = asyncio.run(download_video(req.url, req.videoId))
        title = fetch_title(req.url)
    elif req.filePath:
        video_path = Path(req.filePath)
    else:
        raise HTTPException(400, "Either url or filePath required")

    if not video_path or not video_path.exists():
        raise HTTPException(400, "Video file not found")

    duration = get_duration(video_path)
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

    return ProcessResponse(
        videoId=req.videoId,
        status="done",
        duration=duration,
        language=output_language,
        segments=segments,
        filePath=str(video_path),
        title=title,
    )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_transcript(req: AnalyzeRequest, _auth: None = Depends(require_auth)):
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
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


def extract_entities(
    segments: list[SegmentOut], full_text: str, seen_id: set[str]
) -> dict:
    nlp = get_spacy()
    doc = nlp(full_text)

    node_map: dict[str, GraphNode] = {}
    seg_texts = [(s.start, s.text.lower()) for s in segments]

    for ent in doc.ents:
        if ent.label_ not in ("PERSON", "ORG", "GPE", "LOC", "PRODUCT", "EVENT", "WORK_OF_ART", "LAW"):
            continue

        node_id = slug(ent.text)
        if node_id in seen_id:
            continue
        seen_id.add(node_id)

        ts = find_timestamp(ent.text, seg_texts)
        node_map[node_id] = GraphNode(
            id=node_id,
            label=ent.text,
            type="entity",
            timestampRef=ts,
            summary=f"{ent.label_}: {ent.text}",
            metadata={"entityType": ent.label_},
        )

    return {"nodes": list(node_map.values()), "edges": []}


def extract_keywords(
    segments: list[SegmentOut], full_text: str, seen_id: set[str]
) -> dict:
    from sklearn.feature_extraction.text import TfidfVectorizer

    seg_texts = [s.text for s in segments if s.text.strip()]
    if len(seg_texts) < 2:
        return {"nodes": [], "edges": []}

    try:
        vectorizer = TfidfVectorizer(
            max_features=30,
            stop_words="english",
            ngram_range=(1, 2),
        )
        matrix = vectorizer.fit_transform(seg_texts)
        scores = zip(vectorizer.get_feature_names_out(), matrix.sum(axis=0).tolist()[0])
        top_keywords = sorted(scores, key=lambda x: x[1], reverse=True)[:20]
    except Exception:
        words = re.findall(r"\b[a-zA-Z]{4,}\b", full_text.lower())
        common = [w for w in words if w not in STOP_WORDS]
        top_keywords = Counter(common).most_common(20)

    seg_lookup = [(s.start, s.text.lower()) for s in segments]
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    seen_kw: set[str] = set()
    for kw, _score in top_keywords:
        node_id = slug(kw)
        if node_id in seen_id or node_id in seen_kw:
            continue
        seen_id.add(node_id)
        seen_kw.add(node_id)

        ts = find_timestamp(kw, seg_lookup)
        nodes.append(GraphNode(
            id=node_id,
            label=kw.title(),
            type="keyword",
            timestampRef=ts,
        ))

    return {"nodes": nodes, "edges": edges}


def extract_topics(
    segments: list[SegmentOut], full_text: str, seen_id: set[str]
) -> dict:
    from sklearn.feature_extraction.text import TfidfVectorizer

    seg_texts = [s.text for s in segments if s.text.strip()]
    if len(seg_texts) < 3:
        return {"nodes": [], "edges": []}

    try:
        vectorizer = TfidfVectorizer(
            max_features=50,
            stop_words="english",
            max_df=0.85,
            min_df=1,
        )
        matrix = vectorizer.fit_transform(seg_texts)
        feature_names = vectorizer.get_feature_names_out()

        topic_labels: list[str] = []
        topic_keywords: list[list[str]] = []

        # Each row is a transcript segment and each column is a term. Build
        # compact topic labels from high-signal terms in representative
        # segments; indexing feature names with segment indices produces
        # invalid or misleading topics.
        for topic_idx in range(min(8, matrix.shape[0])):
            row = matrix[topic_idx].toarray().flatten()
            top_indices = row.argsort()[-5:][::-1]
            words = [feature_names[i] for i in top_indices if row[i] > 0.1]
            if words:
                label = ", ".join(words[:3])
                topic_labels.append(label)
                topic_keywords.append(words)
    except Exception:
        return {"nodes": [], "edges": []}

    seg_lookup = [(s.start, s.text.lower()) for s in segments]
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    for i, label in enumerate(topic_labels):
        node_id = f"topic_{i}"
        if node_id in seen_id:
            continue
        seen_id.add(node_id)

        first_word = topic_keywords[i][0] if topic_keywords[i] else label
        ts = find_timestamp(first_word, seg_lookup)
        nodes.append(GraphNode(
            id=node_id,
            label=label[:60],
            type="topic",
            timestampRef=ts,
            summary=f"Topic group: {label}",
        ))

        for kw in topic_keywords[i]:
            kw_id = slug(kw)
            if kw_id in seen_id:
                edges.append(GraphEdge(
                    source=node_id,
                    target=kw_id,
                    relation="includes",
                ))

    return {"nodes": nodes, "edges": edges}


def find_timestamp(word: str, seg_lookup: list[tuple[float, str]]) -> float | None:
    for ts, text in seg_lookup:
        if word.lower() in text:
            return ts
    return None


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


def _validate_download_url(url: str):
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


# Browser-like UA reduces YouTube's bot detection (HTTP 403 on download).
YT_DLP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


async def download_video(url: str, video_id: str) -> Path | None:
    _validate_download_url(url)

    output_dir = UPLOAD_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(output_dir / f"{video_id}.%(ext)s")

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

    transient_markers = ("403", "challenge", "unable to download video data", "Requested format is not available")
    last_detail = "unknown downloader error"
    for attempt in attempts:
        try:
            subprocess.run(attempt, check=True, capture_output=True, text=True, timeout=600)
            break
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or e.stdout or "unknown downloader error").strip()
            last_detail = detail[-2000:]
            if not any(m in detail.lower() for m in transient_markers):
                raise HTTPException(500, f"yt-dlp failed: {last_detail}")
        except subprocess.TimeoutExpired:
            raise HTTPException(500, "Download timed out")
        except FileNotFoundError:
            raise HTTPException(500, "yt-dlp is not installed or is not available on PATH")
    else:
        raise HTTPException(500, f"yt-dlp failed: {last_detail}")

    for f in output_dir.iterdir():
        if f.stem.startswith(video_id) and f.suffix in (".mp4", ".mkv", ".webm"):
            return f
    return None


def extract_audio(video_path: Path, video_id: str) -> Path:
    audio_path = UPLOAD_DIR / f"{video_id}.wav"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(audio_path),
        ],
        check=True,
        capture_output=True,
        timeout=600,
    )
    return audio_path


def transcribe(audio_path: Path, target_language: str = "en") -> tuple[list[SegmentOut], str]:
    model = get_whisper()

    # Whisper ships a built-in X→English translation task. Defaulting the
    # transcript to English means any-language (Telugu, Hindi, Tamil, …)
    # videos come out readable in English — no external LLM required.
    if (target_language or "").strip().lower() == "en":
        result = model.transcribe(str(audio_path), task="translate", word_timestamps=True)
        lang = "en"
    else:
        # Non-English target: transcribe in the source language first; the
        # caller translates to the requested language via an LLM when available.
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


def translate_segments_sync(
    segments: list[SegmentOut], target_language: str
) -> list[SegmentOut] | None:
    """Translate transcribed segments to a target language via the LLM.

    Used when the requested transcript language is not English (Whisper's
    translation task is English-only). Returns None when no LLM is available.
    """
    if not segments:
        return None

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
    except Exception as e:
        print(f"LLM translation failed: {e}")
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


def assign_speakers(audio_path: Path, segments: list[SegmentOut], duration: float):
    pipeline = get_diarization()
    if pipeline is None:
        return

    try:
        diarization = pipeline({"uri": "audio", "audio": str(audio_path)})
    except Exception as e:
        print(f"Diarization failed, skipping speaker assignment: {e}")
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
        overlaps = {}
        for turn in speaker_turns:
            overlap_start = max(seg.start, turn["start"])
            overlap_end = min(seg.end, turn["end"])
            overlap = max(0, overlap_end - overlap_start)
            if overlap > 0:
                spk = turn["speaker"]
                overlaps[spk] = overlaps.get(spk, 0) + overlap

        if overlaps:
            best = max(overlaps, key=overlaps.get)
            seg.speaker = best


def get_duration(path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "csv=p=0",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return float(result.stdout.strip())
    except Exception:
        # Fallback for systems where ffprobe is unavailable or broken: parse
        # ffmpeg's own duration line, e.g. "Duration: 00:01:23.45, start: ...".
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
        except Exception:
            pass
        return 0.0


class GenerateRequest(BaseModel):
    videoId: str
    segments: list[SegmentOut]
    type: str  # summary | notes | quiz


class ChatRequest(BaseModel):
    videoId: str
    segments: list[SegmentOut]
    question: str


class GenerateResponse(BaseModel):
    videoId: str
    type: str
    content: str
    format: str = "markdown"


class ChatResponse(BaseModel):
    videoId: str
    answer: str


class FuseCitation(BaseModel):
    time: float
    speaker: str
    text: str


class FuseRequest(BaseModel):
    videoId: str
    segments: list[SegmentOut]
    a: str  # concept A label
    b: str  # concept B label


class FuseResponse(BaseModel):
    videoId: str
    explanation: str
    citations: list[FuseCitation]


LLM_API_URL = os.getenv("LLM_API_URL", "https://api.openai.com/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
OLLAMA_ENABLED = os.getenv("OLLAMA_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://localhost:11434/v1")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "ollama")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")


def llm_available() -> bool:
    """True when at least one LLM provider (OpenRouter or Ollama) is configured."""
    return bool(LLM_API_KEY) or OLLAMA_ENABLED


async def _call_provider(
    client,
    provider: str,
    url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
) -> str | None:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    if provider == "Ollama":
        payload["reasoning_effort"] = "none"

    resp = await client.post(
        f"{url.rstrip('/')}/chat/completions",
        headers=headers,
        json=payload,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    if isinstance(content, str) and content.strip():
        return content
    return None


async def call_llm(system: str, user: str) -> str | None:
    providers = []
    if LLM_API_KEY:
        providers.append(("OpenRouter", LLM_API_URL, LLM_API_KEY, LLM_MODEL))
    if OLLAMA_ENABLED:
        providers.append(("Ollama", OLLAMA_API_URL, OLLAMA_API_KEY, OLLAMA_MODEL))

    if not providers:
        return None

    try:
        import httpx
        async with httpx.AsyncClient(timeout=120) as client:
            for provider, url, api_key, model in providers:
                # Retry once: the first call after a cold start can fail while
                # Ollama is still loading the model (returns an error, not a
                # timeout). A single retry avoids a silent template fallback.
                for attempt in range(2):
                    try:
                        result = await _call_provider(client, provider, url, api_key, model, system, user)
                        if result:
                            return result
                        break
                    except Exception as e:
                        print(f"{provider} call failed (attempt {attempt + 1}/2): {e!r}")
    except Exception as e:
        print(f"LLM client failed: {e!r}")

    return None


def format_transcript(segments: list[SegmentOut]) -> str:
    lines = []
    for s in segments:
        speaker = f"[{s.speaker}] " if s.speaker else ""
        ts = f"{int(s.start//60)}:{int(s.start%60):02d}"
        lines.append(f"({ts}) {speaker}{s.text}")
    return "\n".join(lines)


@app.post("/generate", response_model=GenerateResponse)
async def generate_content(req: GenerateRequest, _auth: None = Depends(require_auth)):
    transcript_text = format_transcript(req.segments)
    full_text = " ".join(s.text for s in req.segments)

    system_prompts = {
        "summary": "You are a study assistant. Summarize the following lecture/transcript concisely, highlighting key concepts, arguments, and conclusions. Format in markdown with bullet points and sections.",
        "notes": "You are a study assistant. Create structured study notes from the following transcript. Extract key terms, definitions, important quotes (with timestamps), and main ideas. Format in markdown with headings and bullet points.",
        "quiz": "You are a quiz creator. Generate 5-10 review questions based on the following transcript. Include a mix of multiple-choice and short-answer questions. Provide an answer key. Format in markdown.",
    }

    prompt = system_prompts.get(req.type)
    if not prompt:
        raise HTTPException(400, f"Unknown generation type: {req.type}")

    llm_content = await call_llm(prompt, transcript_text)
    if llm_content:
        return GenerateResponse(videoId=req.videoId, type=req.type, content=llm_content)

    fallback = template_generate(req.type, full_text, req.segments)
    return GenerateResponse(videoId=req.videoId, type=req.type, content=fallback)


@app.post("/chat", response_model=ChatResponse)
async def chat_with_video(req: ChatRequest, _auth: None = Depends(require_auth)):
    transcript_text = format_transcript(req.segments)

    full_text = " ".join(s.text for s in req.segments)
    relevant = []
    for s in req.segments:
        if any(w.lower() in s.text.lower() for w in req.question.split()):
            relevant.append(s)

    context = format_transcript(relevant[:10]) if relevant else transcript_text[:3000]

    system = "You are a helpful assistant answering questions about a video transcript. Answer concisely using the provided context. If the answer isn't in the transcript, say so."

    llm_answer = await call_llm(system, f"Context:\n{context}\n\nQuestion: {req.question}")
    if llm_answer:
        return ChatResponse(videoId=req.videoId, answer=llm_answer)

    fallback = template_answer(req.question, context, full_text)
    return ChatResponse(videoId=req.videoId, answer=fallback)


def _fuse_context(segments: list[SegmentOut], a: str, b: str) -> list[FuseCitation]:
    """Real evidence: transcript moments where concept A, B, or both appear."""
    a_mentions = [s for s in segments if a.lower() in s.text.lower()]
    b_mentions = [s for s in segments if b.lower() in s.text.lower()]
    b_ids = {id(s) for s in b_mentions}
    both = [s for s in a_mentions if id(s) in b_ids]

    citations: list[FuseCitation] = []
    seen = set()
    for s in both + a_mentions + b_mentions:
        key = (s.start, s.text)
        if key in seen:
            continue
        seen.add(key)
        citations.append(FuseCitation(time=s.start, speaker=s.speaker, text=s.text))
        if len(citations) >= 5:
            break
    return citations


@app.post("/fuse", response_model=FuseResponse)
async def fuse_concepts(req: FuseRequest, _auth: None = Depends(require_auth)):
    citations = _fuse_context(req.segments, req.a, req.b)

    if not citations:
        return FuseResponse(
            videoId=req.videoId,
            explanation=(
                f'"{req.a}" and "{req.b}" never appear in the transcript, so no '
                "connection can be grounded in this video. They may be related by "
                "topic instead — try asking the AI chat about the link."
            ),
            citations=[],
        )

    context_lines = []
    for c in citations:
        speaker = f"[{c.speaker}] " if c.speaker else ""
        ts = f"{int(c.time // 60)}:{int(c.time % 60):02d}"
        context_lines.append(f"({ts}) {speaker}{c.text}")
    context = "\n".join(context_lines)

    system = (
        "You are an analyst for a video knowledge graph. Two concepts from the "
        "video were dragged together on a spatial canvas to be 'fused'. Using ONLY "
        "the transcript moments below, explain how the two concepts are connected "
        "in this specific video. Reference the speaker and timestamp where useful. "
        "Keep it to 2-4 sentences, plain text, no markdown."
    )
    user = (
        f"Concept A: {req.a}\nConcept B: {req.b}\n\n"
        f"Transcript moments where these concepts appear:\n{context}"
    )

    llm_explanation = await call_llm(system, user)
    if llm_explanation:
        return FuseResponse(videoId=req.videoId, explanation=llm_explanation, citations=citations)

    bullets = []
    for c in citations[:3]:
        ts = f"{int(c.time // 60)}:{int(c.time % 60):02d}"
        speaker = c.speaker or "Speaker"
        bullets.append(f"- [{speaker} @ {ts}] {c.text[:140]}")
    return FuseResponse(
        videoId=req.videoId,
        explanation=(
            f'In this video, "{req.a}" and "{req.b}" are discussed close together:\n\n'
            + "\n".join(bullets)
            + "\n\nSet an LLM_API_KEY for a fully synthesized connection."
        ),
        citations=citations,
    )


def template_generate(type_: str, full_text: str, segments: list[SegmentOut]) -> str:
    words = full_text.split()
    sentences = full_text.replace("?", ".").replace("!", ".").split(".")
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]

    if type_ == "summary":
        parts = []
        parts.append(f"# Summary\n")
        parts.append(f"**Duration**: ~{len(segments)} segments, {len(words)} words\n")
        parts.append(f"This video covers approximately {len(sentences)} key statements.\n")
        parts.append("## Key Points\n")
        for s in sentences[:8]:
            parts.append(f"- {s}")
        return "\n".join(parts)

    elif type_ == "notes":
        parts = []
        parts.append("# Study Notes\n")
        parts.append("## Key Terms\n")
        nlp = get_spacy()
        doc = nlp(full_text[:3000])
        seen = set()
        for ent in doc.ents:
            if ent.label_ in ("PERSON", "ORG", "GPE", "CONCEPT") and ent.text.lower() not in seen:
                seen.add(ent.text.lower())
                parts.append(f"- **{ent.text}** ({ent.label_})")
        parts.append("\n## Timestamps\n")
        for s in segments[:15]:
            ts = f"{int(s.start//60)}:{int(s.start%60):02d}"
            speaker = f" [{s.speaker}]" if s.speaker else ""
            parts.append(f"- **{ts}**{speaker}: {s.text}")
        return "\n".join(parts)

    elif type_ == "quiz":
        parts = []
        parts.append("# Quiz\n")
        sentences_q = [s for s in sentences if len(s) > 30][:10]
        for i, s in enumerate(sentences_q[:5]):
            parts.append(f"### Question {i+1}")
            parts.append(f"What is the main idea of this statement: \"{s[:100]}...\"")
            parts.append("")
        parts.append("\n---\n")
        parts.append("*Note: Install an LLM API key for better quiz generation.*")
        return "\n".join(parts)

    return "Content generation requires an LLM provider (set LLM_API_KEY or enable Ollama)."


def template_answer(question: str, context: str, full_text: str) -> str:
    words_in_q = set(question.lower().split())
    scored = []
    for s in full_text.split("."):
        s = s.strip()
        if len(s) < 10:
            continue
        score = sum(1 for w in words_in_q if w in s.lower())
        scored.append((score, s))

    scored.sort(reverse=True)
    top = [s for score, s in scored if score > 0][:3]

    if top:
        return "Based on the transcript:\n\n" + "\n".join(f"- {t}." for t in top)
    return "I couldn't find specific information about that in the transcript. Try rephrasing your question or set LLM_API_KEY / enable Ollama for AI-powered answers."


class TranslateRequest(BaseModel):
    videoId: str
    segments: list[SegmentOut]
    targetLanguage: str
    nodeLabels: dict[str, str] | None = None


class TranslateResponse(BaseModel):
    videoId: str
    targetLanguage: str
    segments: list[SegmentOut]
    nodeLabels: dict[str, str] | None = None


@app.post("/translate", response_model=TranslateResponse)
async def translate_content(req: TranslateRequest, _auth: None = Depends(require_auth)):
    if not llm_available():
        return TranslateResponse(
            videoId=req.videoId,
            targetLanguage=req.targetLanguage,
            segments=req.segments,
            nodeLabels=req.nodeLabels,
        )

    texts_to_translate = [s.text for s in req.segments]
    node_label_items = list((req.nodeLabels or {}).items())
    all_texts = texts_to_translate + [label for _, label in node_label_items]

    batch_text = "\n".join(f"[{i}] {t}" for i, t in enumerate(all_texts))
    system = f"You are a translator. Translate the following numbered texts to {req.targetLanguage}. Respond with each line in the format '[index] translation', preserving the line numbering exactly. Only output the translations, no explanations."
    user = batch_text

    translated = await call_llm(system, user)
    if not translated:
        return TranslateResponse(
            videoId=req.videoId,
            targetLanguage=req.targetLanguage,
            segments=req.segments,
            nodeLabels=req.nodeLabels,
        )

    translated_map: dict[int, str] = {}
    for line in translated.strip().split("\n"):
        m = re.match(r"^\[(\d+)\]\s*(.*)", line.strip())
        if m:
            translated_map[int(m.group(1))] = m.group(2).strip()

    translated_segments: list[SegmentOut] = []
    for i, seg in enumerate(req.segments):
        translated_segments.append(SegmentOut(
            start=seg.start,
            end=seg.end,
            speaker=seg.speaker,
            language=req.targetLanguage,
            text=translated_map.get(i, seg.text),
            confidence=seg.confidence,
        ))

    translated_labels: dict[str, str] | None = None
    if node_label_items:
        translated_labels = {}
        offset = len(texts_to_translate)
        for j, (key, _) in enumerate(node_label_items):
            translated_labels[key] = translated_map.get(offset + j, "")

    return TranslateResponse(
        videoId=req.videoId,
        targetLanguage=req.targetLanguage,
        segments=translated_segments,
        nodeLabels=translated_labels,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
