import express from "express";
import cors from "cors";
import path from "path";
import { verifyCredentials } from "@supabase/server/core";
import { config } from "./config/index.js";
import { connectDatabase } from "./config/database.js";
import { findVideoByFileName } from "./db/repository.js";
import videoRoutes from "./routes/videos.js";
import transcriptRoutes from "./routes/transcripts.js";
import graphRoutes from "./routes/graphs.js";
import chapterRoutes from "./routes/chapters.js";
import generateRoutes from "./routes/generate.js";
import translateRoutes from "./routes/translate.js";
import authRoutes from "./routes/auth.js";
import llmRoutes from "./routes/llm.js";
import { startVideoWorker } from "./workers/videoWorker.js";

const app = express();

// ── Verbose request logger: every API call hits the console ──
app.use((req, _res, next) => {
  const start = Date.now();
  const url = req.originalUrl || req.url;
  console.log(`[${new Date().toISOString()}] → ${req.method} ${url} ${req.ip || ''} ${req.headers['content-length'] ? `(${req.headers['content-length']}b)` : ''}`);
  const origEnd = _res.end.bind(_res) as typeof _res.end;
  // @ts-ignore patch end to log duration/status
  _res.end = ((...args: unknown[]) => {
    const ms = Date.now() - start;
    const status = (_res as any).statusCode;
    const level = status >= 500 ? '✗' : status >= 400 ? '⚠' : '✓';
    console.log(`[${new Date().toISOString()}] ${level} ${req.method} ${url} → ${status} (${ms}ms)`);
    return (origEnd as unknown as (...a: unknown[]) => unknown)(...args);
  }) as typeof _res.end;
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use("/api/auth", authRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/transcripts", transcriptRoutes);
app.use("/api/graphs", graphRoutes);
app.use("/api/chapters", chapterRoutes);
app.use("/api/generate", generateRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/llm", llmRoutes);


// Uploaded media is private per-user: require a valid Supabase session and
// verify the file belongs to one of the caller's videos. <video> tags cannot
// send Authorization headers, so the token may also arrive as ?token=.
app.use(
  "/api/files",
  async (req, res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
    if (!token) {
      res.status(401).json({ error: "Missing session" });
      return;
    }
    try {
      const fileName = path.basename(req.path);
      const { data: auth, error } = await verifyCredentials(
        { token, apikey: null },
        { auth: "user" }
      );
      if (error || !auth?.userClaims?.id) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }
      const video = await findVideoByFileName(fileName, auth.userClaims.id);
      if (!video) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: "Invalid session" });
    }
  },
  express.static(path.resolve(config.uploadDir))
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), redis: config.redisUrl, processing: config.processingServiceUrl });
});
// Global error formatter — prints full stack to console
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const e = err as { message?: string; stack?: string; status?: number };
  console.error(`[${new Date().toISOString()}] ✗ UNHANDLED API ERROR:`, e?.message || e);
  if (e?.stack) console.error(e.stack);
  res.status((e?.status as number) || 500).json({ error: e?.message || 'Internal error', stack: e?.stack?.slice(0, 2000) });
});

async function start() {
  await connectDatabase();
  startVideoWorker();

  app.listen(config.port, () => {
    console.log(`KnoVid backend running on port ${config.port}`);
  });
}

start().catch(console.error);
