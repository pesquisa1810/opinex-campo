import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'

/** Lê QR Codes pela câmera traseira. Exige HTTPS (ou localhost) e permissão de câmera. */
export default function QrScanner({ onResult, onCancel }: { onResult: (text: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let controls: IScannerControls | undefined
    let done = false
    const reader = new BrowserQRCodeReader()
    reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current!, (result, _err, c) => {
      if (result && !done) { done = true; c.stop(); onResult(result.getText()) }
    }).then((c) => { controls = c; if (done) c.stop() })
      .catch((e: Error) => setError(e.name === 'NotAllowedError'
        ? 'Permissão de câmera negada. Libere a câmera para este site nas configurações do navegador.'
        : 'Não foi possível abrir a câmera. Verifique se o site está em HTTPS e se outro aplicativo não está usando a câmera.'))
    return () => { done = true; controls?.stop() }
  }, [onResult])
  return (
    <div>
      {error ? <div className="notice notice-bad">{error}</div> : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} className="aspect-square w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-[18%] rounded-xl border-4 border-gold/80" />
        </div>
      )}
      <p className="k mt-2 text-center">Aponte a câmera para o QR Code exibido no painel do administrador.</p>
      <button className="btn-soft mt-3 w-full" onClick={onCancel}>Cancelar</button>
    </div>
  )
}
