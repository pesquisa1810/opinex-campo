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
const FieldHome = lazy(() => import('@/pages/campo/FieldHome'))
const AuthorizeDevice = lazy(() => import('@/pages/campo/AuthorizeDevice'))
const Interview = lazy(() => import('@/pages/campo/Interview'))
const StartInterview = lazy(() => import('@/pages/campo/Interview').then((m) => ({ default: m.StartInterview })))
const Devices = lazy(() => import('@/pages/admin/Devices'))
const Monitoring = lazy(() => import('@/pages/admin/Monitoring'))
const Results = lazy(() => import('@/pages/admin/Results'))

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } } })

/** Guardas de rota servem à navegação. A segurança real está na RLS do banco. */
function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { session, loading, isAdmin } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
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
                  <Route path="dispositivos" element={<Devices />} />
                  <Route path="monitoramento" element={<Monitoring />} />
                  <Route path="resultados" element={<Results />} />
                </Route>

                <Route path="/campo" element={<RequireAuth><FieldLayout /></RequireAuth>}>
                  <Route index element={<FieldHome />} />
                  <Route path="dispositivo" element={<AuthorizeDevice />} />
                  <Route path="entrevista/nova/:surveyId" element={<StartInterview />} />
                  <Route path="entrevista/:sessionId" element={<Interview />} />
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
