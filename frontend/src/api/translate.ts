import api from './client'
import type { Segment } from './transcripts'

export interface TranstoneResult {
  videoId: string
  targetLanguage: string
  segments: Segment[]
  nodeLabels: Record<string, string> | null
}

export async function translateVideo(videoId: string, targetLanguage: string) {
  const { data } = await api.post('/translate', { videoId, targetLanguage })
  return data as TranstoneResult
}
