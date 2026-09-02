import { Job } from "bullmq";
import { updateVideo, upsertChapters, upsertGenerated, upsertGraph, upsertTranscript } from "../db/repository.js";
import type { VideoStatus } from "../models/Video.js";
import { createVideoWorker } from "../config/queue.js";
import { config, processingHeaders } from "../config/index.js";

async function setStatus(
  videoId: string,
  status: VideoStatus,
  extra: { duration?: number; errorMessage?: string | null } = {}
) {
  await updateVideo(videoId, { status, ...extra });
}

function ts() { return new Date().toISOString(); }
function logStage(videoId: string, stage: string, extra?: string) {
  console.log(`[${ts()}] [${videoId}] ▶ ${stage}${extra ? ` — ${extra}` : ''}`);
}
function logOk(videoId: string, stage: string, ms: number, extra?: string) {
  console.log(`[${ts()}] [${videoId}] ✓ ${stage} (${ms}ms)${extra ? ` — ${extra}` : ''}`);
}
function logWarn(videoId: string, stage: string, msg: string) {
  console.warn(`[${ts()}] [${videoId}] ⚠ ${stage}: ${msg}`);
}
function logErr(videoId: string, stage: string, err: unknown) {
  const e: any = err;
  console.error(`[${ts()}] [${videoId}] ✗ ${stage} FAILED:`, e?.message || e);
  if (e?.stack) console.error(e.stack);
  if (e?.cause) console.error('Cause:', e.cause);
}

export async function processVideo(job: Job) {
  const { videoId, type, url, filePath, targetLanguage } = job.data;
  const started = Date.now();
  console.log(`\n[${ts()}] ═══ Processing video ${videoId} (${type}) — job ${job.id} attempt ${job.attemptsMade + 1} ═══`);
  console.log(`[${ts()}] [${videoId}] payload:`, JSON.stringify({ type, url: url ? url.slice(0,120) : undefined, filePath, targetLanguage, processingUrl: config.processingServiceUrl, timeoutMs: config.processingTimeoutMs }));

  try {
    logStage(videoId, 'downloading → /process');
    await setStatus(videoId, "downloading");

    const payload: Record<string, string> = { videoId };
    if (targetLanguage) payload.targetLanguage = targetLanguage;
    if (type === "url" && url) payload.url = url;
    else if (type === "upload" && filePath) payload.filePath = filePath;

    const t0 = Date.now();
    const resp = await fetch(`${config.processingServiceUrl}/process`, {
      method: "POST",
      headers: processingHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.processingTimeoutMs),
    });
    const tProcess = Date.now() - t0;

    if (!resp.ok) {
      const errText = await resp.text();
      logErr(videoId, '/process', new Error(`HTTP ${resp.status} ${resp.statusText} — ${errText.slice(0,2000)}`));
      throw new Error(`Transcription failed [${resp.status}]: ${errText.slice(0,1000)}`);
    }

    const result = await resp.json();
    logOk(videoId, '/process', tProcess, `lang=${result.language} segments=${result.segments?.length ?? 0} chapters=${result.chapters?.length ?? 0} duration=${result.duration ?? '?'}s title=${(result.title||'').slice(0,80)}`);
    await job.updateProgress(50);
    console.log(`[${ts()}] [${videoId}] ↳ job progress 50%`);

    if (result.filePath || result.title) {
      const patch: Parameters<typeof updateVideo>[1] = {};
      if (result.filePath) patch.filePath = result.filePath;
      if (result.title) patch.originalName = result.title;
      await updateVideo(videoId, patch);
      console.log(`[${ts()}] [${videoId}] ↳ video row patched:`, patch);
    }

    logStage(videoId, 'upsertTranscript', `segments=${result.segments?.length ?? 0}`);
    await upsertTranscript(videoId, result.language, result.segments);
    console.log(`[${ts()}] [${videoId}] ✓ transcript saved`);

    if (Array.isArray(result.chapters) && result.chapters.length > 0) {
      logStage(videoId, 'upsertChapters', `count=${result.chapters.length}`);
      await upsertChapters(videoId, result.chapters);
      console.log(`[${ts()}] [${videoId}] ✓ chapters saved:`, result.chapters.map((c:any)=> `${c.title} @${c.start_time}s`).join(' | ').slice(0,400));
    } else {
      console.log(`[${ts()}] [${videoId}] ↳ no chapters in /process response (old service?)`);
    }

    logStage(videoId, 'analyzing → /analyze');
    await setStatus(videoId, "analyzing");
    const t1 = Date.now();
    const analyzeResp = await fetch(`${config.processingServiceUrl}/analyze`, {
      method: "POST",
      headers: processingHeaders(),
      body: JSON.stringify({ videoId, segments: result.segments }),
      signal: AbortSignal.timeout(300000),
    });
    const tAnalyze = Date.now() - t1;

    if (analyzeResp.ok) {
      const graphData = await analyzeResp.json();
      logOk(videoId, '/analyze', tAnalyze, `nodes=${graphData.nodes?.length ?? 0} edges=${graphData.edges?.length ?? 0}`);
      await upsertGraph(videoId, graphData.nodes, graphData.edges);
      console.log(`[${ts()}] [${videoId}] ✓ graph saved`);
    } else {
      const errText = await analyzeResp.text();
      logWarn(videoId, '/analyze', `HTTP ${analyzeResp.status} ${analyzeResp.statusText} — ${errText.slice(0,1000)} — transcript still usable`);
    }

    logStage(videoId, 'summarizing → /generate (OpenRouter)');
    await setStatus(videoId, "summarizing");
    const t2 = Date.now();
    const sumResp = await fetch(`${config.processingServiceUrl}/generate`, {
      method: "POST",
      headers: processingHeaders(),
      body: JSON.stringify({ videoId, segments: result.segments, type: "summary" }),
      signal: AbortSignal.timeout(300000),
    });
    const tSum = Date.now() - t2;

    if (sumResp.ok) {
      const sumData = await sumResp.json();
      logOk(videoId, '/generate summary', tSum, `chars=${sumData.content?.length ?? 0} format=${sumData.format}`);
      await upsertGenerated(videoId, "summary", sumData.content, sumData.format || "markdown");
      console.log(`[${ts()}] [${videoId}] ✓ summary saved — preview:`, (sumData.content||'').slice(0,300).replace(/\n/g,' ') + '…');
    } else {
      const errText = await sumResp.text();
      logWarn(videoId, '/generate summary', `HTTP ${sumResp.status} — ${errText.slice(0,1000)} — check LLM_API_KEY / OpenRouter credits`);
    }

    await job.updateProgress(100);
    const totalMs = Date.now() - started;
    await setStatus(videoId, "done", { duration: result.duration ?? 0, errorMessage: null });
    console.log(`[${ts()}] [${videoId}] ✅ DONE total ${totalMs}ms (${(totalMs/1000).toFixed(1)}s) duration=${result.duration ?? 0}s\n`);
  } catch (err: any) {
    const totalMs = Date.now() - started;
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
    logErr(videoId, `pipeline after ${totalMs}ms (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}, last=${isLastAttempt})`, err);
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      console.error(`[${ts()}] [${videoId}] → Timeout: processing-service at ${config.processingServiceUrl} did not respond in ${config.processingTimeoutMs}ms — video too long or Whisper busy? Try WHISPER_MODEL=tiny`);
    }
    if (err?.cause) console.error(`[${ts()}] [${videoId}] cause:`, err.cause);
    await setStatus(videoId, "failed", { errorMessage: err.message?.slice(0,500) || String(err).slice(0,500) });
    if (!isLastAttempt) throw err;
  }
}

