import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "./index.js";

export const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  // Fail fast so AggregateError surfaces quickly with a clear ECONNREFUSED
  connectTimeout: 5000,
  // Don't block backend startup forever when Redis is down
  lazyConnect: false,
  enableReadyCheck: true,
});

connection.on("error", (err) => {
  console.error(`[redis] connection error (${config.redisUrl}):`, err.message);
  console.error("→ Fix: start Redis locally (e.g. `wsl sudo service redis-server start` or Docker) or set REDIS_URL to a hosted Redis (Upstash) in backend/.env");
});

connection.on("connect", () => {
  console.log(`[redis] connected to ${config.redisUrl}`);
});

export const videoQueue = new Queue("video-processing", { connection });

videoQueue.on("error" as any, (err: any) => {
  console.error("[queue] error:", err?.message || err);
});

export function createVideoWorker(
  handler: (job: any) => Promise<void>
): Worker {
  return new Worker("video-processing", handler, {
    connection,
    concurrency: 2,
  });
}
