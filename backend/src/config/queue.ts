import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "./index.js";

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const videoQueue = new Queue("video-processing", { connection });

export function createVideoWorker(
  handler: (job: any) => Promise<void>
): Worker {
  return new Worker("video-processing", handler, {
    connection,
    concurrency: 2,
  });
}
