import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppRole, Profile } from '@/types/db'

interface AuthState {
  session: Session | null
  profile: Profile | null
  roles: AppRole[]
  loading: boolean
  isAdmin: boolean
  isInterviewer: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setSession(null); setProfile(null); setRoles([]); setLoading(false); return }
    setLoading(true)
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, status, status_reason, created_at').eq('id', s.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', s.user.id),
    ])
    // Sessão, perfil e papéis são publicados juntos para evitar redirecionamentos prematuros
    setProfile((p.data as Profile) ?? null)
    setRoles(((r.data ?? []) as { role: AppRole }[]).map((x) => x.role))
    setSession(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') { setSession(s); return }
      // Evita chamadas ao banco dentro do callback síncrono do Supabase
      setTimeout(() => load(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value: AuthState = {
    session, profile, roles, loading,
    // Apenas para navegação/UX. A autorização real é feita no banco (RLS).
    isAdmin: roles.includes('admin') && profile?.status === 'approved',
    isInterviewer: roles.includes('interviewer'),
    refresh: async () => { const { data } = await supabase.auth.getSession(); await load(data.session) },
    signOut: async () => {
      // Encerra no servidor (revoga o refresh token) e garante a limpeza local mesmo se a rede falhar
      const { error } = await supabase.auth.signOut()
      if (error) await supabase.auth.signOut({ scope: 'local' })
      await load(null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
