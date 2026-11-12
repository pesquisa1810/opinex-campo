import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, MessageCircle, Search, X } from 'lucide-react'
import { Empty, Notice, PageHeader, Panel, Pill, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { api } from '@/services/admin'
import { env } from '@/lib/env'
import { userStatus } from '@/lib/labels'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { UserStatus } from '@/types/db'
import { useStatusChange } from './interviewerActions'

const TABS: (UserStatus | 'all')[] = ['pending', 'approved', 'rejected', 'blocked', 'inactive', 'all']

export default function Interviewers() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('status') as UserStatus | 'all' | null) ?? 'all'
  const [search, setSearch] = useState('')
  const q = useQuery({ queryKey: ['interviewers'], queryFn: api.interviewers })
  const toast = useToast()
  const { ask, modal } = useStatusChange()
  const signupUrl = `${env.appUrl}/cadastro`
  const waText = encodeURIComponent(`Olá! Faça seu cadastro como entrevistador no OPINEX CAMPO: ${signupUrl}\nApós o cadastro, aguarde a aprovação do administrador.`)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: q.data?.length ?? 0 }
    for (const r of q.data ?? []) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [q.data])
  const rows = (q.data ?? []).filter((r) => (tab === 'all' || r.status === tab) &&
    (!search || `${r.full_name} ${r.email} ${r.phone ?? ''}`.toLowerCase().includes(search.toLowerCase())))

  return (
    <>
      <PageHeader eyebrow="Equipe de campo" title="Entrevistadores"
        description="Aprove cadastros, distribua pesquisas e acompanhe a produtividade da equipe." />

      <Panel title="Link de cadastro para entrevistadores" className="mb-3.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-lg bg-soft px-3 py-2.5 text-xs">{signupUrl}</code>
          <div className="flex gap-2">
            <button className="btn-soft" onClick={async () => { await navigator.clipboard.writeText(signupUrl); toast.ok('Link copiado.') }}><Copy className="h-4 w-4" />Copiar</button>
            <a className="btn-gold" href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Enviar pelo WhatsApp</a>
          </div>
        </div>
        <p className="k mt-2">Todo cadastro feito por este link entra como <b>pendente</b> e só acessa a coleta após sua aprovação.</p>
      </Panel>

      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setParams(t === 'all' ? {} : { status: t })}
            className={cn('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold',
              tab === t ? 'border-gold text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>
            {t === 'all' ? 'Todos' : userStatus[t].label + 's'}
            <span className={cn('rounded-full px-1.5 text-[10px]', t === 'pending' && counts.pending ? 'bg-gold text-navy' : 'bg-soft')}>{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>

      <Panel title="Equipe cadastrada" actions={
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
          <input className="input !py-2 pl-8" placeholder="Nome, e-mail ou telefone" aria-label="Buscar entrevistador" value={search} onChange={(e) => setSearch(e.target.value)} /></div>}>
        {q.isLoading ? <Spinner /> : q.error ? <Notice tone="bad">Erro ao carregar entrevistadores.</Notice> : !rows.length ? (
          <Empty title={tab === 'pending' ? 'Nenhum cadastro pendente' : 'Nenhum entrevistador encontrado'}>Compartilhe o link de cadastro com a equipe.</Empty>
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Entrevistador</th><th>Telefone</th><th>Cadastro</th><th>Status</th><th>Pesquisas</th><th>Celular</th><th>Entrevistas</th><th>Ações</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/admin/entrevistadores/${r.id}`} className="font-semibold hover:text-gold-deep">{r.full_name}</Link><div className="k">{r.email}</div></td>
                <td className="whitespace-nowrap">{r.phone ?? '—'}</td>
                <td className="whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td><Pill tone={userStatus[r.status].tone}>{userStatus[r.status].label}</Pill>
                  {r.status_reason && <div className="k mt-1 max-w-[160px] truncate" title={r.status_reason}>{r.status_reason}</div>}</td>
                <td>{r.assigned_surveys}</td>
                <td>{r.active_devices ? <Pill tone="ok">Autorizado</Pill> : <span className="k">—</span>}</td>
                <td className="whitespace-nowrap">
                  <b>{r.interviews}</b> <span className="k">· {r.approved} apr. · {r.pending} pend. · {r.rejected} rej.</span>
                  {r.last_interview_at && <div className="k">Última: {fmtDateTime(r.last_interview_at)}</div>}
                </td>
                <td>
                  <div className="flex gap-1">
                    {r.status === 'pending' && <>
                      <button className="btn-gold btn-sm" onClick={() => ask(r.id, r.full_name, 'approved')}><Check className="h-3.5 w-3.5" />Aprovar</button>
                      <button className="btn-soft btn-sm" onClick={() => ask(r.id, r.full_name, 'rejected')} aria-label="Rejeitar"><X className="h-3.5 w-3.5" /></button>
                    </>}
                    {r.status !== 'pending' && <Link className="btn-soft btn-sm" to={`/admin/entrevistadores/${r.id}`}>Gerenciar</Link>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
      {modal}
    </>
  )
}
