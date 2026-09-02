export interface IChapter {
  _id: string;
  videoId: string;
  index: number;
  title: string;
  start: number;
  end: number;
  summary: string;
  keywords: string[];
  createdAt?: string;
  updatedAt?: string;
}