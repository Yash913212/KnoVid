import { Router, type Request, type Response } from "express";
import { supabaseAuth } from "../config/supabase.js";

const router = Router();

function toUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const name =
    (user.user_metadata?.name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "User";
  return { id: user.id, email: user.email || "", name };
}

function authResponse(data: { user: any; session: { access_token: string } | null }) {
  return {
    token: data.session?.access_token || null,
    user: toUser(data.user),
    requiresEmailConfirmation: !data.session,
  };
}

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: "email, password, and name required" });
      return;
    }

    const { data, error } = await supabaseAuth.auth.signUp({
      email: String(email).trim().toLowerCase(),
      password,
      options: { data: { name: String(name).trim() } },
    });
    if (error) {
      res.status(error.status === 422 ? 409 : 400).json({ error: error.message });
      return;
    }

    res.status(201).json(authResponse(data));
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password,
    });
    if (error || !data.user || !data.session) {
      res.status(401).json({ error: error?.message || "Invalid credentials" });
      return;
    }

    res.json(authResponse(data));
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
