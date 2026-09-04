import api from './client'

export type VideoStatus = 'queued' | 'downloading' | 'processing' | 'analyzing' | 'summarizing' | 'done' | 'failed'

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
  { status: 'summarizing', label: 'Synthesizing', order: 4 },
  { status: 'done', label: 'Done', order: 5 },
  { status: 'failed', label: 'Failed', order: -1 },
]

export function getStatusStep(status: VideoStatus): number {
  return STATUS_STEPS.find((s) => s.status === status)?.order ?? -1
}

export function isProcessing(status: VideoStatus): boolean {
  return ['queued', 'downloading', 'processing', 'analyzing', 'summarizing'].includes(status)
}

export const STATUS_LABELS: Record<VideoStatus, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  processing: 'Transcribing',
  analyzing: 'Analyzing',
  summarizing: 'Synthesizing',
  done: 'Done',
  failed: 'Failed',
}

export const STATUS_DOTS: Record<VideoStatus, string> = {
  queued: 'bg-yellow-400',
  downloading: 'bg-amber-400',
  processing: 'bg-orange-400',
  analyzing: 'bg-rose-400',
  summarizing: 'bg-fuchsia-400',
  done: 'bg-[#2BA6A0]',
  failed: 'bg-red-400',
}

// Progress fill % per processing step, so the bar visibly "fills up".
export const STATUS_PROGRESS: Record<VideoStatus, number> = {
  queued: 10,
  downloading: 30,
  processing: 62,
  analyzing: 88,
  summarizing: 94,
  done: 100,
  failed: 0,
}

// Index of the active pipeline step for each backend status.
export const STATUS_PIPELINE_STEP: Record<VideoStatus, number> = {
  queued: 0,
  downloading: 0,
  processing: 1,
  analyzing: 3,
  summarizing: 4,
  done: 5,
  failed: 1,
}

export async function uploadVideo(
  file: File,
  onProgress?: (percent: number) => void,
  targetLanguage = 'en'
) {
  const form = new FormData()
  form.append('video', file)
  form.append('file', file)
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
