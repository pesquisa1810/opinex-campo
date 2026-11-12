export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  appUrl: (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin,
}
export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
