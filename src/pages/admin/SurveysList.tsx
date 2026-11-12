import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { Empty, Notice, PageHeader, Panel, Pill, Progress, Spinner } from '@/components/ui'
import { api } from '@/services/admin'
import { surveyStatus } from '@/lib/labels'
import { fmtDate, fmtNum } from '@/lib/format'
import type { SurveyStatus } from '@/types/db'

export default function SurveysList() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['surveys'], queryFn: api.surveys })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SurveyStatus | 'all' | 'active'>('active')

  const rows = useMemo(() => (q.data ?? []).filter((s) =>
    (status === 'all' || (status === 'active' ? s.status !== 'archived' : s.status === status)) &&
    (!search || `${s.name} ${s.code} ${s.municipality ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [q.data, search, status])

  return (
    <>
      <PageHeader eyebrow="Gestão de questionários" title="Pesquisas"
        description="Crie pesquisas, elabore questionários e distribua para a equipe de campo."
        actions={<button className="btn-gold" onClick={() => navigate('/admin/pesquisas/nova')}><Plus className="h-4 w-4" />Cadastrar pesquisa</button>} />

      <Panel title="Pesquisas cadastradas" actions={
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
            <input className="input !py-2 pl-8" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar pesquisa" />
          </div>
          <select className="input !w-auto !py-2" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filtrar situação">
            <option value="active">Não arquivadas</option>
            <option value="all">Todas</option>
            {Object.entries(surveyStatus).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      }>
        {q.isLoading ? <Spinner /> : q.error ? <Notice tone="bad">Erro ao carregar pesquisas.</Notice> : !rows.length ? (
          <Empty title="Nenhuma pesquisa encontrada">Cadastre a primeira pesquisa para começar.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Pesquisa</th><th>Local</th><th>Período</th><th>Questionário</th><th>Entrevistas</th><th>Equipe</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/admin/pesquisas/${s.id}`} className="font-semibold text-ink hover:text-gold-deep">{s.name}</Link><div className="k">{s.code}</div></td>
                    <td>{s.municipality ? `${s.municipality}${s.state ? `/${s.state}` : ''}` : '—'}</td>
                    <td className="whitespace-nowrap">{fmtDate(s.start_date)} a {fmtDate(s.end_date)}</td>
                    <td>{s.published_version ? `v${s.published_version} · ${s.published_questions} perguntas` : <span className="k">Não publicado</span>}
                      {s.draft_version && <div className="k">Rascunho v{s.draft_version} ({s.draft_questions})</div>}</td>
                    <td className="min-w-[130px]"><div className="mb-1 tabular-nums">{fmtNum(s.interviews)} / {fmtNum(s.target_total)}</div><Progress value={s.interviews} max={s.target_total} /></td>
                    <td>{s.interviewers}</td>
                    <td><Pill tone={surveyStatus[s.status].tone}>{surveyStatus[s.status].label}</Pill></td>
                    <td><Link className="btn-soft btn-sm" to={`/admin/pesquisas/${s.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Limites do questionário" className="mt-3.5">
        <div className="grid grid-cols-2 gap-[13px] lg:grid-cols-4">
          <div><div className="num">30</div><div className="k">Perguntas por questionário</div></div>
          <div><div className="num">8</div><div className="k">Alternativas por pergunta</div></div>
          <div><div className="num">6</div><div className="k">Formatos: única, múltipla, espontânea, numérica, condicional e observação</div></div>
          <div><div className="num">v</div><div className="k">Versionamento: entrevistas mantêm a versão usada</div></div>
        </div>
      </Panel>
    </>
  )
}
