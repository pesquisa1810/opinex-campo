import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-10 w-10 shrink-0', className)} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#101D35" />
      <path d="M32 9c-10.5 0-19 8.3-19 18.6C13 41.5 32 56 32 56s19-14.5 19-28.4C51 17.3 42.5 9 32 9z" fill="none" stroke="#C6A66B" strokeWidth="3.5" />
      <circle cx="32" cy="27.5" r="11" fill="none" stroke="#C6A66B" strokeWidth="1.6" opacity=".55" />
      <rect x="25" y="27" width="3.6" height="7" rx="1" fill="#fff" />
      <rect x="30.2" y="22.5" width="3.6" height="11.5" rx="1" fill="#fff" />
      <rect x="35.4" y="19" width="3.6" height="15" rx="1" fill="#C6A66B" />
    </svg>
  )
}

/** Marca textual do modelo de telas: OPIN + EX dourado, com subtítulo. */
export function Wordmark({ light = true, sub = 'CAMPO • PESQUISAS', className }: { light?: boolean; sub?: string; className?: string }) {
  return (
    <div className={cn('leading-none', className)}>
      <div role="img" aria-label="OPINEX" className={cn('text-[22px] font-black tracking-[2px]', light ? 'text-white' : 'text-navy')}>
        OPIN<span className="text-gold">EX</span>
      </div>
      <div className={cn('mt-1.5 text-[10px] tracking-[1.5px]', light ? 'text-[#cbd4df]' : 'text-ink-muted')}>{sub}</div>
    </div>
  )
}

export function Logo({ light = false, slogan = false, className }: { light?: boolean; slogan?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoMark />
      <div className="text-left">
        <Wordmark light={light} sub="CAMPO" />
        {slogan && (
          <div className={cn('mt-1.5 text-[11px]', light ? 'text-white/70' : 'text-ink-muted')}>
            Inteligência na coleta. Precisão na informação.
          </div>
        )}
      </div>
    </div>
  )
}
