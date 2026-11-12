import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Plus, QrCode, ShieldOff, Smartphone, Timer, XCircle } from 'lucide-react'
import { Empty, Field, Modal, Notice, PageHeader, Panel, Pill, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { api } from '@/services/admin'
import { fmtDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/cn'

interface DeviceRow {
  id: string; label: string; status: 'active' | 'revoked'; authorized_at: string; last_seen_at: string | null
  revoked_at: string | null; revoke_reason: string | null; interviewer_id: string
  profiles: { full_name: string; email: string } | null
}
interface PendingRow { id: string; interviewer_id: string; expires_at: string; created_at: string; profiles: { full_name: string } | null }
interface Issued { authorization_id: string; token: string; expires_at: string; interviewer: string }

const REASONS: Record<string, string> = {
  invalid_token: 'QR inválido ou de outro entrevistador', reused: 'QR já utilizado', expired: 'QR expirado',
  cancelled: 'QR cancelado', limit: 'Limite de 5 atingido', not_approved: 'Usuário não aprovado',
  malformed: 'Código malformado', rate_limited: 'Bloqueado por excesso de tentativas', ok: 'Autorizado',
}

function useCountdown(until?: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!until) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [until])
  const left = until ? Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000)) : 0
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` }
}

export default function Devices() {
  const toast = useToast()
  const qc = useQueryClient()
  const [issueOpen, setIssueOpen] = useState(false)
  const [pick, setPick] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  const [consumed, setConsumed] = useState(false)
  const [revoking, setRevoking] = useState<DeviceRow | null>(null)
  const [reason, setReason] = useState('')
  const { left, label } = useCountdown(issued?.expires_at)

  const data = useQuery({
    queryKey: ['devices'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const [slots, devs, pend, att] = await Promise.all([
        supabase.rpc('device_slots'),
        supabase.from('devices').select('id, label, status, authorized_at, last_seen_at, revoked_at, revoke_reason, interviewer_id, profiles:interviewer_id(full_name, email)').order('authorized_at', { ascending: false }).limit(100),
        supabase.from('device_authorizations').select('id, interviewer_id, expires_at, created_at, profiles:interviewer_id(full_name)').eq('status', 'pending').gt('expires_at', new Date().toISOString()),
        supabase.from('device_auth_attempts').select('id, user_id, success, reason, created_at').order('created_at', { ascending: false }).limit(30),
      ])
      for (const r of [slots, devs, pend, att]) if (r.error) throw r.error
      return {
        slots: slots.data as { limit: number; active: number; pending: number },
        devices: devs.data as unknown as DeviceRow[],
        pending: pend.data as unknown as PendingRow[],
        attempts: att.data as { id: number; user_id: string; success: boolean; reason: string; created_at: string }[],
      }
    },
  })
  const people = useQuery({ queryKey: ['interviewers'], queryFn: api.interviewers })
  const nameOf = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p.full_name])), [people.data])

  // Confirmação em tempo real da leitura do QR (com verificação periódica de reserva)
  useEffect(() => {
    if (!issued || consumed) return
    const check = async () => {
      const { data } = await supabase.from('device_authorizations').select('status').eq('id', issued.authorization_id).single()
      if (data?.status === 'consumed') { setConsumed(true); qc.invalidateQueries({ queryKey: ['devices'] }); toast.ok(`Celular de ${issued.interviewer} autorizado.`) }
    }
    const ch = supabase.channel(`auth-${issued.authorization_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'device_authorizations', filter: `id=eq.${issued.authorization_id}` }, check)
      .subscribe()
    const t = setInterval(check, 3000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [issued, consumed, qc, toast])

  async function issue() {
    const person = people.data?.find((p) => p.id === pick)
    const { data: r, error } = await supabase.rpc('admin_create_device_authorization', { _interviewer: pick })
    if (error) return toast.error(error)
    setIssued({ ...(r as Omit<Issued, 'interviewer'>), interviewer: person?.full_name ?? '' })
    setConsumed(false); setIssueOpen(false); setPick('')
    qc.invalidateQueries({ queryKey: ['devices'] })
  }
  async function cancelIssued() {
    if (!issued) return
    await supabase.rpc('admin_cancel_device_authorization', { _authorization: issued.authorization_id })
    setIssued(null); qc.invalidateQueries({ queryKey: ['devices'] })
  }
  async function cancelPending(id: string) {
    const { error } = await supabase.rpc('admin_cancel_device_authorization', { _authorization: id })
    if (error) return toast.error(error)
    if (issued?.authorization_id === id) setIssued(null)
    toast.ok('Reserva cancelada.'); qc.invalidateQueries({ queryKey: ['devices'] })
  }
  async function revoke() {
    if (!revoking) return
    const { error } = await supabase.rpc('admin_revoke_device', { _device: revoking.id, _reason: reason.trim() || null })
    if (error) return toast.error(error)
    toast.ok('Dispositivo revogado. A posição foi liberada.')
    setRevoking(null); setReason(''); qc.invalidateQueries({ queryKey: ['devices'] }); qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  if (data.isLoading) return <Spinner />
  if (data.error || !data.data) return <Notice tone="bad">Não foi possível carregar os dispositivos.</Notice>
  const { slots, devices, pending, attempts } = data.data
  const active = devices.filter((d) => d.status === 'active')
  const free = Math.max(slots.limit - active.length - pending.length, 0)
  const approved = (people.data ?? []).filter((p) => p.status === 'approved')
  const qrUrl = issued ? `${env.appUrl}/campo/dispositivo?t=${issued.token}` : ''

  type Slot = { kind: 'active'; d: DeviceRow } | { kind: 'pending'; p: PendingRow } | { kind: 'free' }
  const slotList: Slot[] = [
    ...active.map((d) => ({ kind: 'active' as const, d })),
    ...pending.map((p) => ({ kind: 'pending' as const, p })),
    ...Array.from({ length: free }, () => ({ kind: 'free' as const })),
  ].slice(0, slots.limit)

  return (
    <>
      <PageHeader eyebrow="Controle de acesso" title="Dispositivos e QR Code"
        description="Limite global de cinco celulares autorizados para toda a equipe."
        actions={<button className="btn-gold" disabled={free === 0} onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4" />Gerar QR Code</button>} />
      <Notice><b>Regra global:</b> no máximo cinco dispositivos ativos simultaneamente, independentemente da quantidade de entrevistadores.
        Um QR Code emitido reserva uma posição por até 5 minutos. Ativos: <b>{active.length}</b> · Reservados: <b>{pending.length}</b> · Livres: <b>{free}</b>.</Notice>

      <div className="grid grid-cols-2 gap-[9px] sm:grid-cols-3 lg:grid-cols-5">
        {slotList.map((s, i) => (
          <div key={i} className={cn('flex min-h-[150px] flex-col rounded-[10px] border p-3', s.kind === 'free' ? 'border-dashed border-line bg-[#fafbfd]' : 'border-line bg-white')}>
            <span className="text-xl font-bold text-gold">{String(i + 1).padStart(2, '0')}</span>
            {s.kind === 'active' && <>
              <strong className="mt-1.5 text-sm leading-tight">{s.d.profiles?.full_name}</strong>
              <small className="k mt-0.5 break-words">{s.d.label}</small>
              <small className="k mt-0.5">Último acesso: {s.d.last_seen_at ? timeAgo(s.d.last_seen_at) : '—'}</small>
              <div className="mt-auto flex items-center justify-between gap-1 pt-2"><Pill tone="ok">Autorizado</Pill>
                <button className="btn-soft btn-sm" onClick={() => setRevoking(s.d)}>Revogar</button></div>
            </>}
            {s.kind === 'pending' && <>
              <strong className="mt-1.5 text-sm leading-tight">Reservada</strong>
              <small className="k mt-0.5">QR para {s.p.profiles?.full_name}</small>
              <small className="k mt-0.5">Expira {fmtDateTime(s.p.expires_at)}</small>
              <div className="mt-auto flex items-center justify-between gap-1 pt-2"><Pill tone="wait">Aguardando leitura</Pill>
                <button className="btn-soft btn-sm" onClick={() => cancelPending(s.p.id)}>Cancelar</button></div>
            </>}
            {s.kind === 'free' && <>
              <strong className="mt-1.5 text-sm">Posição livre</strong>
              <small className="k">Disponível para autorização</small>
              <div className="mt-auto pt-2"><button className="btn-primary btn-sm w-full" onClick={() => setIssueOpen(true)}>Liberar posição</button></div>
            </>}
          </div>
        ))}
      </div>

      <Panel title="Autorização por QR Code" className="mt-[15px]">
        {!issued ? (
          <div className="flex flex-wrap items-center gap-5">
            <div className="grid h-[150px] w-[150px] place-items-center rounded-lg border border-dashed border-line bg-[#fafbfd]"><QrCode className="h-12 w-12 text-ink-muted/40" /></div>
            <div className="max-w-md">
              <b>Nenhum QR Code ativo</b>
              <p className="muted">Clique em “Gerar QR Code”, escolha o entrevistador aprovado e peça para ele entrar no sistema pelo celular e ler o código (ou apontar a câmera do celular para o QR).</p>
              <p className="k mt-2">Token aleatório de 256 bits · validade de 5 minutos · uso único · validado somente no servidor.</p>
            </div>
          </div>
        ) : consumed ? (
          <div className="flex items-center gap-4"><CheckCircle2 className="h-14 w-14 text-ok" />
            <div><b>Celular autorizado.</b><p className="muted">O dispositivo de {issued.interviewer} foi vinculado e já aparece nas posições acima.</p>
              <button className="btn-soft btn-sm mt-2" onClick={() => setIssued(null)}>Concluir</button></div></div>
        ) : left === 0 ? (
          <div className="flex items-center gap-4"><XCircle className="h-14 w-14 text-alert" />
            <div><b>QR Code expirado.</b><p className="muted">A posição reservada foi liberada. Gere um novo código se necessário.</p>
              <button className="btn-soft btn-sm mt-2" onClick={() => { setIssued(null); qc.invalidateQueries({ queryKey: ['devices'] }) }}>Fechar</button></div></div>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div className="rounded-lg border border-line bg-white p-3" data-testid="qr-code" data-qr-url={qrUrl}><QRCodeSVG value={qrUrl} size={200} level="M" marginSize={1} fgColor="#101D35" /></div>
            <div className="max-w-md">
              <b>QR Code para {issued.interviewer}</b>
              <p className="muted mt-1">No celular: entrar no OPINEX CAMPO → “Autorizar este celular” → ler o código. Também funciona apontando a câmera nativa do celular.</p>
              <div className="mt-3 flex items-center gap-2 text-lg font-bold tabular-nums"><Timer className="h-5 w-5 text-gold-deep" />{label}<span className="k font-normal">restantes</span></div>
              <div className="mt-1 flex items-center gap-2"><Pill tone="wait">Aguardando leitura…</Pill></div>
              <button className="btn-soft btn-sm mt-3" onClick={cancelIssued}>Cancelar QR Code</button>
              <p className="k mt-3">Não envie este código por mensagem: ele é pessoal e só funciona para o entrevistador indicado.</p>
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-[15px] grid gap-[15px] lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Histórico de dispositivos">
          {!devices.length ? <Empty title="Nenhum dispositivo autorizado ainda" /> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Entrevistador</th><th>Dispositivo</th><th>Autorizado em</th><th>Último acesso</th><th>Status</th></tr></thead>
              <tbody>{devices.map((d) => (
                <tr key={d.id}>
                  <td><Link className="font-semibold hover:text-gold-deep" to={`/admin/entrevistadores/${d.interviewer_id}`}>{d.profiles?.full_name}</Link></td>
                  <td><Smartphone className="mr-1 inline h-3.5 w-3.5 text-ink-muted" />{d.label}</td>
                  <td>{fmtDateTime(d.authorized_at)}</td><td>{fmtDateTime(d.last_seen_at)}</td>
                  <td>{d.status === 'active' ? <Pill tone="ok">Ativo</Pill> : <span title={d.revoke_reason ?? ''}><Pill tone="off">Revogado {d.revoked_at && `· ${fmtDateTime(d.revoked_at)}`}</Pill></span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
        <Panel title="Tentativas de leitura de QR">
          {!attempts.length ? <Empty title="Nenhuma tentativa registrada" /> : (
            <ul className="space-y-2 text-xs">{attempts.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                {a.success ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" /> : <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-alert" />}
                <span className="flex-1">{nameOf.get(a.user_id) ?? 'Usuário'} — {REASONS[a.reason] ?? a.reason}</span>
                <span className="k shrink-0">{timeAgo(a.created_at)}</span>
              </li>
            ))}</ul>
          )}
        </Panel>
      </div>

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Gerar QR Code de autorização"
        footer={<><button className="btn-soft" onClick={() => setIssueOpen(false)}>Cancelar</button><button className="btn-primary" disabled={!pick} onClick={issue}><QrCode className="h-4 w-4" />Gerar QR Code</button></>}>
        {!approved.length ? <Notice>Nenhum entrevistador aprovado. Aprove cadastros em <Link className="btn-link" to="/admin/entrevistadores?status=pending">Entrevistadores</Link>.</Notice> : (
          <>
            <Field label="Entrevistador aprovado"><select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Selecione…</option>{approved.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.active_devices ? ` (já possui ${p.active_devices} celular)` : ''}</option>)}
            </select></Field>
            <p className="k mt-3">O servidor confere o limite global antes de emitir. Se o entrevistador já tiver um QR pendente, ele é cancelado e substituído.</p>
          </>
        )}
      </Modal>

      <Modal open={!!revoking} onClose={() => setRevoking(null)} title="Revogar dispositivo"
        footer={<><button className="btn-soft" onClick={() => setRevoking(null)}>Cancelar</button><button className="btn-danger" onClick={revoke}>Revogar agora</button></>}>
        <p><b>{revoking?.profiles?.full_name}</b> · {revoking?.label}</p>
        <p className="muted my-3 text-xs">A revogação é imediata: o celular não poderá iniciar nem enviar entrevistas. A posição fica livre para outro aparelho.</p>
        <Field label="Motivo (opcional)"><input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </>
  )
}
