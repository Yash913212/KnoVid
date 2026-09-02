# KnoVid

KnoVid turns videos into searchable knowledge. Upload a file or paste a URL to
get a speaker-aware transcript, a knowledge graph, auto-detected chapters, a
concept diffusion map, summaries, study notes, quizzes, translation, and
grounded Q&A in one workspace.

## Stack

| Service | Stack | Port | Role |
| --- | --- | ---: | --- |
| `frontend/` | React 19, Vite, Tailwind 4 | `5173` | Dashboard, player, transcript, chapters, concept diffusion, graph, Q&A |
| `backend/` | Node 20+, Express, TypeScript | `3001` | API, Supabase Auth, persistence, BullMQ worker |
| `processing-service/` | Python 3.12/3.13, FastAPI (modular: routers / services / schemas / core) | `8000` | Downloading, transcription, diarization, chapter segmentation, analysis, generation |

The services run natively. Docker is not required.

## How it works

```text
Browser :5173
    │  Vite proxy /api
    ▼
Backend :3001 ── Supabase Auth + Postgres
    │          └─ Redis + BullMQ
    │               └─ video worker
    ▼
Processing service :8000
    ├─ yt-dlp + ffmpeg       ingest and audio extraction
    ├─ Whisper                transcription
    ├─ pyannote               optional speaker diarization
    ├─ spaCy + TF-IDF         entities, topics, keywords, graph
    ├─ sliding-window TF-IDF  semantic chapter auto-segmentation
    └─ OpenAI-compatible LLM summary, notes, quiz, chat, translation
```

Both uploads and URL submissions enqueue the same processing pipeline:

1. The backend creates a queued video row in Supabase and adds a BullMQ job.
2. The worker calls `/process` (transcript + chapters), then `/analyze`, then
   generates a summary. Chapters are persisted to the new `video_chapters`
   table.
3. The frontend polls the video status and displays progress or a retryable
   error.
4. Notes, quizzes, chat, translation, exports, the chapter rail, and the concept
   diffusion map use the saved transcript and graph.

## Requirements

- Node.js 20+
- Python 3.12
- Redis, local or hosted
- A Supabase project
- `ffmpeg`, `ffprobe`, and `yt-dlp` on `PATH`
- Optional: a Hugging Face token for pyannote speaker labels
- Optional: an OpenAI-compatible LLM endpoint or local Ollama

## Setup

```bash
npm run install:all
npm run setup:python
npm run setup:spacy

cp backend/.env.example backend/.env
cp processing-service/.env.example processing-service/.env
cp frontend/.env.example frontend/.env.local
```

Run the SQL in [`backend/supabase/schema.sql`](backend/supabase/schema.sql) in
the Supabase SQL editor before starting the backend. It creates the video,
transcript, graph, and generated-content tables with row-level security.

Then start all services:

```bash
npm run dev
```

Or start them individually:

```bash
npm run dev:backend
npm run dev:processor
npm run dev:frontend
```

## Environment

Backend variables live in `backend/.env`:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public key used by auth helpers |
| `SUPABASE_SECRET_KEY` | Server-only `sb_secret_...` key for persistence and worker writes |
| `SUPABASE_SERVICE_ROLE_KEY` | Older alias for the server-only key |
| `SUPABASE_JWKS_URL` | Supabase JWT verification endpoint |
| `REDIS_URL` | Redis connection string |
| `UPLOAD_DIR` | Shared upload/download directory; defaults to `./uploads` |
| `PROCESSING_SERVICE_URL` | FastAPI base URL; defaults to `http://localhost:8000` |
| `PROCESSING_AUTH_TOKEN` | Shared secret sent as `X-Processing-Auth`; must match the service's token. Leave empty to skip auth (local dev) |
| `PROCESSING_TIMEOUT_MS` | Timeout for the transcription pipeline call; defaults to `600000` |

Frontend variables live in `frontend/.env.local`:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key |
| `VITE_API_URL` | Optional API base URL; defaults to `/api` |

Never expose `SUPABASE_SERVICE_ROLE_KEY` in the frontend or commit a real
`.env` file. Supabase Auth owns sessions; the frontend refreshes the session
and sends its access token to the backend as a Bearer token.

Processing variables are documented in
[`processing-service/.env.example`](processing-service/.env.example), including
`WHISPER_MODEL`, `HF_TOKEN`, `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`, Ollama
fallback settings, `MAX_VIDEO_DURATION_S`, and `PROCESSING_AUTH_TOKEN`. The
config auto-detects OpenRouter keys (`sk-or-v1-...`) and defaults
`LLM_API_URL` to `https://openrouter.ai/api/v1`; set `LLM_MODEL` to a free
tier model such as `nvidia/nemotron-3.5-lightning:free`. When the token is set
there, the backend must be configured with the same value.

## API

All routes below are under `http://localhost:3001/api`. Protected routes use a
Supabase access token in `Authorization: Bearer <token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create a Supabase Auth account |
| `POST` | `/auth/login` | Sign in and return an access token |
| `POST` | `/videos/upload` | Upload a video as multipart field `video` |
| `POST` | `/videos/url` | Queue a video URL |
| `POST` | `/videos/:id/retry` | Retry a failed job |
| `GET` | `/videos` or `/videos/:id` | List or fetch videos |
| `GET` | `/transcripts/:videoId` | Fetch transcript segments |
| `GET` | `/chapters/:videoId` | Fetch auto-detected semantic chapters |
| `GET` | `/graphs/:videoId` | Fetch knowledge graph nodes and edges |
| `POST` | `/generate` | Generate summary, notes, or quiz |
| `POST` | `/generate/chat/:videoId` | Ask a question about a video |
| `POST` | `/generate/fuse/:videoId` | Connect two graph concepts |
| `GET` | `/generate/export/:videoId/:format` | Export Markdown or JSON |
| `POST` | `/translate` | Translate transcript and graph labels |
| `GET` | `/files/<name>` | Serve uploaded media. Requires a Supabase session (Bearer header or `?token=` query param) and verifies the file belongs to the caller |
| `GET` | `/health` | Backend liveness check |

FastAPI documentation is available at
[`http://localhost:8000/docs`](http://localhost:8000/docs).

## Development checks

```bash
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix frontend run lint
```

## Current status

Implemented:

- Supabase Auth and Postgres persistence
- Upload and URL ingestion through one BullMQ pipeline
- Whisper transcription with optional diarization
- Knowledge graph generation
- Summary, notes, quiz, chat, translation, and Markdown/JSON export
- Transcript search and SRT/VTT subtitle export
- Retryable processing failures with visible error messages
- Responsive reduced-motion-aware frontend UI
- Semantic chapter auto-segmentation with a click-to-seek chapter rail (the
  transcript tab shows proportional blocks over each chapter's approximate
  duration; the segment under the playhead highlights live)
- Timeline concept diffusion map (a 48-bucket density timeline of the top
  concepts from the knowledge graph overlaid on the transcript, with
  click-to-seek and a live playhead)
- LLM generation that works with a free OpenRouter tier
  (`nvidia/nemotron-3.5-lightning:free` by default) and falls back to a local
  Ollama model when OpenRouter is unavailable or out of credit

Next:

- PDF/DOCX export
- Editable transcript synchronized with playback
- Cross-video full-text search
- Sentiment and filler-word analysis
- Speaker renaming
