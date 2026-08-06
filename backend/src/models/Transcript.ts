import mongoose, { Schema, Document } from "mongoose";

export interface ISegment {
  start: number;
  end: number;
  speaker: string;
  language: string;
  text: string;
  confidence: number;
}

export interface ITranscript extends Document {
  videoId: mongoose.Types.ObjectId;
  language: string;
  segments: ISegment[];
}

const SegmentSchema = new Schema<ISegment>(
  {
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    speaker: { type: String, default: "" },
    language: { type: String, required: true },
    text: { type: String, required: true },
    confidence: { type: Number, default: 0 },
  },
  { _id: false }
);

const TranscriptSchema = new Schema<ITranscript>(
  {
    videoId: { type: Schema.Types.ObjectId, ref: "Video", required: true, unique: true },
    language: { type: String, required: true },
    segments: [SegmentSchema],
  },
  { timestamps: true }
);

export const Transcript = mongoose.model<ITranscript>("Transcript", TranscriptSchema);
