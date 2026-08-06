import mongoose, { Schema, Document } from "mongoose";

export type VideoSource = "upload" | "url";
export type VideoStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "analyzing"
  | "done"
  | "failed";

export interface IVideo extends Document {
  source: VideoSource;
  originalName: string;
  url?: string;
  filePath?: string;
  duration: number;
  status: VideoStatus;
  owner: mongoose.Types.ObjectId;
  errorMessage?: string;
  targetLanguage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VideoSchema = new Schema<IVideo>(
  {
    source: { type: String, enum: ["upload", "url"], required: true },
    originalName: { type: String, required: true },
    url: { type: String },
    filePath: { type: String },
    duration: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["queued", "downloading", "processing", "analyzing", "done", "failed"],
      default: "queued",
    },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    errorMessage: { type: String },
    targetLanguage: { type: String, default: "en" },
  },
  { timestamps: true }
);

export const Video = mongoose.model<IVideo>("Video", VideoSchema);
