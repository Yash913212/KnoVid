import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { repository, auth } = vi.hoisted(() => ({
  repository: {
    createVideo: vi.fn(), findVideo: vi.fn(), listVideos: vi.fn(), updateVideo: vi.fn(),
    getTranscript: vi.fn(), getGraph: vi.fn(), getGenerated: vi.fn(), upsertGenerated: vi.fn(),
  },
  auth: { signUp: vi.fn(), signInWithPassword: vi.fn() },
}));

vi.mock("../src/db/repository.js", () => repository);
vi.mock("../src/config/supabase.js", () => ({ supabaseAuth: { auth } }));
vi.mock("../src/config/queue.js", () => ({
  videoQueue: { add: vi.fn(), remove: vi.fn(async () => undefined) },
}));
vi.mock("../src/config/index.js", () => ({
  config: { processingServiceUrl: "http://processor.test", uploadDir: "./uploads" },
  processingHeaders: () => ({ "Content-Type": "application/json" }),
}));
vi.mock("../src/middleware/auth.js", () => ({
  authMiddleware: (req: { userId?: string }, _res: unknown, next: () => void) => {
    req.userId = "user-1";
    next();
  },
}));

import authRoutes from "../src/routes/auth.js";
import videoRoutes from "../src/routes/videos.js";
import transcriptRoutes from "../src/routes/transcripts.js";
import graphRoutes from "../src/routes/graphs.js";
import generateRoutes from "../src/routes/generate.js";
import translateRoutes from "../src/routes/translate.js";

const video = {
  _id: "video-1", source: "url", originalName: "A talk", url: "https://example.test/talk",
  filePath: undefined, duration: 20, status: "done", owner: "user-1", targetLanguage: "en",
  createdAt: "2026-08-17T00:00:00Z", updatedAt: "2026-08-17T00:00:00Z",
};
const transcript = {
  _id: "transcript-1", videoId: "video-1", language: "en", createdAt: "", updatedAt: "",
  segments: [{ start: 0, end: 2, speaker: "Ada", language: "en", text: "Knowledge compounds.", confidence: 0.9 }],
};
const graph = {
  _id: "graph-1", videoId: "video-1", createdAt: "", updatedAt: "",
  nodes: [{ id: "knowledge", label: "Knowledge", type: "topic", timestampRef: 0, summary: null, metadata: {} }],
  edges: [],
};

const app = express();
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/videos", videoRoutes);
app.use("/transcripts", transcriptRoutes);
app.use("/graphs", graphRoutes);
app.use("/generate", generateRoutes);
app.use("/translate", translateRoutes);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
const nativeFetch = globalThis.fetch;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  repository.createVideo.mockResolvedValue({ ...video, status: "queued" });
  repository.findVideo.mockResolvedValue(video);
  repository.listVideos.mockResolvedValue([video]);
  repository.updateVideo.mockResolvedValue(video);
  repository.getTranscript.mockResolvedValue(transcript);
  repository.getGraph.mockResolvedValue(graph);
  repository.getGenerated.mockResolvedValue([]);
  repository.upsertGenerated.mockResolvedValue({ _id: "content-1", videoId: "video-1", type: "notes", content: "Generated notes", format: "markdown" });
  auth.signUp.mockResolvedValue({ data: { user: { id: "user-1", email: "ada@example.test", user_metadata: { name: "Ada" } }, session: { access_token: "token" } }, error: null });
  auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1", email: "ada@example.test", user_metadata: { name: "Ada" } }, session: { access_token: "token" } }, error: null });
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).startsWith("http://processor.test")) return nativeFetch(url, init);
    if (String(url).endsWith("/generate")) return Response.json({ videoId: "video-1", type: "notes", content: "Generated notes", format: "markdown" });
    if (String(url).endsWith("/chat")) return Response.json({ videoId: "video-1", answer: "The transcript says knowledge compounds." });
    if (String(url).endsWith("/fuse")) return Response.json({ videoId: "video-1", explanation: "They are related.", citations: [] });
    return Response.json({ videoId: "video-1", targetLanguage: "fr", segments: transcript.segments, nodeLabels: { knowledge: "Connaissance" } });
  }));
});

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

describe("HTTP route contracts", () => {
  it("registers and signs in", async () => {
    const register = await request("/auth/register", { method: "POST", body: JSON.stringify({ email: "ADA@example.test", password: "secret123", name: "Ada" }) });
    const login = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: "ADA@example.test", password: "secret123" }) });
    expect(register.status).toBe(201);
    expect((await register.json()).token).toBe("token");
    expect(login.status).toBe(200);
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "ada@example.test" }));
  });

  it("validates auth input", async () => {
    const response = await request("/auth/login", { method: "POST", body: "{}" });
    expect(response.status).toBe(400);
  });

  it("queues URL videos and lists, reads, and retries a video", async () => {
    const create = await request("/videos/url", { method: "POST", body: JSON.stringify({ url: video.url, targetLanguage: "fr" }) });
    const list = await request("/videos");
    const read = await request("/videos/video-1");
    repository.findVideo.mockResolvedValueOnce({ ...video, status: "failed" });
    const retry = await request("/videos/video-1/retry", { method: "POST" });
    expect(create.status).toBe(201);
    expect((await list.json())).toHaveLength(1);
    expect((await read.json())._id).toBe("video-1");
    expect(retry.status).toBe(200);
  });

  it("returns validation errors for missing upload and URL payloads", async () => {
    const upload = await request("/videos/upload", { method: "POST", body: JSON.stringify({}) });
    const url = await request("/videos/url", { method: "POST", body: "{}" });
    expect(upload.status).toBe(400);
    expect(url.status).toBe(400);
  });

  it("returns transcripts and graphs for the owner", async () => {
    const transcriptResponse = await request("/transcripts/video-1");
    const graphResponse = await request("/graphs/video-1");
    expect((await transcriptResponse.json()).segments[0].speaker).toBe("Ada");
    expect((await graphResponse.json()).nodes[0].label).toBe("Knowledge");
  });

  it("generates, retrieves, chats, fuses, and exports knowledge", async () => {
    const generate = await request("/generate", { method: "POST", body: JSON.stringify({ videoId: "video-1", type: "notes" }) });
    const read = await request("/generate/video-1");
    const chat = await request("/generate/chat/video-1", { method: "POST", body: JSON.stringify({ question: "What compounds?" }) });
    const fuse = await request("/generate/fuse/video-1", { method: "POST", body: JSON.stringify({ a: "Knowledge", b: "Learning" }) });
    const jsonExport = await request("/generate/export/video-1/json");
    const markdownExport = await request("/generate/export/video-1/markdown");
    expect((await generate.json()).content).toBe("Generated notes");
    expect((await read.json())).toEqual([]);
    expect((await chat.json()).answer).toContain("knowledge");
    expect((await fuse.json()).explanation).toBe("They are related.");
    expect((await jsonExport.json()).video._id).toBe("video-1");
    expect(await markdownExport.text()).toContain("# A talk");
  });

  it("translates transcript and graph labels", async () => {
    const response = await request("/translate", { method: "POST", body: JSON.stringify({ videoId: "video-1", targetLanguage: "fr" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).targetLanguage).toBe("fr");
  });
});
