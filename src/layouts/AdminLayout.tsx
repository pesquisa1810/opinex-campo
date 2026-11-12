import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, ClipboardList, LayoutDashboard, LogOut, MapPinned, QrCode, Users } from 'lucide-react'
import { LogoMark, Wordmark } from '@/components/brand/Logo'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin/pesquisas', label: 'Pesquisas', icon: ClipboardList },
  { to: '/admin/entrevistadores', label: 'Entrevistadores', icon: Users, badge: true },
  { to: '/admin/dispositivos', label: 'Dispositivos / QR Code', icon: QrCode },
  { to: '/admin/monitoramento', label: 'Monitoramento', icon: MapPinned },
  { to: '/admin/resultados', label: 'Apuração e relatórios', icon: BarChart3 },
]

function crumbFor(path: string) {
  const hit = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => path === n.to || path.startsWith(n.to + '/'))
  return hit?.label ?? 'Visão geral'
}

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [menuUser, setMenuUser] = useState(false)

  const pending = useQuery({
    queryKey: ['pending-count'],
    queryFn: async () => {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      return count ?? 0
    },
  })

  // Atualização em tempo real: novos cadastros, entrevistas e dispositivos
  useEffect(() => {
    const ch = supabase.channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        qc.invalidateQueries({ queryKey: ['pending-count'] }); qc.invalidateQueries({ queryKey: ['interviewers'] }); qc.invalidateQueries({ queryKey: ['dashboard'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interviews' }, () => {
        qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['surveys'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['devices'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [qc])

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 h-dvh w-[62px] shrink-0 overflow-y-auto bg-navy px-1.5 py-3 text-white md:w-[235px] md:px-3.5 md:py-[22px]">
        <div className="flex items-center gap-2.5 border-b border-[#40506a] px-1 pb-[22px] pt-2 md:px-2.5">
          <LogoMark className="h-9 w-9 md:hidden" />
          <Wordmark className="hidden md:block" />
        </div>
        <div className="mx-2.5 mb-2 mt-[22px] hidden text-[10px] tracking-[1.5px] text-[#9eafc5] md:block">ADMINISTRAÇÃO</div>
        <nav className="mt-4 md:mt-0">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} title={n.label}
              className={({ isActive }) => cn('relative my-[3px] flex items-center gap-2.5 rounded-lg px-2.5 py-3 text-[#dce4ef] transition hover:bg-[#293d5b] hover:text-white max-md:justify-center',
                isActive && 'bg-[#293d5b] text-white')}>
              <n.icon className="h-[18px] w-[18px] shrink-0 text-gold" />
              <span className="hidden flex-1 md:inline">{n.label}</span>
              {n.badge && (pending.data ?? 0) > 0 && (
                <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold text-navy max-md:absolute max-md:right-1 max-md:top-1">{pending.data}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mx-2.5 mt-9 hidden text-[10px] leading-relaxed text-[#aab6c8] md:block">
          OPINEX CAMPO<br />Inteligência na coleta.<br />Precisão na informação.
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-line bg-white px-3 sm:px-[26px]">
          <strong className="truncate text-sm">{crumbFor(pathname)}</strong>
          <div className="relative flex items-center gap-3">
            <span className="hidden text-sm sm:inline">{profile?.full_name ?? 'Administrador'}</span>
            <button onClick={() => setMenuUser((v) => !v)} aria-label="Menu do usuário"
              className="grid h-10 w-10 place-items-center rounded-full bg-[#eee3c8] font-bold text-[#604b20]">
              {initials(profile?.full_name) || 'A'}
            </button>
            {menuUser && (
              <div className="absolute right-0 top-12 w-56 rounded-xl border border-line bg-white p-2 shadow-lg">
                <div className="px-2 py-1.5 text-xs text-ink-muted">{profile?.email}</div>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-soft"
                  onClick={async () => { await signOut(); navigate('/login') }}>
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-2.5 py-4 sm:p-[26px]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
