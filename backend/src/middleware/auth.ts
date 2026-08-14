import { Request, Response, NextFunction } from "express";
import { verifyCredentials } from "@supabase/server/core";

export interface AuthRequest extends Request {
  userId?: string;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  try {
    const { data: auth, error } = await verifyCredentials(
      { token: header.slice(7), apikey: null },
      { auth: "user" }
    );
    if (error || !auth?.userClaims?.id) {
      res.status(401).json({ error: error?.message || "Invalid Supabase session" });
      return;
    }

    req.userId = auth.userClaims.id;
    next();
  } catch (error) {
    console.error("Supabase auth verification failed:", error);
    res.status(401).json({ error: "Invalid Supabase session" });
  }
}
