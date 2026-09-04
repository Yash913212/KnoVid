import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });
import { connection, videoQueue } from "./src/config/queue.js";
import { createVideo } from "./src/db/repository.js";

async function run() {
  console.log("Testing Supabase connection...");
  try {
    const video = await createVideo({
      source: "url",
      originalName: "test-url",
      ownerId: "00000000-0000-0000-0000-000000000000",
      url: "https://example.com",
    });
    console.log("Created video:", video._id);

    console.log("Testing Redis connection...");
    await videoQueue.add(
      "process-video",
      {
        videoId: video._id,
        type: "url",
        url: "https://example.com",
        targetLanguage: "en",
      },
      { jobId: video._id, attempts: 2 }
    );
    console.log("Added to queue successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}
run();
