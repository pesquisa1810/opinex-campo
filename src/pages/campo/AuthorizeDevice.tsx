import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, QrCode, ShieldAlert, Smartphone } from 'lucide-react'
import QrScanner from '@/components/QrScanner'
import { supabase } from '@/lib/supabase'
import { deviceLabel, getDevice, saveDevice, tokenFromQr } from '@/lib/device'
import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'

const ERRORS: Record<string, string> = {
  INVALID_TOKEN: 'QR Code inválido ou emitido para outro entrevistador.',
  TOKEN_ALREADY_USED: 'Este QR Code já foi utilizado. Peça um novo ao administrador.',
  TOKEN_EXPIRED: 'Este QR Code expirou (validade de 5 minutos). Peça um novo ao administrador.',
  TOKEN_CANCELLED: 'Este QR Code foi cancelado. Peça um novo ao administrador.',
  DEVICE_LIMIT_REACHED: 'O limite global de 5 celulares autorizados foi atingido. Procure o administrador.',
  TOO_MANY_ATTEMPTS: 'Muitas tentativas inválidas. Aguarde 15 minutos e tente novamente.',
  INTERVIEWER_NOT_APPROVED: 'Seu cadastro precisa estar aprovado para autorizar o celular.',
  NOT_AUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
}

export default function AuthorizeDevice() {
  const [params, setParams] = useSearchParams()
  const { session, profile } = useAuth()
  const device = useDevice()
  const qc = useQueryClient()
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const autoTried = useRef(false)

  const consume = useCallback(async (raw: string) => {
    setScanning(false)
    const token = tokenFromQr(raw)
    if (!token) return setResult({ ok: false, text: 'O código lido não é um QR Code de autorização do OPINEX CAMPO.' })
    setBusy(true)
    const d = getDevice()
    const { data, error } = await supabase.rpc('consume_device_authorization', {
      _token: token, _device_key: d.device_key, _label: deviceLabel(), _user_agent: navigator.userAgent,
    })
    setBusy(false)
    if (error) return setResult({ ok: false, text: 'Falha de comunicação com o servidor. Verifique a internet e tente novamente.' })
    const r = data as { ok: boolean; error?: string; device_id?: string; device_secret?: string }
    if (!r.ok) return setResult({ ok: false, text: ERRORS[r.error ?? ''] ?? 'Não foi possível autorizar este celular.' })
    saveDevice({ device_id: r.device_id, device_secret: r.device_secret, user_id: session?.user.id })
    await qc.invalidateQueries({ queryKey: ['my-device'] })
    setResult({ ok: true, text: 'Celular autorizado com sucesso. Você já pode realizar entrevistas.' })
  }, [qc, session])

  // QR aberto pela câmera nativa: o token chega na URL. Consome uma única vez e remove da barra de endereço.
  useEffect(() => {
    const t = params.get('t')
    if (!t || autoTried.current || !session || profile?.status !== 'approved') return
    autoTried.current = true
    setParams({}, { replace: true })
    consume(t)
  }, [params, session, profile, consume, setParams])

  const already = device.state === 'ok'
  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="eyebrow">Autorização do celular</div>
        <h3 className="mt-1">Autorizar este celular</h3>
        <p className="muted text-xs">A coleta só é permitida em celulares autorizados pelo administrador por QR Code. O sistema permite no máximo 5 celulares autorizados no total.</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-soft p-3 text-xs"><Smartphone className="h-4 w-4 text-navy-2" />{deviceLabel()}</div>
      </div>

      {profile?.status !== 'approved' ? (
        <div className="notice notice-bad">Seu cadastro precisa estar aprovado antes de autorizar o celular.</div>
      ) : busy ? (
        <div className="panel flex items-center justify-center gap-2 py-10"><Loader2 className="h-5 w-5 animate-spin" />Validando no servidor…</div>
      ) : result ? (
        <div className={result.ok ? 'notice notice-ok !text-sm' : 'notice notice-bad !text-sm'}>
          <div className="flex gap-2">{result.ok ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <ShieldAlert className="h-5 w-5 shrink-0" />}<span>{result.text}</span></div>
          <div className="mt-3 flex gap-2">
            {result.ok ? <Link to="/campo" className="btn-primary w-full">Ir para minhas pesquisas</Link>
              : <button className="btn-primary w-full" onClick={() => { setResult(null); setScanning(true) }}>Ler novamente</button>}
          </div>
        </div>
      ) : scanning ? (
        <div className="panel"><QrScanner onResult={consume} onCancel={() => setScanning(false)} /></div>
      ) : (
        <div className="panel">
          {already && <div className="notice notice-ok mb-3">Este celular já está autorizado. Ler um novo QR apenas renova a autorização.</div>}
          {device.state === 'revoked' && <div className="notice notice-bad mb-3">A autorização deste celular foi revogada. Peça um novo QR Code ao administrador.</div>}
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-xs text-ink-muted">
            <li>Peça ao administrador para gerar o QR Code no painel.</li>
            <li>Toque em “Ler QR Code” e permita o uso da câmera.</li>
            <li>Aponte para o código. A validação é feita no servidor.</li>
          </ol>
          <button className="btn-gold w-full" onClick={() => setScanning(true)}><QrCode className="h-5 w-5" />Ler QR Code</button>
        </div>
      )}
      <Link to="/campo" className="btn-link block text-center text-xs">Voltar</Link>
    </div>
  )
}
