export type VideoSource = "upload" | "url";
export type VideoStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "analyzing"
  | "summarizing"
  | "done"
  | "failed";

export interface IVideo {
  _id: string;
  source: VideoSource;
  originalName: string;
  url?: string;
  filePath?: string;
  duration: number;
  status: VideoStatus;
  owner: string;
  errorMessage?: string;
  targetLanguage?: string;
  createdAt: string;
  updatedAt: string;
}
