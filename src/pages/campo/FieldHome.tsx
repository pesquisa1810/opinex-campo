import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Pill } from '@/components/ui'
import { userStatus } from '@/lib/labels'

// Fase 3: situação do cadastro. Pesquisas atribuídas, QR Code e coleta entram nas Fases 4 e 5.
export default function FieldHome() {
  const { profile } = useAuth()
  if (!profile) return null
  const st = userStatus[profile.status]
  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="eyebrow">Meu cadastro</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div><div className="font-bold">{profile.full_name}</div><div className="k">{profile.email}</div></div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
      </div>
      {profile.status === 'pending' && (
        <div className="notice flex gap-3 !text-sm"><Clock className="h-5 w-5 shrink-0" />
          <div><b>Cadastro em análise.</b> O administrador ainda não aprovou seu acesso. Você será liberado assim que a aprovação for concluída — basta entrar novamente.</div></div>
      )}
      {profile.status === 'approved' && (
        <div className="notice notice-ok flex gap-3 !text-sm"><ShieldCheck className="h-5 w-5 shrink-0" />
          <div><b>Cadastro aprovado.</b> A autorização do celular por QR Code e a coleta de entrevistas serão liberadas na próxima etapa do sistema.</div></div>
      )}
      {['rejected', 'blocked', 'inactive'].includes(profile.status) && (
        <div className="notice notice-bad flex gap-3 !text-sm"><ShieldAlert className="h-5 w-5 shrink-0" />
          <div><b>Acesso indisponível.</b> {profile.status_reason ?? 'Procure o administrador da pesquisa.'}</div></div>
      )}
      <p className="text-center text-[10px] text-ink-muted">O entrevistador não tem acesso aos resultados da pesquisa.</p>
    </div>
  )
}
