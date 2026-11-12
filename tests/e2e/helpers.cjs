// Utilitários dos testes e2e: SQL direto no banco local e cliente Supabase autenticado.
const { execSync } = require('child_process')
const path = require('path')
const { createClient } = require(path.join(__dirname, '../../node_modules/@supabase/supabase-js'))
const fs = require('fs')

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const BASE = process.env.BASE || 'http://localhost:5173'
const DB = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/postgres'
const sql = (q) => execSync(`psql "${DB}" -X -q -t -A -v ON_ERROR_STOP=1`, { input: q }).toString().trim()

async function client(email, password) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  if (email) { const { error } = await c.auth.signInWithPassword({ email, password }); if (error) throw error }
  return c
}
async function signUp(email, name, password = 'Senha1234') {
  const c = await client()
  const { error } = await c.auth.signUp({ email, password, options: { data: { full_name: name, phone: '(19) 98888-0000', terms_version: '1.0', privacy_version: '1.0' } } })
  if (error) throw error
}
async function ensureAdmin(email, name) {
  await signUp(email, name)
  sql(`insert into public.user_roles(user_id, role) select id, 'admin' from auth.users where email='${email}' on conflict do nothing;
       delete from public.user_roles where role='interviewer' and user_id=(select id from auth.users where email='${email}');
       update public.profiles set status='approved' where email='${email}';`)
}
async function login(page, email, password = 'Senha1234') {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}
module.exports = { BASE, sql, client, signUp, ensureAdmin, login }
