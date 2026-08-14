import { Router, Response } from "express";
import { findVideo, getGenerated, getGraph, getTranscript, upsertGenerated } from "../db/repository.js";
import type { ContentType } from "../models/GeneratedContent.js";
import { config } from "../config/index.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { videoId, type } = req.body;
    if (!videoId || !type) {
      res.status(400).json({ error: "videoId and type required" });
      return;
    }

    const video = await findVideo(videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const transcript = await getTranscript(videoId);
    if (!transcript) {
      res.status(400).json({ error: "Transcript not available yet" });
      return;
    }

    if (!["summary", "notes", "quiz"].includes(type)) {
      res.status(400).json({ error: "type must be summary, notes, or quiz" });
      return;
    }

    const existing = await getGenerated(videoId, type as ContentType);
    if (existing[0]) {
      res.json(existing[0]);
      return;
    }

    const resp = await fetch(`${config.processingServiceUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        segments: transcript.segments,
        type,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Generate service returned ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    const content = await upsertGenerated(videoId, type as ContentType, result.content, result.format || "markdown");

    res.json(content);
  } catch (err: any) {
    console.error("Generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:videoId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const video = await findVideo(req.params.videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const type = req.query.type as string | undefined;
    const items = await getGenerated(req.params.videoId, type as ContentType | undefined);
    res.json(items);
  } catch {
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

router.post("/chat/:videoId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { question } = req.body;
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const video = await findVideo(req.params.videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const transcript = await getTranscript(req.params.videoId);
    if (!transcript) {
      res.status(400).json({ error: "Transcript not available" });
      return;
    }

    const resp = await fetch(`${config.processingServiceUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: req.params.videoId,
        segments: transcript.segments,
        question,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Chat service returned ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    res.json({ answer: result.answer });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/fuse/:videoId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { a, b } = req.body;
    if (!a || !b) {
      res.status(400).json({ error: "a and b concept labels are required" });
      return;
    }

    const video = await findVideo(req.params.videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const transcript = await getTranscript(req.params.videoId);
    if (!transcript) {
      res.status(400).json({ error: "Transcript not available" });
      return;
    }

    const resp = await fetch(`${config.processingServiceUrl}/fuse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: req.params.videoId,
        segments: transcript.segments,
        a,
        b,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Fuse service returned ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    res.json(result);
  } catch (err: any) {
    console.error("Fuse error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/export/:videoId/:format", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const video = await findVideo(req.params.videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const transcript = await getTranscript(req.params.videoId);
    const graph = await getGraph(req.params.videoId);

    if (req.params.format === "json") {
      res.json({
        video,
        transcript,
        graph,
      });
      return;
    }

    if (req.params.format === "markdown") {
      const lines: string[] = [];
      lines.push(`# ${video.originalName}\n`);

      if (transcript) {
        lines.push("## Transcript\n");
        for (const seg of transcript.segments) {
          const ts = `${Math.floor(seg.start / 60)}:${Math.floor(seg.start % 60).toString().padStart(2, "0")}`;
          const speaker = seg.speaker ? ` **${seg.speaker}**` : "";
          lines.push(`- [${ts}]${speaker}: ${seg.text}`);
        }
      }

      if (graph) {
        lines.push("\n## Knowledge Graph\n");
        for (const node of graph.nodes) {
          lines.push(`- **${node.label}** (_${node.type}_)`);
        }
        lines.push("\n### Relationships\n");
        for (const edge of graph.edges) {
          lines.push(`- ${edge.source} → ${edge.target} (_${edge.relation}_)`);
        }
      }

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.send(lines.join("\n"));
      return;
    }

    res.status(400).json({ error: "Unsupported format. Use 'markdown' or 'json'." });
  } catch {
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
