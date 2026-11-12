// Credenciais do aparelho guardadas no celular. ATENÇÃO: isto NÃO autoriza nada sozinho —
// toda operação de coleta envia device_id + segredo e o SERVIDOR confere hash, dono e status.
const KEY = 'opinex.device.v1'

export interface DeviceCreds { device_key: string; device_id?: string; device_secret?: string; user_id?: string }

function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getDevice(): DeviceCreds {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as DeviceCreds
      if (d.device_key?.length >= 32) return d
    }
  } catch { /* armazenamento indisponível */ }
  const d = { device_key: randomHex() }
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ }
  return d
}

export function saveDevice(patch: Partial<DeviceCreds>) {
  const d = { ...getDevice(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ }
  return d
}

export function clearDeviceAuth() {
  const { device_key } = getDevice()
  try { localStorage.setItem(KEY, JSON.stringify({ device_key })) } catch { /* ignore */ }
}

/** Identificação técnica legível: sistema + navegador. */
export function deviceLabel(ua = navigator.userAgent) {
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo'
  const br = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const model = ua.match(/Android [\d.]+; ([^;)]+)/)?.[1]?.trim()
  return `${os}${model && model !== 'K' ? ` (${model})` : ''} · ${br}`
}

/** Extrai o token de um QR Code (URL .../campo/dispositivo?t=TOKEN ou o token puro). */
export function tokenFromQr(text: string): string | null {
  const t = text.trim()
  if (/^[0-9a-f]{64}$/.test(t)) return t
  try { const u = new URL(t); const v = u.searchParams.get('t'); return v && /^[0-9a-f]{64}$/.test(v) ? v : null } catch { return null }
}
