import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ToastProvider } from '@/components/ui/toast'
import { Notice, Spinner } from '@/components/ui'
import { isConfigured } from '@/lib/supabase'
import AuthLayout from '@/layouts/AuthLayout'
import Login from '@/pages/public/Login'
import Signup from '@/pages/public/Signup'
import { ForgotPassword, ResetPassword } from '@/pages/public/PasswordPages'
import { Privacy, Terms } from '@/pages/public/Legal'

const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const FieldLayout = lazy(() => import('@/layouts/FieldLayout'))
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'))
const SurveysList = lazy(() => import('@/pages/admin/SurveysList'))
const SurveyForm = lazy(() => import('@/pages/admin/SurveyForm'))
const SurveyDetail = lazy(() => import('@/pages/admin/SurveyDetail'))
const QuestionnaireBuilder = lazy(() => import('@/pages/admin/QuestionnaireBuilder'))
const Interviewers = lazy(() => import('@/pages/admin/Interviewers'))
const InterviewerDetail = lazy(() => import('@/pages/admin/InterviewerDetail'))
const ComingSoon = lazy(() => import('@/pages/admin/ComingSoon'))
const FieldHome = lazy(() => import('@/pages/campo/FieldHome'))

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } } })

/** Guardas de rota servem à navegação. A segurança real está na RLS do banco. */
function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { session, loading, isAdmin } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (admin && !isAdmin) return <Navigate to="/campo" replace />
  return <>{children}</>
}

function Home() {
  const { session, loading, isAdmin } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={isAdmin ? '/admin' : '/campo'} replace />
}

export default function App() {
  if (!isConfigured) {
    return <AuthLayout title="Configuração pendente"><Notice>Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).</Notice></AuthLayout>
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/cadastro" element={<Signup />} />
                <Route path="/recuperar-senha" element={<ForgotPassword />} />
                <Route path="/nova-senha" element={<ResetPassword />} />
                <Route path="/termos" element={<Terms />} />
                <Route path="/privacidade" element={<Privacy />} />

                <Route path="/admin" element={<RequireAuth admin><AdminLayout /></RequireAuth>}>
                  <Route index element={<Dashboard />} />
                  <Route path="pesquisas" element={<SurveysList />} />
                  <Route path="pesquisas/nova" element={<SurveyForm />} />
                  <Route path="pesquisas/:id" element={<SurveyDetail />} />
                  <Route path="pesquisas/:id/editar" element={<SurveyForm />} />
                  <Route path="pesquisas/:id/questionario" element={<QuestionnaireBuilder />} />
                  <Route path="entrevistadores" element={<Interviewers />} />
                  <Route path="entrevistadores/:id" element={<InterviewerDetail />} />
                  <Route path="dispositivos" element={<ComingSoon eyebrow="Controle de acesso" title="Dispositivos e QR Code" phase="Fase 4"
                    items={['Painel das 5 posições globais', 'Emissão de QR Code (token único, 5 minutos, uso único)', 'Leitura do QR pela câmera do celular', 'Revogação imediata e histórico']} />} />
                  <Route path="monitoramento" element={<ComingSoon eyebrow="Operação em campo" title="Monitoramento" phase="Fase 6"
                    items={['Lista de entrevistas com filtros', 'Mapa com as coordenadas GPS', 'Alertas de qualidade e revisão com justificativa', 'Atualização em tempo real']} />} />
                  <Route path="resultados" element={<ComingSoon eyebrow="Área restrita ao administrador" title="Apuração e relatórios" phase="Fase 6"
                    items={['Frequências absolutas e relativas com denominadores', 'Gráficos de barras, setores e evolução', 'Exportação PDF, Excel e CSV', 'Nota metodológica automática']} />} />
                </Route>

                <Route path="/campo" element={<RequireAuth><FieldLayout /></RequireAuth>}>
                  <Route index element={<FieldHome />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
