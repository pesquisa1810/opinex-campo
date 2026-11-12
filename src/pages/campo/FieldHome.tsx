import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, FileClock, Play, QrCode, ShieldAlert, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'
import { Pill, Progress, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { drafts } from '@/lib/drafts'
import { interviewStatus, userStatus } from '@/lib/labels'
import { fmtDate, fmtDateTime } from '@/lib/format'
import type { InterviewStatus, Survey } from '@/types/db'
import { useState } from 'react'
import InstallPrompt from '@/components/InstallPrompt'

interface Productivity {
  individual_target: number | null; total: number; today: number; approved: number; rejected: number; pending: number
  by_survey: { survey_id: string; target: number; done: number }[]
}

export default function FieldHome() {
  const { profile, session } = useAuth()
  const device = useDevice()
  const navigate = useNavigate()
  const uid = session?.user.id ?? ''
  const [, force] = useState(0)
  const approved = profile?.status === 'approved'

  const data = useQuery({
    queryKey: ['field-home', uid], enabled: approved,
    queryFn: async () => {
      const [s, p, h] = await Promise.all([
        supabase.from('surveys').select('id, code, name, municipality, state, status, start_date, end_date, gps_policy').order('name'),
        supabase.rpc('my_productivity'),
        supabase.from('interviews').select('id, submitted_at, status, municipality, neighborhood, surveys(code)').order('submitted_at', { ascending: false }).limit(15),
      ])
      for (const r of [s, p, h]) if (r.error) throw r.error
      return {
        surveys: s.data as Pick<Survey, 'id' | 'code' | 'name' | 'municipality' | 'state' | 'status' | 'start_date' | 'end_date' | 'gps_policy'>[],
        prod: p.data as Productivity,
        history: h.data as unknown as { id: string; submitted_at: string; status: InterviewStatus; municipality: string; neighborhood: string; surveys: { code: string } }[],
      }
    },
  })

  if (!profile) return null
  const st = userStatus[profile.status]
  const pending = uid ? drafts.list(uid) : []
  const devOk = device.state === 'ok'

  return (
    <div className="space-y-3">
      <InstallPrompt />
      <div className="panel">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><div className="eyebrow">Entrevistador</div><div className="truncate font-bold">{profile.full_name}</div></div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        {approved && (
          <Link to="/campo/dispositivo" className="mt-3 flex items-center justify-between rounded-lg bg-soft p-3 text-xs">
            <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" />Celular:</span>
            {device.state === undefined ? <span className="k">verificando…</span>
              : devOk ? <Pill tone="ok">Autorizado</Pill>
                : device.state === 'revoked' ? <Pill tone="bad">Revogado</Pill> : <Pill tone="wait">Não autorizado</Pill>}
          </Link>
        )}
      </div>

      {profile.status === 'pending' && (
        <div className="notice flex gap-3 !text-sm"><Clock className="h-5 w-5 shrink-0" />
          <div><b>Cadastro em análise.</b> O administrador ainda não aprovou seu acesso. Assim que for aprovado, atualize esta página.</div></div>
      )}
      {['rejected', 'blocked', 'inactive'].includes(profile.status) && (
        <div className="notice notice-bad flex gap-3 !text-sm"><ShieldAlert className="h-5 w-5 shrink-0" />
          <div><b>Acesso indisponível.</b> {profile.status_reason ?? 'Procure o administrador da pesquisa.'}</div></div>
      )}

      {approved && !devOk && device.state !== undefined && (
        <div className="notice flex gap-3 !text-sm"><QrCode className="h-5 w-5 shrink-0" />
          <div className="flex-1"><b>{device.state === 'revoked' ? 'Autorização revogada.' : 'Autorize este celular para coletar.'}</b>
            <div className="mt-2"><Link to="/campo/dispositivo" className="btn-gold btn-sm">Autorizar este celular</Link></div></div></div>
      )}

      {pending.length > 0 && (
        <div className="panel !border-gold/60">
          <h3 className="flex items-center gap-2"><FileClock className="h-4 w-4 text-gold-deep" />Entrevistas não enviadas ({pending.length})</h3>
          <p className="k -mt-2 mb-2">Ficam guardadas neste celular até serem enviadas. Não contam como concluídas.</p>
          <ul className="space-y-2">{pending.map((d) => (
            <li key={d.session_id} className="flex items-center gap-2 rounded-lg border border-line p-2.5 text-xs">
              <div className="min-w-0 flex-1"><b>{d.survey.code}</b> · iniciada {fmtDateTime(d.started_at)}
                {d.last_error && <div className="text-alert">{d.last_error}</div>}</div>
              <button className="btn-primary btn-sm" onClick={() => navigate(`/campo/entrevista/${d.session_id}`)}>Retomar</button>
              <button className="btn-soft btn-sm" aria-label="Descartar" onClick={() => {
                if (window.confirm('Descartar esta entrevista? As respostas serão perdidas.')) { drafts.remove(uid, d.session_id); force((x) => x + 1) }
              }}><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}</ul>
        </div>
      )}

      {approved && (data.isLoading ? <Spinner /> : data.data && (
        <>
          <div>
            <h3 className="mb-2 mt-4">Minhas pesquisas</h3>
            {!data.data.surveys.length ? <div className="panel k">Nenhuma pesquisa liberada para você no momento.</div> : (
              <div className="space-y-2">{data.data.surveys.map((s) => {
                const goal = data.data.prod.by_survey.find((b) => b.survey_id === s.id)
                return (
                  <div key={s.id} className="panel">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="font-bold leading-snug">{s.name}</div>
                        <div className="k">{s.code} · {s.municipality ?? '—'}{s.state && `/${s.state}`} · até {fmtDate(s.end_date)}</div></div>
                      {s.gps_policy === 'required' && <Pill tone="info">GPS exigido</Pill>}
                    </div>
                    {goal && <div className="mt-3"><div className="mb-1 flex justify-between text-xs"><span>Minha meta</span><b className="tabular-nums">{goal.done} / {goal.target}</b></div><Progress value={goal.done} max={goal.target} /></div>}
                    <button className="btn-primary mt-3 w-full" disabled={!devOk} onClick={() => navigate(`/campo/entrevista/nova/${s.id}`)}>
                      <Play className="h-4 w-4" />Iniciar entrevista</button>
                  </div>
                )
              })}</div>
            )}
          </div>

          <div className="panel">
            <h3>Minha produtividade</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="num !text-2xl">{data.data.prod.today}</div><div className="k">Hoje</div></div>
              <div><div className="num !text-2xl">{data.data.prod.total}</div><div className="k">Total</div></div>
              <div><div className="num !text-2xl">{data.data.prod.approved}</div><div className="k">Aprovadas</div></div>
            </div>
            <div className="k mt-2 text-center">{data.data.prod.pending} em análise · {data.data.prod.rejected} rejeitadas</div>
            {!!data.data.prod.individual_target && (
              <div className="mt-3"><div className="mb-1 flex justify-between text-xs"><span>Meta individual</span>
                <b>{data.data.prod.total - data.data.prod.rejected} / {data.data.prod.individual_target}</b></div>
                <Progress value={data.data.prod.total - data.data.prod.rejected} max={data.data.prod.individual_target} /></div>
            )}
          </div>

          <div className="panel">
            <h3>Meu histórico</h3>
            {!data.data.history.length ? <p className="k">Nenhuma entrevista enviada ainda.</p> : (
              <ul className="divide-y divide-line">{data.data.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0"><b>{h.surveys.code}</b> · {h.neighborhood}<div className="k">{fmtDateTime(h.submitted_at)}</div></div>
                  <Pill tone={interviewStatus[h.status].tone}>{interviewStatus[h.status].label}</Pill>
                </li>
              ))}</ul>
            )}
          </div>
        </>
      ))}
      {approved && devOk && <p className="flex items-center justify-center gap-1 text-[10px] text-ink-muted"><ShieldCheck className="h-3 w-3" />Celular autorizado · validação no servidor</p>}
      <p className="text-center text-[10px] text-ink-muted">O entrevistador não tem acesso aos resultados da pesquisa. <ChevronRight className="inline h-3 w-3" /></p>
    </div>
  )
}
