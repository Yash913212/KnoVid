import api from './client'

export interface LlmStatus {
  configured: boolean
  provider: string
  has_openrouter_key: boolean
  masked_key: string
  model: string
  api_url?: string
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

export async function verifyOpenRouterKey(apiKey: string): Promise<VerifyKeyResult> {
  const { data } = await api.post('/llm/verify', { apiKey })
  return data
}

export async function saveOpenRouterKey(apiKey: string, model?: string): Promise<{ success: boolean; has_key: boolean; masked_key: string }> {
  const { data } = await api.post('/llm/key', { apiKey, model })
  return data
}
