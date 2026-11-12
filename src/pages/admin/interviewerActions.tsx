import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Field, Modal } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import type { UserStatus } from '@/types/db'

const META: Record<UserStatus, { title: string; verb: string; needsReason: boolean; style: string; help: string }> = {
  approved: { title: 'Aprovar cadastro', verb: 'Aprovar', needsReason: false, style: 'btn-gold', help: 'O entrevistador poderá entrar, receber pesquisas e solicitar autorização do celular.' },
  rejected: { title: 'Rejeitar cadastro', verb: 'Rejeitar', needsReason: true, style: 'btn-danger', help: 'O cadastro não terá acesso à coleta.' },
  blocked: { title: 'Bloquear entrevistador', verb: 'Bloquear', needsReason: true, style: 'btn-danger', help: 'Bloqueia o acesso imediatamente, revoga os celulares autorizados e encerra as sessões abertas.' },
  inactive: { title: 'Inativar entrevistador', verb: 'Inativar', needsReason: false, style: 'btn-soft', help: 'Remove o acesso à coleta, revoga celulares e encerra sessões. Pode ser reativado depois.' },
  pending: { title: 'Voltar para pendente', verb: 'Confirmar', needsReason: false, style: 'btn-soft', help: '' },
}

export function useStatusChange() {
  const [target, setTarget] = useState<{ id: string; name: string; status: UserStatus } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const qc = useQueryClient()

  async function confirm() {
    if (!target) return
    const m = META[target.status]
    if (m.needsReason && !reason.trim()) return toast.error('REASON_REQUIRED')
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_user_status', { _user: target.id, _status: target.status, _reason: reason.trim() || null })
    setBusy(false)
    if (error) return toast.error(error)
    toast.ok(`${target.name}: ${m.verb.toLowerCase()} concluído.`)
    setTarget(null); setReason('')
    for (const k of ['interviewers', 'pending-count', 'dashboard', 'interviewer']) qc.invalidateQueries({ queryKey: [k] })
  }

  const modal = target && (
    <Modal open onClose={() => setTarget(null)} title={META[target.status].title}
      footer={<><button className="btn-soft" onClick={() => setTarget(null)}>Cancelar</button>
        <button className={META[target.status].style} disabled={busy} onClick={confirm}>{META[target.status].verb}</button></>}>
      <p className="mb-3"><b>{target.name}</b></p>
      <p className="muted mb-3 text-xs">{META[target.status].help}</p>
      <Field label={META[target.status].needsReason ? 'Justificativa *' : 'Observação (opcional)'}>
        <textarea className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
  return { ask: (id: string, name: string, status: UserStatus) => { setReason(''); setTarget({ id, name, status }) }, modal }
}
