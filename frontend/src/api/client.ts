import axios from 'axios'
import { supabase } from '../lib/supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`
  }
  return config
})

api.interceptors.request.use(
  (cfg) => {
    console.log(`[API] → ${cfg.method?.toUpperCase()} ${cfg.baseURL}${cfg.url}`)
    return cfg
  },
  (err) => {
    console.error('[API] request error:', err?.message, err)
    return Promise.reject(err)
  }
)

api.interceptors.response.use(
  (res) => {
    console.log(`[API] ← ${res.status} ${res.config.method?.toUpperCase()} ${res.config.url} (${JSON.stringify(res.data).length}b)`)
    return res
  },
  (err) => {
    const status = err.response?.status
    const data = err.response?.data
    console.error(`[API] ✗ ${status ?? 'ERR'} ${err.config?.method?.toUpperCase()} ${err.config?.url}:`, data || err.message)
    if (err.stack) console.error(err.stack)
    if (status === 401) {
      void supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Media (video files) is served from /api/files, which is auth-gated but
// consumed by <video> tags that cannot send Authorization headers — so the
// session token is appended as a query parameter instead.
export async function mediaUrl(path: string): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session ? `${path}?token=${encodeURIComponent(data.session.access_token)}` : path
}

export default api
