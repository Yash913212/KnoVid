import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import { config, processingHeaders } from "../config/index.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";

const router = Router();

function updateEnvFile(filePath: string, key: string, value: string) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `${key}=${value}\n`, "utf-8");
      return;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const pattern = new RegExp(`^${key}=.*$`, "m");
    let updated: string;
    if (pattern.test(content)) {
      updated = content.replace(pattern, `${key}=${value}`);
    } else {
      updated = content.trimEnd() + `\n${key}=${value}\n`;
    }
    fs.writeFileSync(filePath, updated, "utf-8");
  } catch (e) {
    console.error(`Failed to update ${filePath}:`, e);
  }
}

router.get("/status", authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const resp = await fetch(`${config.processingServiceUrl}/llm/status`, {
      headers: processingHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      res.json({
        configured: Boolean(config.openRouterApiKey),
        provider: config.openRouterApiKey ? "OpenRouter" : "none",
        has_openrouter_key: Boolean(config.openRouterApiKey),
        masked_key: config.openRouterApiKey ? `${config.openRouterApiKey.slice(0, 8)}...` : "",
        model: "nvidia/nemotron-3.5-lightning:free",
        processing_connected: false,
      });
      return;
    }
    const data = await resp.json();
    res.json({ ...data, processing_connected: true });
  } catch (err: any) {
    res.json({
      configured: Boolean(config.openRouterApiKey),
      provider: config.openRouterApiKey ? "OpenRouter" : "none",
      has_openrouter_key: Boolean(config.openRouterApiKey),
      masked_key: config.openRouterApiKey ? `${config.openRouterApiKey.slice(0, 8)}...` : "",
      model: "nvidia/nemotron-3.5-lightning:free",
      processing_connected: false,
      error: err.message,
    });
  }
});

router.post("/verify", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { apiKey } = req.body;
    const keyToTest = apiKey || config.openRouterApiKey;
    const resp = await fetch(`${config.processingServiceUrl}/llm/verify`, {
      method: "POST",
      headers: processingHeaders(),
      body: JSON.stringify({ apiKey: keyToTest }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

router.post("/key", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { apiKey, model } = req.body;
    if (typeof apiKey !== "string") {
      res.status(400).json({ error: "apiKey is required" });
      return;
    }

    const trimmedKey = apiKey.trim();
    config.openRouterApiKey = trimmedKey;

    // Persist to backend/.env and processing-service/.env
    const backendEnvPath = path.resolve(process.cwd(), ".env");
    const serviceEnvPath = path.resolve(process.cwd(), "../processing-service/.env");

    updateEnvFile(backendEnvPath, "OPENROUTER_API_KEY", trimmedKey);
    updateEnvFile(serviceEnvPath, "OPENROUTER_API_KEY", trimmedKey);
    updateEnvFile(serviceEnvPath, "LLM_API_KEY", trimmedKey);

    if (model) {
      updateEnvFile(serviceEnvPath, "LLM_MODEL", String(model).trim());
    }

    // Trigger processing service to reload its config
    try {
      await fetch(`${config.processingServiceUrl}/llm/reload`, {
        method: "POST",
        headers: processingHeaders(),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // Ignored if service is not currently running
    }

    res.json({
      success: true,
      has_key: Boolean(trimmedKey),
      masked_key: trimmedKey ? `${trimmedKey.slice(0, 8)}...${trimmedKey.slice(-4)}` : "",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
