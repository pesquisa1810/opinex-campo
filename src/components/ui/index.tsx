import { useEffect, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Tone } from '@/lib/labels'
import { fmtNum } from '@/lib/format'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className={cn('panel', accent && 'border-gold/60')}>
      <div className="k">{label}</div>
      <div className="num">{typeof value === 'number' ? fmtNum(value) : value}</div>
      {hint && <div className="k">{hint}</div>}
    </div>
  )
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('panel', className)}>
      {(title || actions) && (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          {title && <h3 className="mb-0">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

// Nomes de classe completos (o Tailwind não detecta classes montadas dinamicamente)
const PILL: Record<Tone, string> = { ok: 'pill-ok', wait: 'pill-wait', off: 'pill-off', bad: 'pill-bad', info: 'pill-info' }
export function Pill({ tone = 'ok', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('pill', PILL[tone])}>{children}</span>
}

export function BarList({ items, empty = 'Sem registros ainda.', suffix }: {
  items: { label: string; value: number; max?: number; title?: string }[]; empty?: string; suffix?: string
}) {
  if (!items.length) return <p className="muted text-xs">{empty}</p>
  const top = Math.max(...items.map((i) => i.max ?? i.value), 1)
  return (
    <div>
      {items.map((i) => (
        <div key={i.label} className="my-3.5 grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-2 text-xs" title={i.title}>
          <span className="truncate">{i.label}</span>
          <div className="track"><div className="fill" style={{ width: `${Math.min(100, (i.value / top) * 100)}%` }} /></div>
          <b className="tabular-nums">{fmtNum(i.value)}{suffix}</b>
        </div>
      ))}
    </div>
  )
}

export function Notice({ tone, children, className }: { tone?: 'bad' | 'ok'; children: ReactNode; className?: string }) {
  return <div className={cn('notice my-3', tone === 'bad' && 'notice-bad', tone === 'ok' && 'notice-ok', className)}>{children}</div>
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <div className="flex items-center gap-2 py-8 justify-center text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <div className="font-bold text-ink">{title}</div>
      {children && <div className="muted mt-1 text-xs">{children}</div>}
    </div>
  )
}

export function Field({ label, children, hint, error, className }: { label: string; children: ReactNode; hint?: ReactNode; error?: string; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-ink-muted">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-semibold text-alert">{error}</span>}
    </label>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cn('max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <h3 className="mb-0">{title}</h3>
          <button className="rounded p-1 text-ink-muted hover:bg-soft" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div className="track"><div className="fill" style={{ width: `${w}%` }} /></div>
}
