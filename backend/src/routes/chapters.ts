import { Router, Response } from "express";
import { findVideo, getChapters } from "../db/repository.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/:videoId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const video = await findVideo(req.params.videoId, req.userId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const chapters = await getChapters(req.params.videoId);
    if (chapters.length === 0) {
      // Not an error: short or unstructured videos can yield no chapters.
      res.json({ videoId: req.params.videoId, chapters: [] });
      return;
    }

    res.json({ videoId: req.params.videoId, chapters });
  } catch {
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
});

export default router;