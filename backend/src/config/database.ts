import { supabase } from "./supabase.js";

export async function connectDatabase(): Promise<void> {
  const { error } = await supabase.from("videos").select("id").limit(1);
  if (error) {
    if (error.message.includes("Could not find the table 'public.videos'")) {
      throw new Error(
        "Supabase schema is missing. Run backend/supabase/schema.sql in the Supabase SQL Editor, then restart the backend."
      );
    }
    if (error.message.toLowerCase().includes("invalid api key")) {
      throw new Error(
        "Supabase rejected the backend key. Replace SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in backend/.env with the real server-only key from Supabase Project Settings → API."
      );
    }
    throw new Error(`Supabase connection/schema check failed: ${error.message}`);
  }
  console.log("Connected to Supabase");
}
