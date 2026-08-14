export type ContentType = "summary" | "notes" | "quiz";

export interface IGeneratedContent {
  _id: string;
  videoId: string;
  type: ContentType;
  content: string;
  format: string;
  createdAt: string;
  updatedAt: string;
}
