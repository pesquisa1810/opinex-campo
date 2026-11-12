import type { ReactNode } from 'react'
import { LogoMark, Wordmark } from '@/components/brand/Logo'

export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-navy px-4 py-8 sm:items-center">
      <div className="w-full max-w-[420px] overflow-hidden rounded-[18px] bg-[#f7f8fa] shadow-2xl">
        <div className="bg-navy px-6 pb-6 pt-7 text-white">
          <div className="flex items-center gap-3">
            <LogoMark className="h-11 w-11 ring-1 ring-gold/40 rounded-[14px]" />
            <Wordmark sub="CAMPO • COLETA PRESENCIAL" />
          </div>
          <p className="mt-4 text-[11px] tracking-wide text-[#d8c18a]">Inteligência na coleta. Precisão na informação.</p>
        </div>
        <div className="p-6">
          <h1 className="text-xl">{title}</h1>
          {subtitle && <p className="muted mb-4">{subtitle}</p>}
          {children}
        </div>
      </div>
    </main>
  )
}
