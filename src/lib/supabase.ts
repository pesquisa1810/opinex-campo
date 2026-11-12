import { createClient } from '@supabase/supabase-js'
import { env, isConfigured } from './env'

// Somente a chave pública (anon) é usada no navegador. Toda autorização é feita
// no banco (RLS + funções SECURITY DEFINER). A chave service_role NUNCA vem para cá.
export const supabase = createClient(
  env.supabaseUrl ?? 'http://localhost:54321',
  env.supabaseAnonKey ?? 'public-anon-key-not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
export { isConfigured }