export function startVideoWorker() {
  const worker = createVideoWorker(processVideo);

  worker.on("active", (job) => {
    console.log(`[${new Date().toISOString()}] [${job.data?.videoId}] … job ${job.id} ACTIVE (attempt ${job.attemptsMade + 1})`);
  });
  worker.on("progress", (job, progress) => {
    console.log(`[${new Date().toISOString()}] [${job.data?.videoId}] … progress ${JSON.stringify(progress)} (job ${job.id})`);
  });
  worker.on("completed", (job) => {
    console.log(`[${new Date().toISOString()}] [${job.data?.videoId}] ✔ job ${job.id} COMPLETED`);
  });
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const videoId = job.data?.videoId;
    console.error(`[${new Date().toISOString()}] [${videoId}] ✗ job ${job.id} FAILED:`, err?.message || err);
    if (err?.stack) console.error(err.stack);
    if (!videoId) return;
    // Backstop in case the handler itself threw before marking the video failed.
    await updateVideo(videoId, {
      status: "failed",
      errorMessage: (err?.message || "Processing failed").slice(0,500),
    }).catch((updateErr) => console.error("Failed to mark video failed", updateErr));
  });

  worker.on("error", (err: any) => {
    // BullMQ/ioredis surfaces AggregateError with .errors array when Redis is down.
    // Unwrap to show the real cause instead of just "AggregateError".
    const parts: string[] = [];
    if (err?.errors?.length) {
      for (const e of err.errors) parts.push(e?.message || String(e));
    }
    const detail =
      parts.join(" | ") ||
      err?.message ||
      err?.name ||
      (typeof err === "string" ? err : JSON.stringify(err)) ||
      "Unknown worker error";
    console.error(`[${new Date().toISOString()}] Video worker error:`, detail);
    if (detail.includes("greater or equal than 5.0.0")) {
      console.error(
        "→ BullMQ requires Redis ≥5.0. The MSOpenTech Redis 3.0.504 for Windows is too old. Use Upstash (rediss://...) in backend/.env — or install Memurai 4.x / WSL Ubuntu redis-server 7. No Docker needed. See backend/.env REDIS_URL."
      );
    } else if (detail.includes("ECONNREFUSED") || detail.includes("6379") || detail.includes("Redis")) {
      console.error(
        "→ Redis is unreachable at",
        config.redisUrl,
        "— start Redis locally or set REDIS_URL in backend/.env to a hosted instance (e.g. Upstash). See README Environment."
      );
    }
    if (err?.stack) console.error(err.stack);
    if (err?.errors) console.error("Aggregate errors:", err.errors);
  });

  console.log(`[${new Date().toISOString()}] Video worker started (queue: video-processing, concurrency: 2, redis: ${config.redisUrl}, processing: ${config.processingServiceUrl})`);
  return worker;
}
