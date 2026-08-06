import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/knovid",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  processingServiceUrl:
    process.env.PROCESSING_SERVICE_URL || "http://localhost:8000",
};
