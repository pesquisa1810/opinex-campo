import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '@/layouts/AuthLayout'
import { Field, Notice } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { errorMessage } from '@/lib/errors'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${env.appUrl}/nova-senha` })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setSent(true)
  }
  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <Notice tone="ok">Se o e-mail estiver cadastrado, você receberá o link em instantes. Verifique também a caixa de spam.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="E-mail"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</button>
        </form>
      )}
      <p className="mt-4 text-center text-xs"><Link className="btn-link" to="/login">Voltar ao login</Link></p>
    </AuthLayout>
  )
}

export function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN') setReady(true) })
    return () => data.subscription.unsubscribe()
  }, [])
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return setError('A senha deve ter 8+ caracteres, com letras e números.')
    if (pw !== pw2) return setError('As senhas não conferem.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    navigate('/', { replace: true })
  }
  return (
    <AuthLayout title="Nova senha">
      {!ready ? <Notice>Abra esta página pelo link enviado ao seu e-mail.</Notice> : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nova senha"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Confirmar nova senha"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <button className="btn-primary w-full" disabled={busy}>Salvar nova senha</button>
        </form>
      )}
    </AuthLayout>
  )
}
