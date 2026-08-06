import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { Video } from "../models/Video.js";
import { videoQueue } from "../config/queue.js";
import { config } from "../config/index.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";

const router = Router();

// Resolve to an absolute path so uploads work from any process CWD and the
// processing service can find files passed via filePath.
const uploadDirectory = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

router.post("/upload", authMiddleware, upload.single("video"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const targetLanguage = (req.body.targetLanguage || "en").trim();
    const video = await Video.create({
      source: "upload",
      originalName: req.file.originalname,
      filePath: req.file.path,
      owner: req.userId,
      status: "queued",
      targetLanguage,
    });

    await videoQueue.add(
      "process-video",
      {
        videoId: video._id.toString(),
        type: "upload",
        filePath: req.file.path,
        targetLanguage,
      },
      { jobId: video._id.toString(), attempts: 2, backoff: { type: "exponential", delay: 5000 } }
    );

    res.status(201).json({ id: video._id, status: video.status });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.post("/url", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    const targetLanguage = (req.body.targetLanguage || "en").trim();
    const video = await Video.create({
      source: "url",
      originalName: url,
      url,
      owner: req.userId,
      status: "queued",
      targetLanguage,
    });

    await videoQueue.add(
      "process-video",
      {
        videoId: video._id.toString(),
        type: "url",
        url,
        targetLanguage,
      },
      { jobId: video._id.toString(), attempts: 2, backoff: { type: "exponential", delay: 5000 } }
    );

    res.status(201).json({ id: video._id, status: video.status });
  } catch (err) {
    console.error("URL ingestion error:", err);
    res.status(500).json({ error: "Failed to queue URL" });
  }
});

router.post("/:id/retry", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const video = await Video.findOne({ _id: req.params.id, owner: req.userId });
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    if (video.status !== "failed" && video.status !== "queued") {
      res.status(409).json({ error: `Cannot retry a video in state '${video.status}'` });
      return;
    }

    const payload: Record<string, string> = { videoId: video._id.toString(), type: video.source };
    if (video.source === "url" && video.url) payload.url = video.url;
    else if (video.source === "upload" && video.filePath) payload.filePath = video.filePath;
    if (video.targetLanguage) payload.targetLanguage = video.targetLanguage;

    await Video.findByIdAndUpdate(video._id, {
      status: "queued",
      $unset: { errorMessage: "" },
    });

    // Re-adding to a queue with the same jobId does not re-queue an existing
    // terminal job, so remove any prior job before enqueuing a fresh one.
    await videoQueue.remove(video._id.toString()).catch(() => undefined);
    await videoQueue.add(
      "process-video",
      payload,
      { jobId: video._id.toString(), attempts: 2, backoff: { type: "exponential", delay: 5000 } }
    );

    res.json({ id: video._id, status: "queued" });
  } catch {
    res.status(500).json({ error: "Failed to retry video" });
  }
});

router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const video = await Video.findOne({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.json(video);
  } catch {
    res.status(500).json({ error: "Failed to fetch video" });
  }
});

router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const videos = await Video.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(videos);
  } catch {
    res.status(500).json({ error: "Failed to list videos" });
  }
});

export default router;
