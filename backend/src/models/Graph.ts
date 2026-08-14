export interface IGraphNode {
  id: string;
  label: string;
  type: "topic" | "entity" | "keyword" | "chapter";
  timestampRef: number | null;
  summary: string | null;
  metadata: Record<string, unknown>;
}

export interface IGraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface IGraph {
  _id: string;
  videoId: string;
  nodes: IGraphNode[];
  edges: IGraphEdge[];
  createdAt: string;
  updatedAt: string;
}
