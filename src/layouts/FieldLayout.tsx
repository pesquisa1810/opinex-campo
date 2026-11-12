import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function FieldLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-dvh bg-[#f7f8fa]">
      <header className="sticky top-0 z-30 bg-navy px-5 pb-4 pt-5 text-white">
        <div className="mx-auto flex max-w-xl items-start justify-between">
          <div>
            <strong className="text-xl tracking-[1px]">OPINEX CAMPO</strong>
            <div className="mt-1 text-[11px] tracking-wide text-[#d8c18a]">PESQUISA • COLETA PRESENCIAL</div>
          </div>
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Sair"
            onClick={async () => { await signOut(); navigate('/login') }}>
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        {profile && <div className="mx-auto mt-3 max-w-xl text-xs text-white/70">Olá, {profile.full_name.split(' ')[0]}</div>}
      </header>
      <main className="mx-auto max-w-xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
