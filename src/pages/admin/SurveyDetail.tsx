import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, FileEdit, ListChecks, Pencil, Trash2, UserPlus } from 'lucide-react'
import { Empty, Field, Modal, Notice, PageHeader, Panel, Pill, Progress, Spinner, StatCard } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { api } from '@/services/admin'
import { surveyStatus } from '@/lib/labels'
import { fmtDate, fmtDateTime, fmtNum, fmtPct, pct } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Assignment, QuestionnaireVersion, Survey, SurveyStatus, SurveyTarget } from '@/types/db'

const TRANSITIONS: Record<SurveyStatus, { to: SurveyStatus; label: string; style?: string; confirm?: string }[]> = {
  draft: [{ to: 'in_review', label: 'Enviar para revisão' }, { to: 'published', label: 'Publicar', style: 'btn-gold' }],
  in_review: [{ to: 'draft', label: 'Voltar a rascunho' }, { to: 'published', label: 'Publicar', style: 'btn-gold' }],
  published: [{ to: 'in_progress', label: 'Iniciar coleta', style: 'btn-gold' }, { to: 'suspended', label: 'Suspender', confirm: 'Suspender impede novas entrevistas. Continuar?' }],
  in_progress: [{ to: 'suspended', label: 'Suspender', confirm: 'Suspender impede novas entrevistas. Continuar?' }, { to: 'completed', label: 'Concluir', confirm: 'Concluir encerra a coleta. Continuar?' }],
  suspended: [{ to: 'in_progress', label: 'Reativar', style: 'btn-gold' }, { to: 'completed', label: 'Concluir', confirm: 'Concluir encerra a coleta. Continuar?' }],
  completed: [{ to: 'in_progress', label: 'Reabrir coleta' }, { to: 'archived', label: 'Arquivar', confirm: 'Arquivar remove a pesquisa das listas ativas. Continuar?' }],
  archived: [{ to: 'draft', label: 'Restaurar como rascunho' }],
}

type Tab = 'resumo' | 'equipe' | 'areas' | 'versoes'

