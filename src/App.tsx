import { Logo } from '@/components/brand/Logo'
import { isConfigured } from '@/lib/supabase'

// Fase 1: casca da aplicação. As rotas administrativas e de campo entram nas fases 3–5.
export default function App() {
  return (
    <main className="min-h-dvh grid place-items-center bg-navy p-4">
      <div className="card w-full max-w-md p-8 text-center">
        <Logo slogan className="justify-center" />
        <p className="mt-6 text-sm text-ink-muted">
          {isConfigured
            ? 'Conexão com o Supabase configurada.'
            : 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local.'}
        </p>
      </div>
    </main>
  )
}
