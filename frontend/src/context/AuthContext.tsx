import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface User {
  id: string
  email: string
  name: string
}

interface AuthCtx {
  user: User | null
  token: string | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

function mapUser(user: SupabaseUser | null): User | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || '',
    name: String(user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    }).finally(() => {
      if (active) setReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setReady(true)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    setSession(data.session)
  }

  const register = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw error
    if (!data.session) throw new Error('Check your email to confirm your account before signing in.')
    setSession(data.session)
  }

  const logout = () => {
    void supabase.auth.signOut()
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user: mapUser(session?.user || null), token: session?.access_token || null, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
