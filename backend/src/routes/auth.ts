import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { config } from "../config/index.js";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: "email, password, and name required" });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const user = new User({ email, name });
    user.setPassword(password);
    await user.save();

    const token = jwt.sign({ sub: user._id.toString() }, config.jwtSecret, {
      expiresIn: "7d",
    });

    res.status(201).json({ token, user: { id: user._id, email: user.email, name: user.name } });
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.validatePassword(password)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ sub: user._id.toString() }, config.jwtSecret, {
      expiresIn: "7d",
    });

    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
