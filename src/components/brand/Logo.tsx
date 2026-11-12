import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-10 w-10', className)} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#101D35" />
      <path d="M32 9c-10.5 0-19 8.3-19 18.6C13 41.5 32 56 32 56s19-14.5 19-28.4C51 17.3 42.5 9 32 9z" fill="none" stroke="#C6A66B" strokeWidth="3.5" />
      <circle cx="32" cy="27.5" r="11" fill="none" stroke="#C6A66B" strokeWidth="1.6" opacity=".55" />
      <rect x="25" y="27" width="3.6" height="7" rx="1" fill="#fff" />
      <rect x="30.2" y="22.5" width="3.6" height="11.5" rx="1" fill="#fff" />
      <rect x="35.4" y="19" width="3.6" height="15" rx="1" fill="#C6A66B" />
    </svg>
  )
}

export function Logo({ light = false, slogan = false, className }: { light?: boolean; slogan?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoMark />
      <div className="leading-tight">
        <div className={cn('font-display text-xl font-bold tracking-wide', light ? 'text-white' : 'text-navy')}>
          OPINEX <span className="text-gold">CAMPO</span>
        </div>
        {slogan && (
          <div className={cn('text-[11px] tracking-wide', light ? 'text-white/70' : 'text-ink-muted')}>
            Inteligência na coleta. Precisão na informação.
          </div>
        )}
      </div>
    </div>
  )
}
