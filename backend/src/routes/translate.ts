import { Router, Response } from "express";
import { findVideo, getGraph, getTranscript } from "../db/repository.js";
import { config } from "../config/index.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { videoId, targetLanguage } = req.body;
    if (!videoId || !targetLanguage) {
      res.status(400).json({ error: "videoId and targetLanguage required" });
      return;
    }

    const video = await findVideo(videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const transcript = await getTranscript(videoId);
    if (!transcript) {
      res.status(400).json({ error: "Transcript not available" });
      return;
    }

    const graph = await getGraph(videoId);
    const nodeLabels: Record<string, string> = {};
    if (graph) {
      for (const node of graph.nodes) {
        nodeLabels[node.id] = node.label;
      }
    }

    const resp = await fetch(`${config.processingServiceUrl}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        segments: transcript.segments,
        targetLanguage,
        nodeLabels: Object.keys(nodeLabels).length > 0 ? nodeLabels : null,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Translation service returned ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    res.json(result);
  } catch (err: any) {
    console.error("Translate error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
