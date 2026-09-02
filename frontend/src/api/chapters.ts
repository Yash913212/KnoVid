import api from './client'

export interface Chapter {
  _id: string
  videoId: string
  index: number
  title: string
  start: number
  end: number
  summary: string
  keywords: string[]
}

export interface ChaptersResponse {
  videoId: string
  chapters: Chapter[]
}

export async function getChapters(videoId: string) {
  const { data } = await api.get(`/chapters/${videoId}`)
  return data as ChaptersResponse
}