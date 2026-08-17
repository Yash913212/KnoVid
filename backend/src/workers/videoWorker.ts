import { Job } from "bullmq";
import { updateVideo, upsertGenerated, upsertGraph, upsertTranscript } from "../db/repository.js";
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

export async function processVideo(job: Job) {
  const { videoId, type, url, filePath, targetLanguage } = job.data;
  console.log(`Processing video ${videoId} (${type})`);

  try {
    await setStatus(videoId, "downloading");

    const payload: Record<string, string> = { videoId };
    if (targetLanguage) payload.targetLanguage = targetLanguage;

    if (type === "url" && url) {
      payload.url = url;
    } else if (type === "upload" && filePath) {
      payload.filePath = filePath;
    }

    const resp = await fetch(`${config.processingServiceUrl}/process`, {
      method: "POST",
      headers: processingHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.processingTimeoutMs),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Transcription failed: ${errText}`);
    }

    const result = await resp.json();
    await job.updateProgress(50);

    if (result.filePath || result.title) {
      const patch: Parameters<typeof updateVideo>[1] = {};
      if (result.filePath) patch.filePath = result.filePath;
      if (result.title) patch.originalName = result.title;
      await updateVideo(videoId, patch);
    }

    await upsertTranscript(videoId, result.language, result.segments);

    await setStatus(videoId, "analyzing");

    const analyzeResp = await fetch(`${config.processingServiceUrl}/analyze`, {
      method: "POST",
      headers: processingHeaders(),
      body: JSON.stringify({ videoId, segments: result.segments }),
      signal: AbortSignal.timeout(300000),
    });

    if (analyzeResp.ok) {
      const graphData = await analyzeResp.json();
      await upsertGraph(videoId, graphData.nodes, graphData.edges);
    } else {
      // Non-fatal: the transcript is still usable without a knowledge graph.
      const errText = await analyzeResp.text();
      console.warn(`Graph analysis failed for ${videoId}: ${errText}`);
    }

    await setStatus(videoId, "summarizing");

    const sumResp = await fetch(`${config.processingServiceUrl}/generate`, {
      method: "POST",
      headers: processingHeaders(),
      body: JSON.stringify({ videoId, segments: result.segments, type: "summary" }),
      signal: AbortSignal.timeout(300000),
    });

    if (sumResp.ok) {
      const sumData = await sumResp.json();
      await upsertGenerated(videoId, "summary", sumData.content, sumData.format || "markdown");
    } else {
      const errText = await sumResp.text();
      console.warn(`Summary generation failed for ${videoId}: ${errText}`);
    }

    await job.updateProgress(100);
    await setStatus(videoId, "done", { duration: result.duration ?? 0, errorMessage: null });
  } catch (err: any) {
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
    console.error(`Failed to process video ${videoId}:`, err);
    await setStatus(videoId, "failed", { errorMessage: err.message });
    if (!isLastAttempt) throw err;
  }
}

export function startVideoWorker() {
  const worker = createVideoWorker(processVideo);

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const videoId = job.data?.videoId;
    if (!videoId) return;
    // Backstop in case the handler itself threw before marking the video failed.
    await updateVideo(videoId, {
      status: "failed",
      errorMessage: err?.message || "Processing failed",
    }).catch((updateErr) => console.error("Failed to mark video failed", updateErr));
  });

  worker.on("error", (err) => {
    const detail = err?.message || err?.name || JSON.stringify(err) || "Unknown worker error";
    console.error("Video worker error:", detail);
  });

  console.log("Video worker started");
  return worker;
}
