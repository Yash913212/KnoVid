import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config/index.js";
import { connectDatabase } from "./config/database.js";
import authRoutes from "./routes/auth.js";
import videoRoutes from "./routes/videos.js";
import transcriptRoutes from "./routes/transcripts.js";
import graphRoutes from "./routes/graphs.js";
import generateRoutes from "./routes/generate.js";
import translateRoutes from "./routes/translate.js";
import { startVideoWorker } from "./workers/videoWorker.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/transcripts", transcriptRoutes);
app.use("/api/graphs", graphRoutes);
app.use("/api/generate", generateRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/files", express.static(path.resolve(config.uploadDir)));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  await connectDatabase();
  startVideoWorker();

  app.listen(config.port, () => {
    console.log(`KnoVid backend running on port ${config.port}`);
  });
}

start().catch(console.error);
