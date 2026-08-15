import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/db/repository.js", () => ({
  updateVideo: vi.fn(async () => ({})),
  upsertTranscript: vi.fn(async () => undefined),
  upsertGraph: vi.fn(async () => undefined),
  upsertGenerated: vi.fn(async () => undefined),
}));

vi.mock("../src/config/queue.js", () => ({
  createVideoWorker: vi.fn(() => ({ on: vi.fn() })),
}));

vi.mock("../src/config/index.js", () => ({
  config: {
    processingServiceUrl: "http://processing.test:8000",
    processingTimeoutMs: 600000,
  },
  processingHeaders: vi.fn(() => ({ "Content-Type": "application/json" })),
}));

import { updateVideo, upsertTranscript, upsertGraph, upsertGenerated } from "../src/db/repository.js";
import { processVideo } from "../src/workers/videoWorker.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    data: { videoId: "v1", type: "url", url: "https://youtube.com/watch?v=x" },
    updateProgress: vi.fn(async () => undefined),
    attemptsMade: 0,
    opts: { attempts: 1 },
    ...overrides,
  } as unknown as import("bullmq").Job;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const segments = [{ start: 0, end: 1, text: "Hello", speaker: "", language: "en", confidence: 0.9 }];

describe("processVideo", () => {
  it("runs the full pipeline and marks the video done", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ filePath: "uploads/a.mp4", language: "en", segments, duration: 10 }))
      .mockResolvedValueOnce(jsonResponse({ nodes: [], edges: [] }))
      .mockResolvedValueOnce(jsonResponse({ content: "Summary", format: "markdown" }));

    const job = makeJob();
    await processVideo(job);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://processing.test:8000/process",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("https://youtube.com/watch?v=x") })
    );
    expect(upsertTranscript).toHaveBeenCalledWith("v1", "en", segments);
    expect(upsertGraph).toHaveBeenCalledWith("v1", [], []);
    expect(upsertGenerated).toHaveBeenCalledWith("v1", "summary", "Summary", "markdown");
    expect(updateVideo).toHaveBeenCalledWith("v1", { status: "done", duration: 10, errorMessage: null });
    expect(updateVideo).toHaveBeenCalledWith("v1", { status: "downloading" });
  });

  it("marks the video failed when transcription errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));

    await processVideo(makeJob());

    expect(updateVideo).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining("Transcription failed") })
    );
  });

  it("keeps going when graph analysis fails (non-fatal)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ segments, language: "en" }))
      .mockResolvedValueOnce(jsonResponse({ error: "no llm" }, false, 502))
      .mockResolvedValueOnce(jsonResponse({ content: "Summary", format: "markdown" }));

    await processVideo(makeJob());

    expect(upsertGraph).not.toHaveBeenCalled();
    expect(updateVideo).toHaveBeenCalledWith("v1", { status: "done", duration: 0, errorMessage: null });
  });

  it("marks the video failed on fetch rejection (e.g. timeout)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("The operation was aborted"));

    await processVideo(makeJob());

    expect(updateVideo).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({ status: "failed", errorMessage: "The operation was aborted" })
    );
  });

  it("sends an upload filePath instead of a url for upload jobs", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ segments, language: "en" }))
      .mockResolvedValueOnce(jsonResponse({ nodes: [], edges: [] }))
      .mockResolvedValueOnce(jsonResponse({ content: "S", format: "markdown" }));

    await processVideo(makeJob({ data: { videoId: "v2", type: "upload", filePath: "uploads/b.mp4" } }));

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain("uploads/b.mp4");
    expect(body).not.toContain("url");
  });
});