export default function SurveyDetail() {
  const { id } = useParams() as { id: string }
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('resumo')
  const [dupOpen, setDupOpen] = useState(false)
  const [dupCode, setDupCode] = useState('')

  const survey = useQuery({
    queryKey: ['survey', id],
    queryFn: async () => { const { data, error } = await supabase.from('surveys').select('*').eq('id', id).single(); if (error) throw error; return data as Survey },
  })
  const versions = useQuery({
    queryKey: ['versions', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('questionnaire_versions').select('id, survey_id, version, status, published_at, created_at')
        .eq('survey_id', id).order('version', { ascending: false })
      if (error) throw error
      return data as QuestionnaireVersion[]
    },
  })
  const stats = useQuery({ queryKey: ['dashboard', id], queryFn: () => api.dashboard(id) })

  async function transition(to: SurveyStatus, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    const { error } = await supabase.rpc('admin_set_survey_status', { _survey: id, _status: to })
    if (error) return toast.error(error)
    toast.ok(`Situação alterada para "${surveyStatus[to].label}".`)
    qc.invalidateQueries({ queryKey: ['survey', id] }); qc.invalidateQueries({ queryKey: ['surveys'] })
  }
  async function duplicate() {
    const { data, error } = await supabase.rpc('admin_duplicate_survey', { _survey: id, _new_code: dupCode.trim().toUpperCase() })
    if (error) return toast.error(error)
    toast.ok('Pesquisa duplicada como rascunho.')
    setDupOpen(false); qc.invalidateQueries({ queryKey: ['surveys'] })
    navigate(`/admin/pesquisas/${data}`)
  }

  if (survey.isLoading) return <Spinner />
  if (!survey.data) return <Notice tone="bad">Pesquisa não encontrada.</Notice>
  const s = survey.data
  const published = versions.data?.find((v) => v.status === 'published')
  const draft = versions.data?.find((v) => v.status === 'draft')
  const st = stats.data
  const valid = st ? st.interviews_total - st.interviews_rejected : 0

  return (
    <>
      <PageHeader eyebrow={`Pesquisa · ${s.code}`} title={s.name}
        description={<span className="flex flex-wrap items-center gap-2"><Pill tone={surveyStatus[s.status].tone}>{surveyStatus[s.status].label}</Pill>
          {s.municipality && <span>{s.municipality}{s.state && `/${s.state}`}</span>}<span>· {fmtDate(s.start_date)} a {fmtDate(s.end_date)}</span></span>}
        actions={<>
          <Link className="btn-primary" to={`/admin/pesquisas/${id}/questionario`}><ListChecks className="h-4 w-4" />Questionário</Link>
          <Link className="btn-soft" to={`/admin/pesquisas/${id}/editar`}><Pencil className="h-4 w-4" />Editar</Link>
          <button className="btn-soft" onClick={() => { setDupCode(`${s.code}-COPIA`.slice(0, 30)); setDupOpen(true) }}><Copy className="h-4 w-4" />Duplicar</button>
        </>} />

      <Panel className="mb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <b>Situação:</b> {surveyStatus[s.status].label}.{' '}
            {published ? <>Questionário publicado: <b>versão {published.version}</b>.</> : <span className="text-alert">Questionário ainda não publicado.</span>}
            {draft && <> Há um rascunho (v{draft.version}) em edição.</>}
          </div>
          <div className="flex flex-wrap gap-2">
            {TRANSITIONS[s.status].map((t) => (
              <button key={t.to} className={cn(t.style ?? 'btn-soft', 'btn-sm')} onClick={() => transition(t.to, t.confirm)}>{t.label}</button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="mb-3.5 grid grid-cols-2 gap-[13px] lg:grid-cols-4">
        <StatCard label="Entrevistas (exceto rejeitadas)" value={valid} hint={`Meta: ${fmtNum(s.target_total)}`} />
        <StatCard label="Execução da meta" value={fmtPct(pct(valid, s.target_total))} />
        <StatCard label="Aprovadas" value={st?.interviews_approved ?? 0} hint={`${st?.interviews_pending ?? 0} pendentes · ${st?.interviews_rejected ?? 0} rejeitadas`} />
        <StatCard label="Entrevistadores ativos (7 dias)" value={st?.interviewers_active_7d ?? 0} />
      </div>

      <div className="mb-3.5 flex gap-1 overflow-x-auto border-b border-line">
        {([['resumo', 'Dados da pesquisa'], ['equipe', 'Equipe e metas'], ['areas', 'Metas por área'], ['versoes', 'Versões do questionário']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold', tab === k ? 'border-gold text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>{l}</button>
        ))}
      </div>

      {tab === 'resumo' && <SurveyData s={s} />}
      {tab === 'equipe' && <Team survey={s} byInterviewer={st?.by_interviewer ?? []} />}
      {tab === 'areas' && <Areas surveyId={id} realized={st?.by_neighborhood ?? []} />}
      {tab === 'versoes' && (
        <Panel title="Versões do questionário">
          {!versions.data?.length ? <Empty title="Nenhuma versão">Abra o questionário para criar a primeira versão.</Empty> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Versão</th><th>Situação</th><th>Criada em</th><th>Publicada em</th><th /></tr></thead>
              <tbody>{versions.data.map((v) => (
                <tr key={v.id}><td>v{v.version}</td>
                  <td><Pill tone={v.status === 'published' ? 'ok' : v.status === 'draft' ? 'wait' : 'off'}>{{ draft: 'Rascunho', published: 'Publicada (em uso)', superseded: 'Substituída' }[v.status]}</Pill></td>
                  <td>{fmtDateTime(v.created_at)}</td><td>{fmtDateTime(v.published_at)}</td>
                  <td><Link className="btn-link text-xs" to={`/admin/pesquisas/${id}/questionario?versao=${v.id}`}>Visualizar</Link></td></tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="k mt-3">Entrevistas permanecem vinculadas à versão em que foram realizadas. Versões publicadas não podem ser alteradas.</p>
        </Panel>
      )}

      <Modal open={dupOpen} onClose={() => setDupOpen(false)} title="Duplicar pesquisa"
        footer={<><button className="btn-soft" onClick={() => setDupOpen(false)}>Cancelar</button><button className="btn-primary" onClick={duplicate}><Copy className="h-4 w-4" />Duplicar</button></>}>
        <p className="muted mb-3 text-xs">Cria uma nova pesquisa em rascunho com os mesmos dados, metas por área e o questionário mais recente (como nova versão 1). Equipe e entrevistas não são copiadas.</p>
        <Field label="Código da nova pesquisa"><input className="input uppercase" value={dupCode} onChange={(e) => setDupCode(e.target.value)} /></Field>
      </Modal>
    </>
  )
}

function SurveyData({ s }: { s: Survey }) {
  const rows: [string, React.ReactNode][] = [
    ['Código', s.code], ['Descrição', s.description], ['Objetivo', s.objective],
    ['Município/UF', s.municipality ? `${s.municipality}${s.state ? `/${s.state}` : ''}` : null], ['Área de abrangência', s.coverage_area],
    ['Período', `${fmtDate(s.start_date)} a ${fmtDate(s.end_date)}`], ['Meta de entrevistas', fmtNum(s.target_total)],
    ['Tipo de amostra', s.sampling_type === 'probabilistic' ? 'Probabilística' : 'Não probabilística'], ['Método de amostragem', s.sampling_method],
    ['Localização (GPS)', s.gps_policy === 'required' ? 'Exigida' : 'Opcional (com alerta)'], ['Duração mínima esperada', `${s.min_duration_seconds} s`],
    ['Responsável', s.responsible], ['Observações', s.notes], ['Última atualização', fmtDateTime(s.updated_at)],
  ]
  return (
    <Panel title="Dados da pesquisa">
      <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="k">{k}</dt><dd className="mt-0.5 whitespace-pre-wrap">{v || '—'}</dd></div>)}
      </dl>
    </Panel>
  )
}

type AssignRow = Assignment & { profiles: { full_name: string; email: string; status: string } | null }

function Team({ survey, byInterviewer }: { survey: Survey; byInterviewer: { interviewer_id: string; total: number }[] }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState('')
  const [target, setTarget] = useState(0)
  const rows = useQuery({
    queryKey: ['assignments', survey.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_assignments')
        .select('id, survey_id, interviewer_id, target, active, assigned_at, profiles:interviewer_id(full_name, email, status)')
        .eq('survey_id', survey.id).eq('active', true).order('assigned_at')
      if (error) throw error
      return data as unknown as AssignRow[]
    },
  })
  const candidates = useQuery({ queryKey: ['interviewers'], queryFn: api.interviewers })
  const done = new Map(byInterviewer.map((b) => [b.interviewer_id, b.total]))
  const assigned = new Set(rows.data?.map((r) => r.interviewer_id))
  const available = (candidates.data ?? []).filter((c) => c.status === 'approved' && !assigned.has(c.id))
  const refresh = () => { qc.invalidateQueries({ queryKey: ['assignments', survey.id] }); qc.invalidateQueries({ queryKey: ['surveys'] }); qc.invalidateQueries({ queryKey: ['interviewers'] }) }

  async function add() {
    if (!pick) return
    const { error } = await supabase.rpc('admin_assign_survey', { _survey: survey.id, _interviewer: pick, _target: target })
    if (error) return toast.error(error)
    toast.ok('Entrevistador atribuído.'); setOpen(false); setPick(''); setTarget(0); refresh()
  }
  async function setRowTarget(r: AssignRow, value: number) {
    if (value === r.target || value < 0 || Number.isNaN(value)) return
    const { error } = await supabase.from('survey_assignments').update({ target: value }).eq('id', r.id)
    if (error) return toast.error(error)
    toast.ok('Meta atualizada.'); refresh()
  }
  async function remove(r: AssignRow) {
    if (!window.confirm(`Remover ${r.profiles?.full_name} desta pesquisa? As entrevistas já enviadas são mantidas.`)) return
    const { error } = await supabase.from('survey_assignments').update({ active: false }).eq('id', r.id)
    if (error) return toast.error(error)
    toast.ok('Atribuição removida.'); refresh()
  }
  const sumTargets = (rows.data ?? []).reduce((a, r) => a + r.target, 0)

  return (
    <Panel title="Equipe e metas individuais" actions={<button className="btn-gold btn-sm" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" />Atribuir entrevistador</button>}>
      {rows.isLoading ? <Spinner /> : !rows.data?.length ? <Empty title="Nenhum entrevistador atribuído">Somente entrevistadores aprovados podem receber pesquisas.</Empty> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Entrevistador</th><th>Meta individual</th><th>Realizadas</th><th>Progresso</th><th>Atribuído em</th><th /></tr></thead>
          <tbody>{rows.data.map((r) => {
            const n = done.get(r.interviewer_id) ?? 0
            return (
              <tr key={r.id}>
                <td><Link className="font-semibold hover:text-gold-deep" to={`/admin/entrevistadores/${r.interviewer_id}`}>{r.profiles?.full_name}</Link><div className="k">{r.profiles?.email}</div></td>
                <td><input type="number" min={0} defaultValue={r.target} aria-label="Meta individual" className="input !w-24 !py-1.5"
                  onBlur={(e) => setRowTarget(r, Number(e.target.value))} /></td>
                <td className="tabular-nums">{n}</td>
                <td className="min-w-[120px]"><Progress value={n} max={r.target} /></td>
                <td>{fmtDate(r.assigned_at)}</td>
                <td><button className="btn-soft btn-sm" onClick={() => remove(r)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            )
          })}</tbody>
        </table></div>
      )}
      <p className="k mt-3">Soma das metas individuais: <b>{fmtNum(sumTargets)}</b> · Meta da pesquisa: <b>{fmtNum(survey.target_total)}</b>
        {sumTargets > 0 && sumTargets !== survey.target_total && <span className="text-[#8a641a]"> (diferença de {fmtNum(Math.abs(survey.target_total - sumTargets))})</span>}</p>

      <Modal open={open} onClose={() => setOpen(false)} title="Atribuir entrevistador"
        footer={<><button className="btn-soft" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={!pick} onClick={add}>Atribuir</button></>}>
        {!available.length ? <Notice>Não há entrevistadores aprovados disponíveis. Aprove cadastros em <Link className="btn-link" to="/admin/entrevistadores?status=pending">Entrevistadores</Link>.</Notice> : (
          <div className="space-y-3">
            <Field label="Entrevistador aprovado"><select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Selecione…</option>{available.map((c) => <option key={c.id} value={c.id}>{c.full_name} — {c.email}</option>)}
            </select></Field>
            <Field label="Meta individual nesta pesquisa"><input type="number" min={0} className="input" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
          </div>
        )}
      </Modal>
    </Panel>
  )
}

function Areas({ surveyId, realized }: { surveyId: string; realized: { municipality: string; neighborhood: string; total: number }[] }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState({ municipality: '', neighborhood: '', sector: '', target: 0 })
  const rows = useQuery({
    queryKey: ['targets', surveyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_targets').select('*').eq('survey_id', surveyId).order('municipality').order('neighborhood')
      if (error) throw error
      return data as SurveyTarget[]
    },
  })
  const doneFor = (t: SurveyTarget) => realized.filter((r) => r.municipality.toLowerCase() === t.municipality.toLowerCase() &&
    (!t.neighborhood || r.neighborhood.toLowerCase() === t.neighborhood.toLowerCase())).reduce((a, r) => a + r.total, 0)

  async function add() {
    if (form.municipality.trim().length < 2) return toast.error('Informe o município.')
    const { error } = await supabase.from('survey_targets').insert({
      survey_id: surveyId, municipality: form.municipality.trim(), neighborhood: form.neighborhood.trim() || null,
      sector: form.sector.trim() || null, target: form.target,
    })
    if (error) return toast.error(error)
    setForm({ municipality: form.municipality, neighborhood: '', sector: '', target: 0 })
    qc.invalidateQueries({ queryKey: ['targets', surveyId] })
  }
  async function del(t: SurveyTarget) {
    const { error } = await supabase.from('survey_targets').delete().eq('id', t.id)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: ['targets', surveyId] })
  }

  return (
    <Panel title="Metas por área (município, bairro, setor)">
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_120px_auto] md:items-end">
        <Field label="Município"><input className="input" value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })} /></Field>
        <Field label="Bairro"><input className="input" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></Field>
        <Field label="Setor"><input className="input" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} /></Field>
        <Field label="Meta"><input type="number" min={0} className="input" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) })} /></Field>
        <button className="btn-primary" onClick={add}>Adicionar</button>
      </div>
      {!rows.data?.length ? <Empty title="Nenhuma meta por área">Opcional: use para acompanhar a distribuição geográfica da coleta.</Empty> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Município</th><th>Bairro</th><th>Setor</th><th>Meta</th><th>Realizadas*</th><th>Progresso</th><th /></tr></thead>
          <tbody>{rows.data.map((t) => {
            const n = doneFor(t)
            return (<tr key={t.id}><td>{t.municipality}</td><td>{t.neighborhood ?? 'Todos'}</td><td>{t.sector ?? '—'}</td><td>{t.target}</td><td>{n}</td>
              <td className="min-w-[120px]"><Progress value={n} max={t.target} /></td>
              <td><button className="btn-soft btn-sm" aria-label="Excluir" onClick={() => del(t)}><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)
          })}</tbody>
        </table></div>
      )}
      <p className="k mt-3"><FileEdit className="mr-1 inline h-3 w-3" />*Contagem por município/bairro informados nas entrevistas não rejeitadas.</p>
    </Panel>
  )
}
