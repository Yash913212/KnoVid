import { Router, Response } from "express";
import { findVideo, getTranscript } from "../db/repository.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/:videoId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const video = await findVideo(req.params.videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const transcript = await getTranscript(req.params.videoId);
    if (!transcript) {
      res.status(404).json({ error: "Transcript not yet available" });
      return;
    }

    res.json(transcript);
  } catch {
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});

export default router;
