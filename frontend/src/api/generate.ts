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

export async function exportVideo(videoId: string, format: 'markdown' | 'json') {
  const { data } = await api.get(`/generate/export/${videoId}/${format}`)
  return data as string | object
}
