import api from './client'

export type VideoStatus = 'queued' | 'downloading' | 'processing' | 'analyzing' | 'done' | 'failed'

export interface Video {
  _id: string
  source: 'upload' | 'url'
  originalName: string
  url?: string
  filePath?: string
  thumbnail?: string
  duration: number
  status: VideoStatus
  errorMessage?: string
  createdAt: string
}

export const STATUS_STEPS: { status: VideoStatus; label: string; order: number }[] = [
  { status: 'queued', label: 'Queued', order: 0 },
  { status: 'downloading', label: 'Downloading', order: 1 },
  { status: 'processing', label: 'Transcribing', order: 2 },
  { status: 'analyzing', label: 'Analyzing', order: 3 },
  { status: 'done', label: 'Done', order: 4 },
  { status: 'failed', label: 'Failed', order: -1 },
]

export function getStatusStep(status: VideoStatus): number {
  return STATUS_STEPS.find((s) => s.status === status)?.order ?? -1
}

export function isProcessing(status: VideoStatus): boolean {
  return ['queued', 'downloading', 'processing', 'analyzing'].includes(status)
}

export const STATUS_COLORS: Record<VideoStatus, string> = {
  queued: 'bg-yellow-100 text-yellow-800',
  downloading: 'bg-amber-100 text-amber-800',
  processing: 'bg-orange-100 text-orange-800',
  analyzing: 'bg-rose-100 text-rose-800',
  done: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

export const STATUS_LABELS: Record<VideoStatus, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  processing: 'Transcribing',
  analyzing: 'Analyzing',
  done: 'Done',
  failed: 'Failed',
}

export async function uploadVideo(
  file: File,
  onProgress?: (percent: number) => void,
  targetLanguage = 'en'
) {
  const form = new FormData()
  form.append('video', file)
  form.append('targetLanguage', targetLanguage)
  const { data } = await api.post('/videos/upload', form, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
  return data as { id: string; status: string }
}

export async function submitUrl(url: string, targetLanguage = 'en') {
  const { data } = await api.post('/videos/url', { url, targetLanguage })
  return data as { id: string; status: string }
}

export async function getVideos() {
  const { data } = await api.get('/videos')
  return data as Video[]
}

export async function getVideo(id: string) {
  const { data } = await api.get(`/videos/${id}`)
  return data as Video
}

export async function retryVideo(id: string) {
  const { data } = await api.post('/videos/' + id + '/retry')
  return data as { id: string; status: string }
}
