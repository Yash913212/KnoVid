import { Router, Response } from "express";
import { Graph } from "../models/Graph.js";
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

    const graph = await Graph.findOne({ videoId: req.params.videoId });
    if (!graph) {
      if (video.status === "done") {
        res.json({ videoId: req.params.videoId, nodes: [], edges: [] });
        return;
      }
      res.status(404).json({ error: "Graph not yet available" });
      return;
    }

    res.json(graph);
  } catch {
    res.status(500).json({ error: "Failed to fetch graph" });
  }
});

export default router;
