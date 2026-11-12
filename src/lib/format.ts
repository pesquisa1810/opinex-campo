const tz = 'America/Sao_Paulo'
export const fmtDate = (v?: string | null) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('pt-BR', { timeZone: tz }) : '—'
export const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }) : '—'
export const fmtNum = (v?: number | null) => (v ?? 0).toLocaleString('pt-BR')
export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0)
export const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
export const timeAgo = (v: string) => {
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return fmtDateTime(v)
}
