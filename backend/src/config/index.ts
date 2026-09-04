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
  // Optional shared secret sent to the processing service as X-Processing-Auth.
  processingAuthToken: process.env.PROCESSING_AUTH_TOKEN || "",
  // Timeout (ms) for the /process pipeline call. Long videos transcribe slowly.
  processingTimeoutMs: parseInt(process.env.PROCESSING_TIMEOUT_MS || "600000", 10),
  openRouterApiKey: process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || "",
};

// Headers shared by every outbound processing-service call.
export function processingHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.processingAuthToken ? { "X-Processing-Auth": config.processingAuthToken } : {}),
    ...(config.openRouterApiKey ? { "X-OpenRouter-Key": config.openRouterApiKey } : {}),
    ...extra,
  };
}

