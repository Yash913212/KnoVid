import { Router, Response } from "express";
import { Transcript } from "../models/Transcript.js";
import { Video } from "../models/Video.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/:videoId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const video = await Video.findOne({
      _id: req.params.videoId,
      owner: req.userId,
    });
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const transcript = await Transcript.findOne({ videoId: req.params.videoId });
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
