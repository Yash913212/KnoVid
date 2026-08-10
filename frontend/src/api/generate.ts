import api from './client'

export interface GeneratedContent {
  _id: string
  videoId: string
  type: 'summary' | 'notes' | 'quiz'
  content: string
  format: string
  createdAt: string
}

export async function generateContent(videoId: string, type: string) {
  const { data } = await api.post('/generate', { videoId, type })
  return data as GeneratedContent
}

export async function getGeneratedContent(videoId: string, type?: string) {
  const params = type ? `?type=${type}` : ''
  const { data } = await api.get(`/generate/${videoId}${params}`)
  return data as GeneratedContent[]
}

export async function askQuestion(videoId: string, question: string) {
  const { data } = await api.post(`/generate/chat/${videoId}`, { question })
  return data as { answer: string }
}

export interface FuseCitation {
  time: number
  speaker: string
  text: string
}

export interface FuseResult {
  videoId: string
  explanation: string
  citations: FuseCitation[]
}

export async function fuseConcepts(videoId: string, a: string, b: string) {
  const { data } = await api.post(`/generate/fuse/${videoId}`, { a, b })
  return data as FuseResult
}

export async function exportVideo(videoId: string, format: 'markdown' | 'json') {
  const { data } = await api.get(`/generate/export/${videoId}/${format}`)
  return data as string | object
}
