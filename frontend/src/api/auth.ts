import api from './client'

export interface AuthResponse {
  token: string
  user: { id: string; email: string; name: string }
}

export async function register(email: string, password: string, name: string) {
  const { data } = await api.post('/auth/register', { email, password, name })
  return data as AuthResponse
}

export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password })
  return data as AuthResponse
}
