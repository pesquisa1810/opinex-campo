import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus } from 'lucide-react'
import { BarList, Notice, PageHeader, Panel, Spinner, StatCard } from '@/components/ui'
import { api } from '@/services/admin'
import { fmtDate, fmtPct, pct, timeAgo } from '@/lib/format'
import { interviewStatus } from '@/lib/labels'
import type { ActivityItem } from '@/types/db'

const ACTIONS: Record<string, string> = {
  'insert:surveys': 'Pesquisa criada', 'update:surveys': 'Pesquisa atualizada', 'delete:surveys': 'Pesquisa excluída',
  'insert:survey_assignments': 'Pesquisa atribuída', 'update:survey_assignments': 'Atribuição alterada',
  'insert:questionnaire_versions': 'Versão de questionário criada', 'update:questionnaire_versions': 'Questionário atualizado/publicado',
  'update:profiles': 'Cadastro atualizado', 'insert:devices': 'Dispositivo autorizado', 'update:devices': 'Dispositivo alterado',
  'update:interviews': 'Entrevista revisada', 'device_authorization_created': 'QR Code emitido',
  'sessions_revoked': 'Sessões revogadas', 'provision_first_admin': 'Administrador provisionado',
  'insert:user_roles': 'Perfil de acesso concedido', 'delete:user_roles': 'Perfil de acesso removido',
  'update:interviewer_profiles': 'Meta individual alterada', 'insert:survey_targets': 'Meta por área criada',
  'update:survey_targets': 'Meta por área alterada', 'delete:survey_targets': 'Meta por área excluída',
  'delete:survey_assignments': 'Atribuição excluída', 'delete:questionnaire_versions': 'Rascunho excluído',
  'device_authorization_cancelled': 'QR Code cancelado', 'device_qr_reuse_blocked': 'Reutilização de QR Code bloqueada',
}
function describe(a: ActivityItem) {
  const base = ACTIONS[`${a.action}:${a.entity}`] ?? ACTIONS[a.action] ??
    (a.action.startsWith('blocked_') ? 'Tentativa bloqueada (dispositivo)' : 'Registro administrativo')
  return a.summary && !/^(draft|published|approved|pending|active|revoked|superseded)$/.test(a.summary) ? `${base}: ${a.summary}` : base
}

export default function Dashboard() {
  const navigate = useNavigate()
  const d = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard(), refetchInterval: 60_000 })
  const act = useQuery({ queryKey: ['dashboard', 'activity'], queryFn: api.activity, refetchInterval: 60_000 })

  if (d.isLoading) return <Spinner />
  if (d.error || !d.data) return <Notice tone="bad">Não foi possível carregar os indicadores.</Notice>
  const x = d.data
  const valid = x.interviews_total - x.interviews_rejected
  const exec = pct(valid, x.target_total)

  return (
    <>
      <PageHeader eyebrow="Painel executivo" title="Visão geral"
        description="Acompanhe a operação de coleta e o estado das pesquisas."
        actions={<button className="btn-gold" onClick={() => navigate('/admin/pesquisas/nova')}><Plus className="h-4 w-4" />Nova pesquisa</button>} />

      {x.interviewers_pending > 0 && (
        <Notice><b>{x.interviewers_pending} cadastro(s) aguardando aprovação.</b>{' '}
          <Link to="/admin/entrevistadores?status=pending" className="btn-link">Analisar agora →</Link></Notice>
      )}

      <div className="mb-3.5 grid grid-cols-2 gap-[13px] lg:grid-cols-4">
        <StatCard label="Dispositivos autorizados" value={`${x.devices_active} / ${x.devices_limit}`}
          hint={`${Math.max(x.devices_limit - x.devices_active, 0)} posição(ões) disponível(is)`} accent />
        <StatCard label="Entrevistadores aprovados" value={x.interviewers_approved}
          hint={`${x.interviewers_total} cadastrados · ${x.interviewers_pending} pendentes · ${x.interviewers_active_7d} ativos (7 dias)`} />
        <StatCard label="Entrevistas recebidas" value={x.interviews_total} hint="Gravadas no servidor" />
        <StatCard label="Pesquisas em andamento" value={x.surveys_in_progress}
          hint={`${x.surveys_total} no total · ${x.surveys_completed} concluídas`} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-[13px] lg:grid-cols-4">
        <StatCard label="Entrevistas aprovadas" value={x.interviews_approved} />
        <StatCard label="Entrevistas rejeitadas" value={x.interviews_rejected} />
        <StatCard label="Pendentes de análise" value={x.interviews_pending} />
        <StatCard label="Execução da meta" value={fmtPct(exec)} hint={`${valid.toLocaleString('pt-BR')} de ${x.target_total.toLocaleString('pt-BR')} (exclui rejeitadas)`} />
      </div>

      <div className="grid gap-[15px] lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Entrevistas por dia (últimos 30 dias)">
          {x.by_day.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={x.by_day.map((r) => ({ dia: fmtDate(r.day).slice(0, 5), total: r.total }))} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C6A66B" stopOpacity={0.5} /><stop offset="100%" stopColor="#C6A66B" stopOpacity={0.05} /></linearGradient></defs>
                  <CartesianGrid stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#687386' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#687386' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E4E8EF', fontSize: 12 }} />
                  <Area type="monotone" dataKey="total" name="Entrevistas" stroke="#A17D35" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="muted text-xs">Nenhuma entrevista recebida nos últimos 30 dias.</p>}
        </Panel>
        <Panel title="Atividade recente">
          {act.data?.length ? (
            <ul className="space-y-2.5">
              {act.data.map((a, i) => (
                <li key={i} className="muted flex gap-2 text-xs">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" />
                  <span className="min-w-0 flex-1"><span className="text-ink">{describe(a)}</span>{a.actor_name && <> · {a.actor_name}</>}</span>
                  <span className="shrink-0">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted text-xs">Sem atividade registrada.</p>}
        </Panel>
      </div>

      <div className="mt-[15px] grid gap-[15px] lg:grid-cols-2">
        <Panel title="Entrevistas por pesquisa">
          <BarList items={x.by_survey.map((s) => ({ label: s.code, value: s.total, title: `${s.name} — meta ${s.target}` }))} />
        </Panel>
        <Panel title="Situação das entrevistas">
          <BarList items={x.by_status.map((s) => ({ label: interviewStatus[s.status].label, value: s.total }))} />
        </Panel>
        <Panel title="Entrevistas por entrevistador">
          <BarList items={x.by_interviewer.slice(0, 10).map((s) => ({ label: s.name, value: s.total }))} />
        </Panel>
        <Panel title="Entrevistas por município">
          <BarList items={x.by_municipality.slice(0, 10).map((s) => ({ label: s.municipality, value: s.total }))} />
        </Panel>
        <Panel title="Entrevistas por bairro" className="lg:col-span-2">
          <BarList items={x.by_neighborhood.slice(0, 12).map((s) => ({ label: `${s.neighborhood} (${s.municipality})`, value: s.total }))} />
        </Panel>
      </div>
    </>
  )
}
