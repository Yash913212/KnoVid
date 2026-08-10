# KnoVid — Video to Knowledge

Turn any video or lecture into a searchable transcript with speaker labels, a
knowledge graph, summaries/notes/quizzes, and interactive Q&A.

Three services, all run **natively — no Docker**:

| Service | Stack | Port | Purpose |
| --- | --- | --- | --- |
| `backend/` | Node 20+ / Express / TypeScript | `:3001` | REST API, JWT auth, MongoDB, BullMQ + Redis job queue |
| `processing-service/` | Python 3.12 / FastAPI | `:8000` | Whisper transcription, pyannote diarization, spaCy + TF-IDF knowledge graph, LLM generation/chat/translation, yt-dlp + ffmpeg |
| `frontend/` | React 19 / Vite / Tailwind 4 | `:5173` | Dashboard, video player, transcript, graph views (react-flow / vis-network) |

## Quick start

```bash
# install dependencies
npm run install:all          # backend + frontend node_modules
npm run setup:python         # processing-service Python deps
npm run setup:spacy          # spaCy English model

# env files (each service has a .env.example — never commit .env)
cp backend/.env.example backend/.env
cp processing-service/.env.example processing-service/.env
cp frontend/.env.example frontend/.env

# start everything
npm run dev
```

Individual services: `npm run dev:backend`, `npm run dev:processor`,
`npm run dev:frontend`.

Requires local **MongoDB** and **Redis** (or free-tier MongoDB Atlas / Upstash),
plus **yt-dlp** and **ffmpeg** on PATH.

## How it works

```
Browser ─> frontend (:5173, proxies /api) ─> backend (:3001)
                                             ├─ MongoDB (users, videos, transcripts, graphs, generated content)
                                             ├─ Redis + BullMQ (video-processing queue)
                                             └─ videoWorker ─> processing-service (:8000)
                                                                 ├─ yt-dlp / ffmpeg   — ingest + audio extraction
                                                                 ├─ Whisper           — transcription
                                                                 ├─ pyannote          — speaker diarization (optional)
                                                                 ├─ spaCy + TF-IDF    — entities/keywords/topics → knowledge graph
                                                                 └─ LLM               — summary / notes / quiz / chat / translate
```

1. A video is **uploaded** or **pasted as a URL** — both enqueue the same BullMQ job.
2. The worker calls the processing service: `/process` (transcribe + speakers)
   then `/analyze` (knowledge graph), persisting results to MongoDB.
3. The frontend polls video status
   (`queued → downloading → processing → analyzing → done | failed`) and shows
   `errorMessage` + a Retry button on failure.
4. Summary/notes/quiz, chat Q&A, and translation hit the LLM endpoint; without
   an `LLM_API_KEY` they degrade to template fallbacks so the UI still works.

## Env variables

| Var | Service | Purpose |
| --- | --- | --- |
| `PORT` | backend | HTTP port (default `3001`) |
| `MONGODB_URI` | backend | Mongo connection string |
| `REDIS_URL` | backend | Redis connection string |
| `JWT_SECRET` | backend | JWT signing secret — long random string outside dev |
| `UPLOAD_DIR` | backend | Upload storage dir (default `./uploads`) |
| `PROCESSING_SERVICE_URL` | backend | Base URL of the FastAPI service |
| `WHISPER_MODEL` | processing | `tiny`/`base`/`small`/`medium`/`large` (downloaded on first use) |
| `HF_TOKEN` | processing | HuggingFace token for pyannote diarization (optional; skip → no speaker labels) |
| `LLM_API_URL` | processing | OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama…) |
| `LLM_API_KEY` | processing | API key (optional; template fallbacks without it) |
| LLM_MODEL | Primary model name, currently Claude through OpenRouter |
| OLLAMA_ENABLED | Enable local Ollama fallback |
| OLLAMA_API_URL | Ollama OpenAI-compatible endpoint |
| OLLAMA_MODEL | Local fallback model, default qwen3:8b |
| `CORS_ORIGINS` | processing | Comma-separated allowed origins (default `http://localhost:5173`) |
| `VITE_API_URL` | frontend | Optional; defaults to `/api` via the Vite dev proxy |

