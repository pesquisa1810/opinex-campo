import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const DISMISS = 'opinex.install.dismissed'

/** Convite para instalar o PWA na tela inicial (opcional). Não é um aplicativo de loja. */
export default function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS) === '1' } catch { return false } })
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  if (standalone || hidden || (!evt && !ios)) return null
  const close = () => { setHidden(true); try { localStorage.setItem(DISMISS, '1') } catch { /* ignore */ } }
  return (
    <div className="panel relative flex items-start gap-3 !border-gold/60 !p-3 text-xs">
      <Download className="mt-0.5 h-5 w-5 shrink-0 text-gold-deep" />
      <div className="flex-1">
        <b>Instale o OPINEX CAMPO na tela inicial</b>
        {evt ? <p className="k mt-0.5">Acesso rápido, em tela cheia, sem precisar de loja de aplicativos.</p>
          : <p className="k mt-0.5">No Safari, toque em <Share className="inline h-3.5 w-3.5" /> Compartilhar e depois em “Adicionar à Tela de Início”.</p>}
        {evt && <button className="btn-gold btn-sm mt-2" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null) }}>Instalar</button>}
      </div>
      <button className="rounded p-1 text-ink-muted hover:bg-soft" onClick={close} aria-label="Dispensar"><X className="h-4 w-4" /></button>
    </div>
  )
}
