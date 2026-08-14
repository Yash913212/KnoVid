import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabasePublishableKey:
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  // Supabase now calls the server-only key a secret key (sb_secret_...). Keep
  // the old service-role variable as a backwards-compatible alias.
  supabaseServerKey:
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  processingServiceUrl:
    process.env.PROCESSING_SERVICE_URL || "http://localhost:8000",
};
