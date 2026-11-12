import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AlertTriangle, CheckCircle2, MapPin, MapPinOff, RefreshCw } from 'lucide-react'
import { Empty, Field, Modal, Notice, PageHeader, Panel, Pill, Spinner, StatCard } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { api } from '@/services/admin'
import { describeAnswer, type Answers } from '@/components/questionnaire/logic'
import { interviewStatus } from '@/lib/labels'
import { fmtDateTime } from '@/lib/format'
import type { InterviewStatus, QuestionnaireSnapshot } from '@/types/db'

interface Row {
  id: string; survey_id: string; interviewer_id: string; municipality: string; neighborhood: string; sector: string | null
  started_at: string; submitted_at: string; duration_seconds: number; status: InterviewStatus; answers_count: number
  quality_score: number; review_note: string | null
  surveys: { code: string; name: string } | null
  profiles: { full_name: string } | null
  interview_locations: { permission: string; latitude: number | null; longitude: number | null; accuracy_m: number | null } | null
  quality_flags: { code: string; severity: 'info' | 'warning' | 'critical'; message: string }[]
}

const dur = (s: number) => `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`
const sevTone = { info: 'info', warning: 'wait', critical: 'bad' } as const

function MapView({ rows, onPick }: { rows: Row[]; onPick: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([-15.8, -47.9], 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])
  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    const pts = rows.filter((r) => r.interview_locations?.latitude != null)
    for (const r of pts) {
      const l = r.interview_locations!
      const color = r.status === 'rejected' ? '#8B0000' : r.quality_flags.some((f) => f.severity !== 'info') ? '#B7791F' : '#101D35'
      L.circleMarker([l.latitude!, l.longitude!], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 })
        .bindTooltip(`${r.surveys?.code} · ${r.profiles?.full_name}<br>${r.neighborhood} · ${fmtDateTime(r.submitted_at)}`)
        .on('click', () => onPick(r.id)).addTo(layer.current!)
    }
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts.map((r) => [r.interview_locations!.latitude!, r.interview_locations!.longitude!])), { padding: [30, 30], maxZoom: 15 })
  }, [rows, onPick])
  return <div ref={el} className="z-0 h-[320px] rounded-[10px] bg-[#e9edf0]" />
}

