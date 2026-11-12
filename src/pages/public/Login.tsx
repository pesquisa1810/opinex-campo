import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import AuthLayout from '@/layouts/AuthLayout'
import { Field, Notice } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'

export default function Login() {
  const { session, loading, isAdmin } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const from = (location.state as { from?: string } | null)?.from

  // O destino guardado só vale se combinar com o perfil de quem entrou (evita herdar a área de outro usuário)
  const home = isAdmin ? '/admin' : '/campo'
  const target = from && from.startsWith(home) ? from : home
  if (!loading && session) return <Navigate to={target} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setBusy(false); return setError(errorMessage(error)) }
    // O redirecionamento ocorre quando o perfil terminar de carregar (ver <Navigate> acima)
  }

  return (
    <AuthLayout title="Entrar" subtitle="Acesse com o e-mail e a senha cadastrados.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="E-mail"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Senha"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs">
        <Link className="btn-link" to="/recuperar-senha">Esqueci minha senha</Link>
        <Link className="btn-link" to="/cadastro">Sou entrevistador: quero me cadastrar</Link>
      </div>
    </AuthLayout>
  )
}
