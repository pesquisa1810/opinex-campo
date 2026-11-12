import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, Notice, PageHeader, Panel, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { BR_STATES } from '@/lib/labels'
import type { Survey } from '@/types/db'

const opt = z.string().trim().max(2000).optional().or(z.literal(''))
const schema = z.object({
  name: z.string().trim().min(3, 'Mínimo de 3 caracteres').max(160),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, 'Use letras, números, hífen ou sublinhado (2 a 30)'),
  description: opt, objective: opt, municipality: opt, state: opt, coverage_area: opt,
  start_date: opt, end_date: opt,
  target_total: z.coerce.number().int().min(0, 'Não pode ser negativa'),
  sampling_method: opt,
  sampling_type: z.enum(['probabilistic', 'non_probabilistic']),
  responsible: opt, notes: opt,
  gps_policy: z.enum(['required', 'optional']),
  min_duration_seconds: z.coerce.number().int().min(0).max(36000),
}).refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, { path: ['end_date'], message: 'Data final anterior à inicial' })
type Form = z.input<typeof schema>

const blank = (v: unknown) => (v === '' || v === undefined ? null : v)

export default function SurveyForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const existing = useQuery({
    queryKey: ['survey', id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from('surveys').select('*').eq('id', id!).single(); if (error) throw error; return data as Survey },
  })
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { sampling_type: 'non_probabilistic', gps_policy: 'optional', min_duration_seconds: 120, target_total: 0 },
  })
  useEffect(() => {
    if (existing.data) {
      const s = existing.data
      reset(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ''])) as Form)
    }
  }, [existing.data, reset])

  async function onSubmit(raw: Form) {
    const f = schema.parse(raw)
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, blank(v)]))
    const res = id
      ? await supabase.from('surveys').update(row).eq('id', id).select('id').single()
      : await supabase.from('surveys').insert(row).select('id').single()
    if (res.error) return toast.error(res.error)
    toast.ok(id ? 'Pesquisa atualizada.' : 'Pesquisa criada. Agora elabore o questionário.')
    qc.invalidateQueries({ queryKey: ['surveys'] }); qc.invalidateQueries({ queryKey: ['survey', id] })
    navigate(`/admin/pesquisas/${res.data.id}`)
  }

  if (id && existing.isLoading) return <Spinner />
  const e = errors as Record<string, { message?: string } | undefined>
  return (
    <>
      <PageHeader eyebrow="Gestão de questionários" title={id ? 'Editar pesquisa' : 'Nova pesquisa'}
        description="Os campos marcados com * são obrigatórios." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
        <Panel title="Identificação">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome da pesquisa *" error={e.name?.message}><input className="input" {...register('name')} /></Field>
            <Field label="Código identificador *" error={e.code?.message} hint="Ex.: CAMPINAS-2026-01"><input className="input uppercase" {...register('code')} /></Field>
            <Field label="Descrição" className="md:col-span-2"><textarea rows={2} className="input" {...register('description')} /></Field>
            <Field label="Objetivo" className="md:col-span-2"><textarea rows={2} className="input" {...register('objective')} /></Field>
            <Field label="Responsável"><input className="input" {...register('responsible')} /></Field>
          </div>
        </Panel>
        <Panel title="Abrangência e período">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Município" className="md:col-span-2"><input className="input" {...register('municipality')} /></Field>
            <Field label="Estado"><select className="input" {...register('state')}><option value="">—</option>{BR_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Meta de entrevistas *" error={e.target_total?.message}><input type="number" min={0} className="input" {...register('target_total')} /></Field>
            <Field label="Área de abrangência" className="md:col-span-2"><input className="input" placeholder="Ex.: zona urbana, bairros X e Y" {...register('coverage_area')} /></Field>
            <Field label="Data inicial"><input type="date" className="input" {...register('start_date')} /></Field>
            <Field label="Data final" error={e.end_date?.message}><input type="date" className="input" {...register('end_date')} /></Field>
          </div>
        </Panel>
        <Panel title="Metodologia e regras de campo">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tipo de amostra *" hint="Amostras não probabilísticas não têm margem de erro calculada.">
              <select className="input" {...register('sampling_type')}>
                <option value="non_probabilistic">Não probabilística (cotas, conveniência)</option>
                <option value="probabilistic">Probabilística</option>
              </select>
            </Field>
            <Field label="Método de amostragem"><input className="input" placeholder="Ex.: cotas por sexo e idade" {...register('sampling_method')} /></Field>
            <Field label="Localização (GPS) *" hint="Exigida: a entrevista não é enviada sem GPS. Opcional: envia e gera alerta.">
              <select className="input" {...register('gps_policy')}>
                <option value="optional">Opcional (gera alerta se ausente)</option>
                <option value="required">Exigida</option>
              </select>
            </Field>
            <Field label="Duração mínima esperada (segundos) *" hint="Entrevistas mais curtas recebem alerta de qualidade." error={e.min_duration_seconds?.message}>
              <input type="number" min={0} className="input" {...register('min_duration_seconds')} />
            </Field>
            <Field label="Observações" className="md:col-span-2"><textarea rows={2} className="input" {...register('notes')} /></Field>
          </div>
        </Panel>
        {Object.keys(errors).length > 0 && <Notice tone="bad">Revise os campos destacados.</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-soft" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Salvando…' : 'Salvar pesquisa'}</button>
        </div>
      </form>
    </>
  )
}
