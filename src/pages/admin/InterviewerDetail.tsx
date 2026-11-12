import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LogOut, Plus } from 'lucide-react'
import { Empty, Field, Modal, Notice, PageHeader, Panel, Pill, Progress, Spinner, StatCard } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { api } from '@/services/admin'
import { interviewStatus, surveyStatus, userStatus } from '@/lib/labels'
import { fmtDate, fmtDateTime } from '@/lib/format'
import type { InterviewStatus, SurveyStatus } from '@/types/db'
import { useStatusChange } from './interviewerActions'

export default function InterviewerDetail() {
  const { id } = useParams() as { id: string }
  const toast = useToast()
  const qc = useQueryClient()
  const { ask, modal } = useStatusChange()
  const [assignOpen, setAssignOpen] = useState(false)
  const [pick, setPick] = useState('')
  const [target, setTarget] = useState(0)

  const all = useQuery({ queryKey: ['interviewers'], queryFn: api.interviewers })
  const me = all.data?.find((x) => x.id === id)
  const extra = useQuery({
    queryKey: ['interviewer', id],
    queryFn: async () => {
      const [ip, asg, iv, dev, logs] = await Promise.all([
        supabase.from('interviewer_profiles').select('individual_target, notes').eq('user_id', id).maybeSingle(),
        supabase.from('survey_assignments').select('id, survey_id, target, active, assigned_at, surveys(code, name, status)').eq('interviewer_id', id).eq('active', true),
        supabase.from('interviews').select('id, survey_id, municipality, neighborhood, submitted_at, status, duration_seconds, quality_score, surveys(code)').eq('interviewer_id', id).order('submitted_at', { ascending: false }).limit(50),
        supabase.from('devices').select('id, label, status, authorized_at, last_seen_at, revoked_at').eq('interviewer_id', id).order('authorized_at', { ascending: false }),
        supabase.from('audit_logs').select('id, action, entity, created_at, after_data').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
      ])
      for (const r of [ip, asg, iv, dev, logs]) if (r.error) throw r.error
      return {
        profile: ip.data as { individual_target: number; notes: string | null } | null,
        assignments: asg.data as unknown as { id: string; survey_id: string; target: number; assigned_at: string; surveys: { code: string; name: string; status: SurveyStatus } }[],
        interviews: iv.data as unknown as { id: string; survey_id: string; municipality: string; neighborhood: string; submitted_at: string; status: InterviewStatus; duration_seconds: number; quality_score: number; surveys: { code: string } }[],
        devices: dev.data as { id: string; label: string; status: string; authorized_at: string; last_seen_at: string | null; revoked_at: string | null }[],
        logs: logs.data as { id: number; action: string; entity: string; created_at: string; after_data: Record<string, unknown> | null }[],
      }
    },
  })
  const surveys = useQuery({ queryKey: ['surveys'], queryFn: api.surveys })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['interviewer', id] }); qc.invalidateQueries({ queryKey: ['interviewers'] }) }

  async function saveTarget(v: number) {
    if (Number.isNaN(v) || v < 0 || v === extra.data?.profile?.individual_target) return
    const { error } = await supabase.from('interviewer_profiles').update({ individual_target: v }).eq('user_id', id)
    if (error) return toast.error(error)
    toast.ok('Meta individual atualizada.'); refresh()
  }
  async function assign() {
    const { error } = await supabase.rpc('admin_assign_survey', { _survey: pick, _interviewer: id, _target: target })
    if (error) return toast.error(error)
    toast.ok('Pesquisa atribuída.'); setAssignOpen(false); setPick(''); setTarget(0); refresh()
  }
  async function unassign(aid: string) {
    if (!window.confirm('Remover esta atribuição? As entrevistas já enviadas são mantidas.')) return
    const { error } = await supabase.from('survey_assignments').update({ active: false }).eq('id', aid)
    if (error) return toast.error(error)
    toast.ok('Atribuição removida.'); refresh()
  }
  async function revokeSessions() {
    if (!window.confirm('Encerrar todas as sessões abertas deste entrevistador? Ele precisará entrar novamente.')) return
    const { data, error } = await supabase.rpc('admin_revoke_sessions', { _user: id })
    if (error) return toast.error(error)
    toast.ok(`${data} sessão(ões) encerrada(s).`); refresh()
  }

  if (all.isLoading || extra.isLoading) return <Spinner />
  if (!me) return <Notice tone="bad">Entrevistador não encontrado.</Notice>
  const x = extra.data!
  const assignedIds = new Set(x.assignments.map((a) => a.survey_id))
  const assignable = (surveys.data ?? []).filter((s) => !assignedIds.has(s.id) && !['completed', 'archived'].includes(s.status))
  const doneBy = (sid: string) => x.interviews.filter((i) => i.survey_id === sid && i.status !== 'rejected').length

  return (
    <>
      <PageHeader eyebrow="Equipe de campo" title={me.full_name}
        description={<span className="flex flex-wrap items-center gap-2"><Pill tone={userStatus[me.status].tone}>{userStatus[me.status].label}</Pill>{me.email} · {me.phone ?? 'sem telefone'} · cadastro em {fmtDate(me.created_at)}</span>}
        actions={<>
          <Link className="btn-soft" to="/admin/entrevistadores"><ArrowLeft className="h-4 w-4" />Voltar</Link>
          {me.status === 'pending' && <><button className="btn-gold" onClick={() => ask(id, me.full_name, 'approved')}>Aprovar</button><button className="btn-soft" onClick={() => ask(id, me.full_name, 'rejected')}>Rejeitar</button></>}
          {me.status === 'approved' && <><button className="btn-soft" onClick={() => ask(id, me.full_name, 'inactive')}>Inativar</button><button className="btn-danger" onClick={() => ask(id, me.full_name, 'blocked')}>Bloquear</button></>}
          {['rejected', 'blocked', 'inactive'].includes(me.status) && <button className="btn-gold" onClick={() => ask(id, me.full_name, 'approved')}>Reativar / aprovar</button>}
          <button className="btn-soft" onClick={revokeSessions}><LogOut className="h-4 w-4" />Revogar sessões</button>
        </>} />
      {me.status_reason && <Notice>Justificativa registrada: {me.status_reason}</Notice>}

      <div className="mb-3.5 grid grid-cols-2 gap-[13px] lg:grid-cols-4">
        <StatCard label="Entrevistas realizadas" value={me.interviews} hint={me.last_interview_at ? `Última: ${fmtDateTime(me.last_interview_at)}` : 'Nenhuma ainda'} />
        <StatCard label="Aprovadas" value={me.approved} />
        <StatCard label="Pendentes de análise" value={me.pending} />
        <StatCard label="Rejeitadas" value={me.rejected} />
      </div>

      <div className="grid gap-[15px] lg:grid-cols-2">
        <Panel title="Meta individual e pesquisas atribuídas" actions={me.status === 'approved' && <button className="btn-gold btn-sm" onClick={() => setAssignOpen(true)}><Plus className="h-3.5 w-3.5" />Atribuir pesquisa</button>}>
          <div className="mb-4 flex items-end gap-3">
            <Field label="Meta individual geral" className="max-w-[180px]">
              <input type="number" min={0} className="input" defaultValue={x.profile?.individual_target ?? 0} key={x.profile?.individual_target} onBlur={(e) => saveTarget(Number(e.target.value))} />
            </Field>
            <div className="flex-1 pb-3"><Progress value={me.interviews - me.rejected} max={x.profile?.individual_target ?? 0} /></div>
          </div>
          {!x.assignments.length ? <Empty title="Nenhuma pesquisa atribuída" /> : (
            <ul className="space-y-2">{x.assignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><Link to={`/admin/pesquisas/${a.survey_id}`} className="font-semibold hover:text-gold-deep">{a.surveys.name}</Link>
                    <div className="k">{a.surveys.code} · <Pill tone={surveyStatus[a.surveys.status].tone}>{surveyStatus[a.surveys.status].label}</Pill></div></div>
                  <button className="btn-soft btn-sm" onClick={() => unassign(a.id)}>Remover</button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs"><span className="tabular-nums">{doneBy(a.survey_id)} / {a.target}</span><div className="flex-1"><Progress value={doneBy(a.survey_id)} max={a.target} /></div></div>
              </li>
            ))}</ul>
          )}
        </Panel>

        <Panel title="Celulares autorizados">
          {!x.devices.length ? <Empty title="Nenhum celular autorizado">A autorização é feita por QR Code no módulo Dispositivos.</Empty> : (
            <ul className="space-y-2">{x.devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-xs">
                <div><b>{d.label}</b><div className="k">Autorizado em {fmtDateTime(d.authorized_at)} · último acesso {fmtDateTime(d.last_seen_at)}</div></div>
                <Pill tone={d.status === 'active' ? 'ok' : 'off'}>{d.status === 'active' ? 'Ativo' : 'Revogado'}</Pill>
              </li>
            ))}</ul>
          )}
        </Panel>

        <Panel title="Histórico de entrevistas (últimas 50)" className="lg:col-span-2">
          {!x.interviews.length ? <Empty title="Nenhuma entrevista enviada" /> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Data/hora</th><th>Pesquisa</th><th>Local</th><th>Duração</th><th>Qualidade</th><th>Status</th></tr></thead>
              <tbody>{x.interviews.map((i) => (
                <tr key={i.id}><td>{fmtDateTime(i.submitted_at)}</td><td>{i.surveys.code}</td><td>{i.neighborhood} · {i.municipality}</td>
                  <td>{Math.floor(i.duration_seconds / 60)}min {i.duration_seconds % 60}s</td>
                  <td><Pill tone={i.quality_score >= 85 ? 'ok' : i.quality_score >= 60 ? 'wait' : 'bad'}>{i.quality_score}</Pill></td>
                  <td><Pill tone={interviewStatus[i.status].tone}>{interviewStatus[i.status].label}</Pill></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>

        <Panel title="Histórico administrativo" className="lg:col-span-2">
          {!x.logs.length ? <Empty title="Sem registros" /> : (
            <ul className="space-y-1.5 text-xs">{x.logs.map((l) => (
              <li key={l.id} className="muted"><span className="text-ink">{fmtDateTime(l.created_at)}</span> · {l.action} {l.entity}
                {l.after_data && 'status' in l.after_data && <> → <b>{userStatus[l.after_data.status as keyof typeof userStatus]?.label ?? String(l.after_data.status)}</b></>}</li>
            ))}</ul>
          )}
        </Panel>
      </div>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Atribuir pesquisa"
        footer={<><button className="btn-soft" onClick={() => setAssignOpen(false)}>Cancelar</button><button className="btn-primary" disabled={!pick} onClick={assign}>Atribuir</button></>}>
        <div className="space-y-3">
          <Field label="Pesquisa"><select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Selecione…</option>{assignable.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name} ({surveyStatus[s.status].label})</option>)}
          </select></Field>
          <Field label="Meta nesta pesquisa"><input type="number" min={0} className="input" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
        </div>
      </Modal>
      {modal}
    </>
  )
}
