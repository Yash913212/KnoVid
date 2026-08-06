import api from './client'

export interface Segment {
  start: number
  end: number
  speaker: string
  language: string
  text: string
  confidence: number
}

export interface Transcript {
  _id: string
  videoId: string
  language: string
  segments: Segment[]
}

export async function getTranscript(videoId: string) {
  const { data } = await api.get(`/transcripts/${videoId}`)
  return data as Transcript
}
