import { createClient } from "@supabase/supabase-js";
import { config } from "./index.js";

const serverKey = config.supabaseServerKey;

if (!config.supabaseUrl || !serverKey || serverKey.includes("replace-with") || serverKey.includes("your-server")) {
  throw new Error(
    "Supabase is not configured. Set SUPABASE_URL and a real SUPABASE_SECRET_KEY (sb_secret_...) or SUPABASE_SERVICE_ROLE_KEY in backend/.env."
  );
}

const apiKey = serverKey;

export const supabase = createClient(config.supabaseUrl, apiKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Auth mutations use the public key. Database writes from the worker use the
// service-role client above because they happen outside a user's request.
export const supabaseAuth = createClient(config.supabaseUrl, config.supabasePublishableKey || apiKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
