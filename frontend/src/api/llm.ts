import api from './client'

export interface LlmStatus {
  available: boolean
  provider: string
  model: string
  url?: string
  masked_key?: string
  processing_connected?: boolean
  error?: string
}

export interface VerifyKeyResult {
  valid: boolean
  label?: string
  usage?: number
  limit?: string | number
  error?: string
  model?: string
}

export async function getLlmStatus(): Promise<LlmStatus> {
  const { data } = await api.get('/llm/status')
  return data
}
