import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/supabase.js", () => {
  const state: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  const terminal = async () => ({
    data: state.data,
    error: state.error,
  });
  return {
    supabase: {
      from: vi.fn(() => {
        const self: Record<string, unknown> = {};
        const record = (op: string) => {
          self[op] = vi.fn(() => self);
          return self[op];
        };
        ["select", "insert", "update", "upsert", "delete", "eq", "like", "order"].forEach(record);
        self.single = terminal;
        self.maybeSingle = terminal;
        self.then = (resolve: (v: unknown) => void) => resolve({ data: state.data, error: state.error });
        return self;
      }),
      __setResult: (data: unknown, error: { message: string } | null = null) => {
        state.data = data;
        state.error = error;
      },
    },
  };
});

import { supabase } from "../src/config/supabase.js";
import { listVideos, findVideoByFileName, createVideo, updateVideo } from "../src/db/repository.js";

const mocked = vi.mocked(supabase);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("repository", () => {
  it("maps a video row into the IVideo shape", async () => {
    const row = {
      id: "v1",
      source: "url",
      original_name: "My Talk",
      url: "https://youtube.com/watch?v=x",
      file_path: null,
      duration: 12.5,
      status: "done",
      owner_id: "u1",
      error_message: null,
      target_language: "en",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    mocked.__setResult([row]);

    const videos = await listVideos("u1");

    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      _id: "v1",
      source: "url",
      originalName: "My Talk",
      url: "https://youtube.com/watch?v=x",
      duration: 12.5,
      status: "done",
      owner: "u1",
      targetLanguage: "en",
    });
  });

  it("listVideos queries only the caller's rows", async () => {
    mocked.__setResult([]);
    await listVideos("u1");
    const from = mocked.from.mock.results[0].value;
    expect(mocked.from).toHaveBeenCalledWith("videos");
    expect(from.select).toHaveBeenCalledWith("*");
    expect(from.eq).toHaveBeenCalledWith("owner_id", "u1");
  });

  it("findVideoByFileName matches the path suffix and owner", async () => {
    mocked.__setResult({
      id: "v1",
      source: "upload",
      original_name: "a.mp4",
      file_path: "uploads/a.mp4",
      duration: 0,
      status: "queued",
      owner_id: "u1",
      error_message: null,
      target_language: "en",
      created_at: "",
      updated_at: "",
    });

    const video = await findVideoByFileName("a.mp4", "u1");

    expect(video).not.toBeNull();
    expect(video!._id).toBe("v1");
    const from = mocked.from.mock.results[0].value;
    expect(from.eq).toHaveBeenCalledWith("owner_id", "u1");
    expect(from.like).toHaveBeenCalledWith("file_path", "%/a.mp4");
  });

  it("findVideoByFileName returns null when the file does not belong to the user", async () => {
    mocked.__setResult(null);
    const video = await findVideoByFileName("someone-elses.mp4", "u1");
    expect(video).toBeNull();
  });

  it("rejects when the database errors", async () => {
    mocked.__setResult(null, { message: "boom" });
    await expect(listVideos("u1")).rejects.toThrow("boom");
  });

  it("createVideo writes owner_id and returns the mapped row", async () => {
    mocked.__setResult({
      id: "v2",
      source: "url",
      original_name: "New",
      url: "https://youtube.com/watch?v=y",
      file_path: null,
      duration: 0,
      status: "queued",
      owner_id: "u1",
      error_message: null,
      target_language: "en",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    const video = await createVideo({
      source: "url",
      originalName: "New",
      url: "https://youtube.com/watch?v=y",
      ownerId: "u1",
    });

    expect(video._id).toBe("v2");
    const from = mocked.from.mock.results[0].value;
    expect(from.insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "u1", source: "url", original_name: "New" })
    );
  });

  it("updateVideo sends only the given fields", async () => {
    mocked.__setResult({
      id: "v1",
      source: "url",
      original_name: "a",
      file_path: null,
      duration: 0,
      status: "done",
      owner_id: "u1",
      error_message: null,
      target_language: "en",
      created_at: "",
      updated_at: "",
    });
    await updateVideo("v1", { status: "done" });
    const from = mocked.from.mock.results[0].value;
    expect(from.update).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
    expect(from.eq).toHaveBeenCalledWith("id", "v1");
  });
});