## Python dependency notes

`requirements.txt` is validated on **Python 3.12 + torch 2.2.x**.

- `numpy` is pinned `<2` — torch 2.2 / numba / spaCy's thinc break with numpy 2.x.
- `openai-whisper` is a source tarball whose build needs `pkg_resources`; install
  with `--no-build-isolation` (the root `setup:python` script does this).
- Whisper's CUDA path needs a `triton` matching your torch version
  (e.g. `pip install "triton==2.2.0"` for torch 2.2) — a mismatch shows up as a
  `JITCallable._set_src()` error during transcription.
- pyannote diarization only loads when `HF_TOKEN` is set; transcription and
  everything else work without it.

## API surface

Backend (`:3001`):

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` · `POST /api/auth/login` | — | JWT auth (7-day token) |
| `POST /api/videos/upload` | JWT | Upload a video file (multipart field `video`) |
| `POST /api/videos/url` | JWT | Ingest a video URL (yt-dlp) |
| `POST /api/videos/:id/retry` | JWT | Re-queue a failed video |
| `GET /api/videos` · `GET /api/videos/:id` | JWT | List / fetch videos (incl. status) |
| `GET /api/transcripts/:videoId` | JWT | Transcript segments |
| `GET /api/graphs/:videoId` | JWT | Knowledge graph nodes/edges |
| `POST /api/generate` | JWT | Generate `summary` / `notes` / `quiz` |
| `POST /api/generate/chat/:videoId` | JWT | Q&A against the transcript |
| `POST /api/generate/fuse/:videoId` | JWT | Node Fusion — synthesize a grounded connection between two concepts |
| `GET /api/generate/export/:videoId/:format` | JWT | Export (`markdown` / `json`) |
| `POST /api/translate` | JWT | Translate transcript segments + graph labels |
| `GET /api/files/<name>` | — | Serve uploaded video files for playback |
| `GET /api/health` | — | Liveness check |

Processing service (`:8000`): auto-generated docs at
[http://localhost:8000/docs](http://localhost:8000/docs) (OpenAPI/Swagger).

## Troubleshooting

- **Backend can't reach MongoDB/Redis/processor** — if `localhost` resolves to
  `127.0.1.1`/`::1` on your machine but the services bind `127.0.0.1`, use
  `127.0.0.1` in `MONGODB_URI`, `REDIS_URL`, and `PROCESSING_SERVICE_URL`.
- **Upload returns 500 "No file provided"** — the upload dir is created on
  startup, but check `UPLOAD_DIR` is writable.
- **`duration` is 0** — `ffprobe` may be missing/broken; `get_duration` falls
  back to parsing `ffmpeg -i` output.
- **YouTube URLs fail to download** — YouTube bot-checks can block yt-dlp
  without cookies; pass `--cookies-from-browser` or use a direct video URL.
- **Retried jobs never process** — BullMQ won't re-queue a job re-added with the
  same `jobId`; the retry endpoint removes the old job first.

## Status

- **Done:** Phase 0 (housekeeping), Phase A (core pipeline hardening), and
  Phase C (motion/UI polish) — upload + URL ingestion share one worker
  pipeline; transcribe → diarize → graph runs unattended; generation/chat/
  translate verified against a real transcript; auth works; failures surface
  with `errorMessage` and are retryable; transcript search, SRT/VTT subtitle
  export, and a premium reduced-motion-aware UI polish are live in the
  frontend.
- **Next:** Phase B remainder — PDF/DOCX export, editable transcript synced to
  video playback, cross-video full-text search; Phase D — chapter segmentation,
  sentiment + filler-word highlighting, speaker renaming.
