export interface ISegment {
  start: number;
  end: number;
  speaker: string;
  language: string;
  text: string;
  confidence: number;
}

export interface ITranscript {
  _id: string;
  videoId: string;
  language: string;
  segments: ISegment[];
  createdAt: string;
  updatedAt: string;
}
