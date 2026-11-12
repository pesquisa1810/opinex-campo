import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FileDown, FileSpreadsheet, FileText, Table2 } from 'lucide-react'
import { BarList, Empty, Field, Notice, PageHeader, Panel, Spinner, StatCard } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { api } from '@/services/admin'
import { exportCsv, exportMicroCsv, exportPdf, exportXlsx } from '@/services/exports'
import { interviewStatus, questionType } from '@/lib/labels'
import { fmtDate, fmtNum, fmtPct, pct } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { InterviewStatus, MicroRow, ResultQuestion, SurveyResults } from '@/types/db'

const PALETTE = ['#101D35', '#C6A66B', '#3E5C8A', '#A17D35', '#7E93B5', '#E3D3B0', '#26406B', '#8B6B2E', '#B9C4D6']
const ALL_STATUSES: InterviewStatus[] = ['received', 'under_review', 'approved', 'needs_revision', 'rejected']
type Chart = 'barras' | 'colunas' | 'setores'
type Base = 'valid' | 'base'

export default function Results() {
  const toast = useToast()
  const surveys = useQuery({ queryKey: ['surveys'], queryFn: api.surveys })
  const [survey, setSurvey] = useState('')
  const [statuses, setStatuses] = useState<InterviewStatus[]>(['approved', 'received', 'under_review'])
  const [municipality, setMunicipality] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [base, setBase] = useState<Base>('valid')
  const [busy, setBusy] = useState<string | null>(null)
  const selected = survey || surveys.data?.find((s) => s.interviews > 0)?.id || surveys.data?.[0]?.id || ''

  const places = useQuery({ queryKey: ['dashboard', selected], enabled: !!selected, queryFn: () => api.dashboard(selected) })
  const results = useQuery({
    queryKey: ['results', selected, statuses, municipality, neighborhood, from, to], enabled: !!selected && statuses.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_survey_results', {
        _survey: selected, _statuses: statuses, _municipality: municipality || null, _neighborhood: neighborhood || null, _from: from || null, _to: to || null,
      })
      if (error) throw error
      return data as SurveyResults
    },
  })
  const neighborhoods = useMemo(() => (places.data?.by_neighborhood ?? []).filter((n) => !municipality || n.municipality === municipality), [places.data, municipality])

  async function run(kind: 'pdf' | 'xlsx' | 'csv' | 'micro') {
    const r = results.data
    if (!r) return
    setBusy(kind)
    try {
      if (kind === 'pdf') exportPdf(r)
      else if (kind === 'csv') exportCsv(r)
      else {
        const { data, error } = await supabase.rpc('admin_export_microdata', { _survey: selected, _statuses: statuses })
        if (error) throw error
        const micro = (data as MicroRow[]).filter((m) => (!municipality || m.municipio.toLowerCase() === municipality.toLowerCase())
          && (!neighborhood || m.bairro.toLowerCase() === neighborhood.toLowerCase())
          && (!from || m.enviada_em.slice(0, 10) >= from) && (!to || m.enviada_em.slice(0, 10) <= to))
        if (kind === 'xlsx') await exportXlsx(r, micro)
        else exportMicroCsv(r, micro)
      }
      toast.ok('Arquivo gerado.')
    } catch (e) { toast.error(e) } finally { setBusy(null) }
  }

  const r = results.data
  return (
    <>
      <PageHeader eyebrow="Área restrita ao administrador" title="Apuração e relatórios"
        description="Consolidação descritiva das respostas, com denominadores explícitos."
        actions={<>
          <button className="btn-gold" disabled={!r || !!busy} onClick={() => run('pdf')}><FileDown className="h-4 w-4" />Exportar PDF</button>
          <button className="btn-soft" disabled={!r || !!busy} onClick={() => run('xlsx')}><FileSpreadsheet className="h-4 w-4" />Excel</button>
          <button className="btn-soft" disabled={!r || !!busy} onClick={() => run('csv')}><FileText className="h-4 w-4" />CSV</button>
          <button className="btn-soft" disabled={!r || !!busy} onClick={() => run('micro')} title="Uma linha por entrevista"><Table2 className="h-4 w-4" />Microdados CSV</button>
        </>} />
      <Notice><b>Área administrativa:</b> resultados nunca são disponibilizados ao entrevistador. O sistema não calcula margem de erro automaticamente,
        não produz rankings de candidatos, previsões ou recomendações, e não afirma representatividade populacional.</Notice>

      <Panel title="Selecionar pesquisa e critérios">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Pesquisa"><select className="input" value={selected} onChange={(e) => { setSurvey(e.target.value); setMunicipality(''); setNeighborhood('') }}>
            {surveys.data?.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select></Field>
          <Field label="Município"><select className="input" value={municipality} onChange={(e) => { setMunicipality(e.target.value); setNeighborhood('') }}>
            <option value="">Todos</option>{places.data?.by_municipality.map((m) => <option key={m.municipality}>{m.municipality}</option>)}</select></Field>
          <Field label="Bairro"><select className="input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
            <option value="">Todos</option>{neighborhoods.map((n) => <option key={n.municipality + n.neighborhood} value={n.neighborhood}>{n.neighborhood}</option>)}</select></Field>
          <Field label="Período: de"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Período: até"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Base de cálculo dos percentuais"><select className="input" value={base} onChange={(e) => setBase(e.target.value as Base)}>
            <option value="valid">Respostas válidas da pergunta</option><option value="base">Entrevistas incluídas</option></select></Field>
        </div>
        <div className="mt-3">
          <span className="field-label">Situações das entrevistas incluídas</span>
          <div className="flex flex-wrap gap-2">{ALL_STATUSES.map((s) => {
            const on = statuses.includes(s)
            return <button key={s} type="button" aria-pressed={on} onClick={() => setStatuses(on ? statuses.filter((x) => x !== s) : [...statuses, s])}
              className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', on ? 'border-gold bg-[#fff9eb] text-ink' : 'border-line text-ink-muted')}>{interviewStatus[s].label}</button>
          })}</div>
          {!statuses.length && <p className="mt-1 text-xs text-alert">Selecione ao menos uma situação.</p>}
        </div>
      </Panel>

      {!surveys.data?.length ? <Panel className="mt-4"><Empty title="Nenhuma pesquisa cadastrada" /></Panel>
        : results.isLoading ? <Spinner /> : results.error ? <Notice tone="bad">Erro ao apurar resultados.</Notice> : r && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-[13px] lg:grid-cols-4">
            <StatCard label="Entrevistas incluídas" value={r.interviews_included} accent />
            <StatCard label="Meta da pesquisa" value={r.survey.target_total} hint={`${fmtPct(pct(r.interviews_included, r.survey.target_total))} da meta`} />
            <StatCard label="Tipo de amostra" value={<span className="text-lg">{r.survey.sampling_type === 'probabilistic' ? 'Probabilística' : 'Não probabilística'}</span>} hint={r.survey.sampling_method ?? undefined} />
            <StatCard label="Período da pesquisa" value={<span className="text-lg">{fmtDate(r.survey.start_date)}</span>} hint={`até ${fmtDate(r.survey.end_date)}`} />
          </div>
          <Notice><b>Nota metodológica:</b> {r.methodology_note}</Notice>

          {r.interviews_included === 0 ? <Panel><Empty title="Nenhuma entrevista no filtro selecionado">Ajuste os critérios acima.</Empty></Panel> : (
            <div className="space-y-[15px]">
              {r.questions.map((q) => <QuestionResult key={q.position} q={q} base={base} />)}
              <div className="grid gap-[15px] lg:grid-cols-2">
                <Panel title="Comparação entre municípios"><BarList items={r.by_municipality.map((x) => ({ label: x.label, value: x.total }))} /></Panel>
                <Panel title="Comparação entre bairros"><BarList items={r.by_neighborhood.slice(0, 15).map((x) => ({ label: x.label, value: x.total }))} /></Panel>
                <Panel title="Evolução temporal da coleta">
                  <div className="h-52"><ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={r.by_day.map((d) => ({ dia: fmtDate(d.day).slice(0, 5), total: d.total }))} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip /><Area dataKey="total" name="Entrevistas" stroke="#A17D35" fill="#E3D3B0" />
                    </AreaChart></ResponsiveContainer></div>
                </Panel>
                <Panel title="Produtividade por entrevistador"><BarList items={r.by_interviewer.map((x) => ({ label: x.label, value: x.total }))} /></Panel>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

function QuestionResult({ q, base }: { q: ResultQuestion; base: Base }) {
  const [chart, setChart] = useState<Chart>('barras')
  const [showAll, setShowAll] = useState(false)
  const denom = base === 'valid' ? q.valid_responses : q.base_interviews
  const data = (q.options ?? []).map((o) => ({ name: o.label, value: o.count, pct: base === 'valid' ? o.pct_valid : o.pct_base }))
  const texts = q.texts ?? []

  return (
    <Panel title={<span>P{q.position}. {q.text}</span>} actions={q.options && (
      <div className="flex shrink-0 gap-1">{(['barras', 'colunas', 'setores'] as Chart[]).map((c) => (
        <button key={c} onClick={() => setChart(c)} className={cn('rounded-md px-2 py-1 text-xs font-semibold capitalize', chart === c ? 'bg-navy text-white' : 'bg-soft text-navy-2')}>{c}</button>
      ))}</div>
    )}>
      <p className="k -mt-2 mb-3">{questionType[q.type].label} · Respostas válidas: <b>{fmtNum(q.valid_responses)}</b> · Não resposta / não se aplica: <b>{fmtNum(q.non_responses)}</b> · Entrevistas incluídas: <b>{fmtNum(q.base_interviews)}</b>
        {q.type === 'multiple_choice' && ' · Múltipla escolha: a soma dos percentuais pode ultrapassar 100%.'}</p>

      {q.options && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div>
            {chart === 'barras' && data.map((d) => (
              <div key={d.name} className="my-3 grid grid-cols-[minmax(90px,160px)_1fr_auto] items-center gap-2 text-xs">
                <span className="truncate" title={d.name}>{d.name}</span>
                <div className="track"><div className="fill" style={{ width: `${d.pct ?? 0}%` }} /></div>
                <b className="w-14 text-right tabular-nums">{d.pct == null ? '—' : fmtPct(d.pct)}</b>
              </div>
            ))}
            {chart === 'colunas' && (
              <div className="h-60"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}><CartesianGrid stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} /><YAxis unit="%" tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => `${v}%`} /><Bar dataKey="pct" name="%" fill="#C6A66B" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer></div>
            )}
            {chart === 'setores' && (
              <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={85} innerRadius={40} paddingAngle={1}>
                  {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie>
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
              </ResponsiveContainer></div>
            )}
          </div>
          <div className="table-wrap"><table className="tbl !min-w-0">
            <thead><tr><th>Alternativa</th><th className="text-right">Freq. absoluta</th><th className="text-right">Freq. relativa</th></tr></thead>
            <tbody>
              {q.options.map((o) => (
                <tr key={o.code + o.label}><td>{o.label}</td><td className="text-right tabular-nums">{fmtNum(o.count)}</td>
                  <td className="text-right tabular-nums">{(base === 'valid' ? o.pct_valid : o.pct_base) == null ? '—' : fmtPct((base === 'valid' ? o.pct_valid : o.pct_base)!)}</td></tr>
              ))}
              <tr className="font-semibold"><td>Base ({base === 'valid' ? 'respostas válidas' : 'entrevistas incluídas'})</td><td className="text-right">{fmtNum(denom)}</td><td /></tr>
            </tbody>
          </table>
          {!!q.others?.length && <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Especificações de “Outro” ({q.others.length})</summary>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">{q.others.map((t, i) => <li key={i}>{t}</li>)}</ul></details>}
          </div>
        </div>
      )}

      {q.numeric && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([['Respostas', q.numeric.n], ['Mínimo', q.numeric.min], ['Máximo', q.numeric.max], ['Média', q.numeric.mean], ['Mediana', q.numeric.median]] as [string, number | null][]).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-soft p-3"><div className="k">{k}</div><div className="text-xl font-extrabold tabular-nums">{v == null ? '—' : Number(v).toLocaleString('pt-BR')}</div></div>
          ))}
        </div>
      )}

      {q.texts && (
        texts.length === 0 ? <p className="k">Sem respostas em texto neste filtro.</p> : (
          <>
            <ul className="divide-y divide-line text-sm">{(showAll ? texts : texts.slice(0, 8)).map((t, i) => <li key={i} className="py-1.5">“{t}”</li>)}</ul>
            {texts.length > 8 && <button className="btn-link mt-2 text-xs" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostrar menos' : `Ver todas (${texts.length}${texts.length >= 300 ? '+' : ''})`}</button>}
          </>
        )
      )}
    </Panel>
  )
}
