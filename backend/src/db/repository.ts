import { supabase } from "../config/supabase.js";
import type { IVideo, VideoSource, VideoStatus } from "../models/Video.js";
import type { ITranscript, ISegment } from "../models/Transcript.js";
import type { IGraph, IGraphEdge, IGraphNode } from "../models/Graph.js";
import type { ContentType, IGeneratedContent } from "../models/GeneratedContent.js";

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function mapVideo(row: any): IVideo {
  return {
    _id: row.id,
    source: row.source,
    originalName: row.original_name,
    url: row.url ?? undefined,
    filePath: row.file_path ?? undefined,
    duration: Number(row.duration ?? 0),
    status: row.status,
    owner: row.owner_id,
    errorMessage: row.error_message ?? undefined,
    targetLanguage: row.target_language ?? "en",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createVideo(input: {
  source: VideoSource;
  originalName: string;
  ownerId: string;
  url?: string;
  filePath?: string;
  targetLanguage?: string;
}): Promise<IVideo> {
  const { data, error } = await supabase
    .from("videos")
    .insert({
      source: input.source,
      original_name: input.originalName,
      owner_id: input.ownerId,
      url: input.url ?? null,
      file_path: input.filePath ?? null,
      target_language: input.targetLanguage ?? "en",
      status: "queued",
    })
    .select("*")
    .single();
  fail(error);
  return mapVideo(data);
}

export async function findVideo(id: string, ownerId?: string): Promise<IVideo | null> {
  let query = supabase.from("videos").select("*").eq("id", id);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query.maybeSingle();
  fail(error);
  return data ? mapVideo(data) : null;
}

export async function listVideos(ownerId: string): Promise<IVideo[]> {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []).map(mapVideo);
}

// Used by the /api/files guard: the requested file must belong to one of the
// caller's videos (matched by stored path suffix), otherwise it is 404'd.
export async function findVideoByFileName(fileName: string, ownerId: string): Promise<IVideo | null> {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("owner_id", ownerId)
    .like("file_path", `%/${fileName}`)
    .maybeSingle();
  fail(error);
  return data ? mapVideo(data) : null;
}

export async function updateVideo(
  id: string,
  patch: Partial<Pick<IVideo, "status" | "filePath" | "duration" | "originalName">> & { errorMessage?: string | null }
): Promise<IVideo> {
  const mapped: Record<string, unknown> = {};
  if (patch.status !== undefined) mapped.status = patch.status;
  if (patch.filePath !== undefined) mapped.file_path = patch.filePath;
  if (patch.duration !== undefined) mapped.duration = patch.duration;
  if (patch.originalName !== undefined) mapped.original_name = patch.originalName;
  if (patch.errorMessage !== undefined) mapped.error_message = patch.errorMessage;
  const { data, error } = await supabase.from("videos").update(mapped).eq("id", id).select("*").single();
  fail(error);
  return mapVideo(data);
}

function mapSegment(row: any): ISegment {
  return {
    start: Number(row.start_time),
    end: Number(row.end_time),
    speaker: row.speaker ?? "",
    language: row.language,
    text: row.text,
    confidence: Number(row.confidence ?? 0),
  };
}

export async function getTranscript(videoId: string): Promise<ITranscript | null> {
  const { data: transcript, error } = await supabase
    .from("transcripts")
    .select("*")
    .eq("video_id", videoId)
    .maybeSingle();
  fail(error);
  if (!transcript) return null;
  const { data: segments, error: segmentError } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("transcript_id", transcript.id)
    .order("position", { ascending: true });
  fail(segmentError);
  return {
    _id: transcript.id,
    videoId,
    language: transcript.language,
    segments: (segments ?? []).map(mapSegment),
    createdAt: transcript.created_at,
    updatedAt: transcript.updated_at,
  };
}

export async function upsertTranscript(videoId: string, language: string, segments: ISegment[]): Promise<void> {
  const { data: transcript, error } = await supabase
    .from("transcripts")
    .upsert({ video_id: videoId, language }, { onConflict: "video_id" })
    .select("id")
    .single();
  fail(error);
  if (!transcript) throw new Error("Transcript upsert returned no row");
  const { error: deleteError } = await supabase.from("transcript_segments").delete().eq("transcript_id", transcript.id);
  fail(deleteError);
  const rows = segments.map((segment, position) => ({
    transcript_id: transcript.id,
    position,
    start_time: segment.start,
    end_time: segment.end,
    speaker: segment.speaker ?? "",
    language: segment.language,
    text: segment.text,
    confidence: segment.confidence ?? 0,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase.from("transcript_segments").insert(rows.slice(i, i + 500));
    fail(insertError);
  }
}

function mapGraph(videoId: string, row: any, nodes: any[], edges: any[]): IGraph {
  const mappedNodes: IGraphNode[] = nodes.map((node) => ({
    id: node.node_id,
    label: node.label,
    type: node.type,
    timestampRef: node.timestamp_ref == null ? null : Number(node.timestamp_ref),
    summary: node.summary ?? null,
    metadata: node.metadata ?? {},
  }));
  const mappedEdges: IGraphEdge[] = edges.map((edge) => ({
    source: edge.source_id,
    target: edge.target_id,
    relation: edge.relation,
  }));
  return { _id: row.id, videoId, nodes: mappedNodes, edges: mappedEdges, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getGraph(videoId: string): Promise<IGraph | null> {
  const { data: graph, error } = await supabase.from("graphs").select("*").eq("video_id", videoId).maybeSingle();
  fail(error);
  if (!graph) return null;
  const [{ data: nodes, error: nodeError }, { data: edges, error: edgeError }] = await Promise.all([
    supabase.from("graph_nodes").select("*").eq("graph_id", graph.id).order("created_at"),
    supabase.from("graph_edges").select("*").eq("graph_id", graph.id).order("created_at"),
  ]);
  fail(nodeError);
  fail(edgeError);
  return mapGraph(videoId, graph, nodes ?? [], edges ?? []);
}

export async function upsertGraph(videoId: string, nodes: IGraphNode[], edges: IGraphEdge[]): Promise<void> {
  const { data: graph, error } = await supabase.from("graphs").upsert({ video_id: videoId }, { onConflict: "video_id" }).select("id").single();
  fail(error);
  if (!graph) throw new Error("Graph upsert returned no row");
  const [{ error: nodeDeleteError }, { error: edgeDeleteError }] = await Promise.all([
    supabase.from("graph_nodes").delete().eq("graph_id", graph.id),
    supabase.from("graph_edges").delete().eq("graph_id", graph.id),
  ]);
  fail(nodeDeleteError);
  fail(edgeDeleteError);
  if (nodes.length) {
    const { error: nodeError } = await supabase.from("graph_nodes").insert(nodes.map((node) => ({
      graph_id: graph.id,
      node_id: node.id,
      label: node.label,
      type: node.type,
      timestamp_ref: node.timestampRef,
      summary: node.summary,
      metadata: node.metadata,
    })));
    fail(nodeError);
  }
  if (edges.length) {
    const { error: edgeError } = await supabase.from("graph_edges").insert(edges.map((edge) => ({
      graph_id: graph.id,
      source_id: edge.source,
      target_id: edge.target,
      relation: edge.relation,
    })));
    fail(edgeError);
  }
}

function mapGenerated(row: any): IGeneratedContent {
  return { _id: row.id, videoId: row.video_id, type: row.type, content: row.content, format: row.format, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getGenerated(videoId: string, type?: ContentType): Promise<IGeneratedContent[]> {
  let query = supabase.from("generated_content").select("*").eq("video_id", videoId).order("created_at", { ascending: false });
  if (type) query = query.eq("type", type);
  const { data, error } = await query;
  fail(error);
  return (data ?? []).map(mapGenerated);
}

export async function upsertGenerated(videoId: string, type: ContentType, content: string, format = "markdown"): Promise<IGeneratedContent> {
  const { data, error } = await supabase.from("generated_content").upsert({ video_id: videoId, type, content, format }, { onConflict: "video_id,type" }).select("*").single();
  fail(error);
  return mapGenerated(data);
}
