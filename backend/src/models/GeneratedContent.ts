import mongoose, { Schema, Document } from "mongoose";

export type ContentType = "summary" | "notes" | "quiz";

export interface IGeneratedContent extends Document {
  videoId: mongoose.Types.ObjectId;
  type: ContentType;
  content: string;
  format: string;
  createdAt: Date;
}

const GeneratedContentSchema = new Schema<IGeneratedContent>(
  {
    videoId: { type: Schema.Types.ObjectId, ref: "Video", required: true },
    type: { type: String, enum: ["summary", "notes", "quiz"], required: true },
    content: { type: String, required: true },
    format: { type: String, default: "markdown" },
  },
  { timestamps: true }
);

GeneratedContentSchema.index({ videoId: 1, type: 1 }, { unique: true });

export const GeneratedContent = mongoose.model<IGeneratedContent>(
  "GeneratedContent",
  GeneratedContentSchema
);
