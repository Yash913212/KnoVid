import { Job } from "bullmq";
import { Video } from "../models/Video.js";
import { Transcript } from "../models/Transcript.js";
import { Graph } from "../models/Graph.js";
import { createVideoWorker } from "../config/queue.js";
import { config } from "../config/index.js";

async function setStatus(videoId: string, status: string, extra: Record<string, unknown> = {}) {
  await Video.findByIdAndUpdate(videoId, { status, ...extra });
}

async function processVideo(job: Job) {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(600000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Transcription failed: ${errText}`);
    }

    const result = await resp.json();
    await job.updateProgress(50);

    await Transcript.findOneAndUpdate(
      { videoId },
      { videoId, language: result.language, segments: result.segments },
      { upsert: true }
    );

    await setStatus(videoId, "analyzing");

    const analyzeResp = await fetch(`${config.processingServiceUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, segments: result.segments }),
      signal: AbortSignal.timeout(300000),
    });

    if (analyzeResp.ok) {
      const graphData = await analyzeResp.json();
      await Graph.findOneAndUpdate(
        { videoId },
        { videoId, nodes: graphData.nodes, edges: graphData.edges },
        { upsert: true }
      );
    } else {
      // Non-fatal: the transcript is still usable without a knowledge graph.
      const errText = await analyzeResp.text();
      console.warn(`Graph analysis failed for ${videoId}: ${errText}`);
    }

    await job.updateProgress(100);
    await setStatus(videoId, "done", { duration: result.duration ?? 0, errorMessage: undefined });
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
    await Video.findByIdAndUpdate(videoId, {
      status: "failed",
      errorMessage: err?.message || "Processing failed",
    }).catch((updateErr) => console.error("Failed to mark video failed", updateErr));
  });

  worker.on("error", (err) => {
    console.error("Video worker error:", err?.message);
  });

  console.log("Video worker started");
  return worker;
}