export default function Monitoring() {
  const qc = useQueryClient()
  const surveys = useQuery({ queryKey: ['surveys'], queryFn: api.surveys })
  const people = useQuery({ queryKey: ['interviewers'], queryFn: api.interviewers })
  const [f, setF] = useState({ survey: '', interviewer: '', municipality: '', neighborhood: '', from: '', to: '', status: '', flagged: false })
  const [open, setOpen] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['monitor', f], refetchInterval: 30_000,
    queryFn: async () => {
      let x = supabase.from('interviews').select('id, survey_id, interviewer_id, municipality, neighborhood, sector, started_at, submitted_at, duration_seconds, status, answers_count, quality_score, review_note, surveys(code, name), profiles:interviewer_id(full_name), interview_locations(permission, latitude, longitude, accuracy_m), quality_flags(code, severity, message)')
        .order('submitted_at', { ascending: false }).limit(500)
      if (f.survey) x = x.eq('survey_id', f.survey)
      if (f.interviewer) x = x.eq('interviewer_id', f.interviewer)
      if (f.municipality) x = x.ilike('municipality', f.municipality)
      if (f.neighborhood) x = x.ilike('neighborhood', `%${f.neighborhood}%`)
      if (f.status) x = x.eq('status', f.status)
      if (f.from) x = x.gte('submitted_at', `${f.from}T00:00:00-03:00`)
      if (f.to) x = x.lte('submitted_at', `${f.to}T23:59:59-03:00`)
      const { data, error } = await x
      if (error) throw error
      return data as unknown as Row[]
    },
  })
  useEffect(() => {
    const ch = supabase.channel('monitor-live').on('postgres_changes', { event: '*', schema: 'public', table: 'interviews' }, () => qc.invalidateQueries({ queryKey: ['monitor'] })).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [qc])

  const rows = useMemo(() => (q.data ?? []).filter((r) => !f.flagged || r.quality_flags.some((x) => x.severity !== 'info')), [q.data, f.flagged])
  const municipalities = useMemo(() => [...new Set((q.data ?? []).map((r) => r.municipality))].sort(), [q.data])
  const [today] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }))
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch })

  return (
    <>
      <PageHeader eyebrow="Operação em campo" title="Monitoramento"
        description="Acompanhe as entrevistas recebidas, a distribuição geográfica e os alertas de qualidade."
        actions={<button className="btn-soft" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" />Atualizar</button>} />

      <div className="mb-3.5 grid grid-cols-2 gap-[13px] lg:grid-cols-4">
        <StatCard label="Entrevistas no filtro" value={rows.length} hint={rows.length >= 500 ? 'Exibindo as 500 mais recentes' : undefined} />
        <StatCard label="Entrevistas hoje" value={rows.filter((r) => new Date(r.submitted_at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) === today).length} />
        <StatCard label="Com GPS registrado" value={rows.filter((r) => r.interview_locations?.permission === 'granted').length} />
        <StatCard label="Com alertas de qualidade" value={rows.filter((r) => r.quality_flags.some((x) => x.severity !== 'info')).length} hint="Alertas não rejeitam automaticamente" />
      </div>

      <Panel title="Filtros" className="mb-3.5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Pesquisa"><select className="input" value={f.survey} onChange={(e) => set({ survey: e.target.value })}><option value="">Todas</option>{surveys.data?.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</select></Field>
          <Field label="Entrevistador"><select className="input" value={f.interviewer} onChange={(e) => set({ interviewer: e.target.value })}><option value="">Todos</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
          <Field label="Município"><select className="input" value={f.municipality} onChange={(e) => set({ municipality: e.target.value })}><option value="">Todos</option>{municipalities.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Bairro"><input className="input" value={f.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} placeholder="Contém…" /></Field>
          <Field label="De"><input type="date" className="input" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
          <Field label="Até"><input type="date" className="input" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
          <Field label="Situação"><select className="input" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">Todas</option>{Object.entries(interviewStatus).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-navy" checked={f.flagged} onChange={(e) => set({ flagged: e.target.checked })} />Somente com alertas</label>
        </div>
      </Panel>

      <div className="grid gap-[15px] xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Mapa das coletas"><MapView rows={rows} onPick={setOpen} />
          <p className="k mt-2">Pontos azuis: sem alertas · dourados: com alertas · vermelhos: rejeitadas. Localização visível apenas para administradores.</p></Panel>
        <Panel title="Entrevistas recebidas">
          {q.isLoading ? <Spinner /> : q.error ? <Notice tone="bad">Erro ao carregar.</Notice> : !rows.length ? <Empty title="Nenhuma entrevista no filtro" /> : (
            <div className="table-wrap max-h-[560px] overflow-y-auto"><table className="tbl">
              <thead className="sticky top-0"><tr><th>Data/hora</th><th>Pesquisa</th><th>Entrevistador</th><th>Local</th><th>Duração</th><th>GPS</th><th>Resp.</th><th>Qualidade</th><th>Status</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-[#fafbfd]" onClick={() => setOpen(r.id)}>
                  <td className="whitespace-nowrap">{fmtDateTime(r.submitted_at)}</td><td className="whitespace-nowrap">{r.surveys?.code}</td><td>{r.profiles?.full_name}</td>
                  <td>{r.neighborhood}<div className="k">{r.municipality}{r.sector && ` · ${r.sector}`}</div></td>
                  <td className="whitespace-nowrap">{dur(r.duration_seconds)}</td>
                  <td>{r.interview_locations?.permission === 'granted' ? <MapPin className="h-4 w-4 text-ok" aria-label="Com GPS" /> : <MapPinOff className="h-4 w-4 text-alert" aria-label="Sem GPS" />}</td>
                  <td>{r.answers_count}</td>
                  <td><Pill tone={r.quality_score >= 85 ? 'ok' : r.quality_score >= 60 ? 'wait' : 'bad'}>{r.quality_score}{r.quality_flags.length > 0 && ` · ${r.quality_flags.length}`}</Pill></td>
                  <td><Pill tone={interviewStatus[r.status].tone}>{interviewStatus[r.status].label}</Pill></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
      </div>
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function ReviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const d = useQuery({
    queryKey: ['interview', id],
    queryFn: async () => {
      const { data: i, error } = await supabase.from('interviews').select('*, surveys(code, name), profiles:interviewer_id(full_name, email), devices(label), interview_locations(*), quality_flags(code, severity, message, details), interview_answers(question_id, option_ids, text_value, numeric_value, other_text)').eq('id', id).single()
      if (error) throw error
      const [v, logs] = await Promise.all([
        supabase.from('questionnaire_versions').select('version, snapshot').eq('id', i.version_id).single(),
        supabase.from('audit_logs').select('id, created_at, after_data, actor_id').eq('entity', 'interviews').eq('entity_id', id).order('created_at', { ascending: false }),
      ])
      return { i, version: v.data as { version: number; snapshot: QuestionnaireSnapshot } | null, logs: logs.data ?? [] }
    },
  })
  async function review(status: InterviewStatus) {
    if ((status === 'rejected' || status === 'needs_revision') && !note.trim()) return toast.error('REASON_REQUIRED')
    const { error } = await supabase.rpc('admin_review_interview', { _interview: id, _status: status, _note: note.trim() || null })
    if (error) return toast.error(error)
    toast.ok(`Entrevista marcada como "${interviewStatus[status].label}".`)
    for (const k of ['monitor', 'interview', 'dashboard', 'results']) qc.invalidateQueries({ queryKey: [k] })
    setNote('')
  }

  const x = d.data
  const i = x?.i as (Row & { interview_answers: { question_id: string; option_ids: string[]; text_value: string | null; numeric_value: number | null; other_text: string | null }[]
    devices: { label: string } | null; profiles: { full_name: string; email: string } | null; version_id: string; reviewed_at: string | null }) | undefined
  const answers: Answers = Object.fromEntries((i?.interview_answers ?? []).map((a) => [a.question_id, { option_ids: a.option_ids, text_value: a.text_value ?? undefined, numeric_value: a.numeric_value, other_text: a.other_text ?? undefined }]))
  const loc = i?.interview_locations

  return (
    <Modal open onClose={onClose} wide title="Análise da entrevista"
      footer={i && <div className="flex w-full flex-col gap-2">
        <Field label="Observação / justificativa (obrigatória para rejeitar ou pedir revisão)"><textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-soft btn-sm" onClick={() => review('under_review')}>Em análise</button>
          <button className="btn-soft btn-sm" onClick={() => review('needs_revision')}>Necessita revisão</button>
          <button className="btn-danger btn-sm" onClick={() => review('rejected')}>Rejeitar</button>
          <button className="btn-gold btn-sm" onClick={() => review('approved')}><CheckCircle2 className="h-4 w-4" />Aprovar</button>
        </div></div>}>
      {d.isLoading || !i ? <Spinner /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Pill tone={interviewStatus[i.status].tone}>{interviewStatus[i.status].label}</Pill>
            <span className="font-mono text-xs">Protocolo {i.id.slice(0, 8).toUpperCase()}</span><span className="k">Questionário v{x?.version?.version}</span></div>
          {i.review_note && <Notice>Última justificativa: {i.review_note} {i.reviewed_at && `(${fmtDateTime(i.reviewed_at)})`}</Notice>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([['Pesquisa', `${i.surveys?.code} — ${i.surveys?.name}`], ['Entrevistador', i.profiles?.full_name], ['Dispositivo', i.devices?.label],
              ['Local', `${i.neighborhood} · ${i.municipality}${i.sector ? ` · ${i.sector}` : ''}`], ['Início (servidor)', fmtDateTime(i.started_at)],
              ['Envio', fmtDateTime(i.submitted_at)], ['Duração', dur(i.duration_seconds)], ['Respostas', i.answers_count],
              ['GPS', loc?.permission === 'granted' ? `${loc.latitude?.toFixed(5)}, ${loc.longitude?.toFixed(5)} (±${Math.round(loc.accuracy_m ?? 0)} m)` : 'Não registrado']] as [string, unknown][]).map(([k, v]) => (
              <div key={k}><dt className="k">{k}</dt><dd className="font-medium">{String(v ?? '—')}</dd></div>
            ))}
          </dl>
          {loc?.permission === 'granted' && <a className="btn-link text-xs" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=17/${loc.latitude}/${loc.longitude}`}>Abrir localização no mapa</a>}

          <div>
            <h3 className="!mb-2">Alertas de qualidade · pontuação {i.quality_score}/100</h3>
            {!i.quality_flags.length ? <p className="k">Nenhum alerta.</p> : (
              <ul className="space-y-1">{i.quality_flags.map((fl) => (
                <li key={fl.code} className="flex items-start gap-2 text-xs"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-deep" /><Pill tone={sevTone[fl.severity]}>{{ info: 'Informativo', warning: 'Atenção', critical: 'Crítico' }[fl.severity]}</Pill>{fl.message}</li>
              ))}</ul>
            )}
            <p className="k mt-1">Os alertas orientam a análise. A decisão de aprovar ou rejeitar é sempre do administrador.</p>
          </div>

          <div>
            <h3 className="!mb-2">Respostas</h3>
            <ol className="space-y-1.5">{x?.version?.snapshot.questions.map((qq) => (
              <li key={qq.id} className="rounded-lg border border-line p-2.5"><div className="text-xs font-bold">{qq.position}. {qq.text}</div>
                <div className={answers[qq.id] ? '' : 'k'}>{answers[qq.id] ? describeAnswer(qq, answers[qq.id]) : 'Não respondida / não se aplica'}</div></li>
            ))}</ol>
          </div>

          {!!x?.logs.length && (
            <div><h3 className="!mb-2">Histórico de análise</h3>
              <ul className="space-y-1 text-xs">{x.logs.map((l) => (
                <li key={l.id} className="muted">{fmtDateTime(l.created_at)} → <b>{interviewStatus[(l.after_data as { status: InterviewStatus }).status]?.label}</b>{(l.after_data as { review_note?: string }).review_note && `: ${(l.after_data as { review_note?: string }).review_note}`}</li>
              ))}</ul></div>
          )}
        </div>
      )}
    </Modal>
  )
}
