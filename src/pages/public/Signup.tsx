import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2 } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Field, Notice } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal'

const schema = z.object({
  full_name: z.string().trim().min(5, 'Informe o nome completo').max(120)
    .refine((v) => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome'),
  phone: z.string().trim().regex(/^[0-9+() -]{10,20}$/, 'Telefone inválido (inclua o DDD)'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo de 8 caracteres').regex(/[A-Za-z]/, 'Inclua letras').regex(/[0-9]/, 'Inclua números'),
  confirm: z.string(),
  terms: z.boolean().refine((v) => v, 'Obrigatório'),
  privacy: z.boolean().refine((v) => v, 'Obrigatório'),
}).refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'As senhas não conferem' })
type Form = z.infer<typeof schema>

export default function Signup() {
  const [done, setDone] = useState<null | { confirmEmail: boolean }>(null)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema), defaultValues: { terms: false, privacy: false },
  })

  async function onSubmit(f: Form) {
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: {
        emailRedirectTo: `${env.appUrl}/login`,
        // O banco registra o usuário como ENTREVISTADOR PENDENTE e grava os aceites.
        data: { full_name: f.full_name, phone: f.phone, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION },
      },
    })
    if (error) return setError(errorMessage(error))
    if (data.session) await supabase.auth.signOut()
    setDone({ confirmEmail: !data.session })
  }

  if (done) {
    return (
      <AuthLayout title="Cadastro enviado">
        <div className="flex flex-col items-center py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-gold" />
          <p className="mt-3 font-semibold">Seu cadastro foi registrado e está <b>pendente de aprovação</b>.</p>
          <p className="muted mt-2 text-xs">
            {done.confirmEmail && 'Enviamos um e-mail de confirmação: abra o link antes de entrar. '}
            O administrador vai analisar seu cadastro. Depois da aprovação, entre com seu e-mail e senha.
          </p>
          <Link to="/login" className="btn-primary mt-5 w-full">Ir para o login</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Cadastro de entrevistador" subtitle="Preencha seus dados. O acesso é liberado após aprovação do administrador.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Field label="Nome completo" error={errors.full_name?.message}><input className="input" autoComplete="name" {...register('full_name')} /></Field>
        <Field label="Telefone (WhatsApp)" error={errors.phone?.message}><input className="input" type="tel" inputMode="tel" placeholder="(00) 00000-0000" autoComplete="tel" {...register('phone')} /></Field>
        <Field label="E-mail" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register('email')} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Senha" error={errors.password?.message}><input className="input" type="password" autoComplete="new-password" {...register('password')} /></Field>
          <Field label="Confirmar senha" error={errors.confirm?.message}><input className="input" type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy" {...register('terms')} />
          <span>Li e aceito os <Link to="/termos" target="_blank" className="btn-link">Termos de Uso</Link>.{errors.terms && <b className="ml-1 text-alert">Obrigatório</b>}</span>
        </label>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy" {...register('privacy')} />
          <span>Li e estou ciente do <Link to="/privacidade" target="_blank" className="btn-link">Aviso de Privacidade</Link>.{errors.privacy && <b className="ml-1 text-alert">Obrigatório</b>}</span>
        </label>
        {error && <Notice tone="bad">{error}</Notice>}
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Enviando…' : 'Enviar cadastro'}</button>
      </form>
      <p className="mt-4 text-center text-xs">Já tem cadastro? <Link className="btn-link" to="/login">Entrar</Link></p>
    </AuthLayout>
  )
}
