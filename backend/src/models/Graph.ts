import mongoose, { Schema, Document } from "mongoose";

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

export interface IGraph extends Document {
  videoId: mongoose.Types.ObjectId;
  nodes: IGraphNode[];
  edges: IGraphEdge[];
}

const GraphNodeSchema = new Schema<IGraphNode>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ["topic", "entity", "keyword", "chapter"], required: true },
    timestampRef: { type: Number, default: null },
    summary: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const GraphEdgeSchema = new Schema<IGraphEdge>(
  {
    source: { type: String, required: true },
    target: { type: String, required: true },
    relation: { type: String, required: true },
  },
  { _id: false }
);

const GraphSchema = new Schema<IGraph>(
  {
    videoId: { type: Schema.Types.ObjectId, ref: "Video", required: true, unique: true },
    nodes: [GraphNodeSchema],
    edges: [GraphEdgeSchema],
  },
  { timestamps: true }
);

export const Graph = mongoose.model<IGraph>("Graph", GraphSchema);
