// Teste funcional de ponta a ponta da Fase 3 (navegador real + Supabase local).
// Uso: BASE=http://localhost:5173 DB_URL=postgresql://... SHOTS=pasta node tests/e2e/fase3.cjs
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.env.BASE || 'http://localhost:5173'
const DB = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/postgres'
const SHOTS = process.env.SHOTS || '.'
const sql = (q) => execSync(`psql "${DB}" -X -q -t -A -c "${q.replace(/"/g, '\\"')}"`).toString().trim()
const stamp = Date.now().toString().slice(-6)
const ADMIN = { name: 'Administrador Geral', email: `admin${stamp}@opinex.test`, pass: 'Senha1234' }
const INT = { name: 'Maria Entrevistadora Silva', email: `maria${stamp}@opinex.test`, pass: 'Senha1234' }
let step = 0
let current = null
const ok = (m) => console.log(`PASS ${++step}: ${m}`)

async function signup(page, u) {
  await page.goto(`${BASE}/cadastro`)
  await page.getByLabel('Nome completo').fill(u.name)
  await page.getByLabel('Telefone (WhatsApp)').fill('(19) 99999-1234')
  await page.getByLabel('E-mail').fill(u.email)
  await page.getByLabel('Senha', { exact: true }).fill(u.pass)
  await page.getByLabel('Confirmar senha').fill(u.pass)
  await page.locator('input[type=checkbox]').nth(0).check()
  await page.locator('input[type=checkbox]').nth(1).check()
  await page.getByRole('button', { name: 'Enviar cadastro' }).click()
  await page.getByText('pendente de aprovação').waitFor()
}
async function login(page, u) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('E-mail').fill(u.email)
  await page.getByLabel('Senha').fill(u.pass)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } })
  const page = await ctx.newPage()
  current = page
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message))

  // Cadastro sem aceite bloqueado no formulário
  await page.goto(`${BASE}/cadastro`)
  await page.getByRole('button', { name: 'Enviar cadastro' }).click()
  await page.getByText('Informe o nome completo').waitFor()
  ok('formulário de cadastro valida campos obrigatórios')

  await signup(page, ADMIN)
  await page.screenshot({ path: `${SHOTS}/01-cadastro-enviado.png` })
  ok('cadastro público do futuro administrador → pendente')
  if (sql(`select status from public.profiles where email='${ADMIN.email}'`) !== 'pending') throw new Error('não ficou pendente')
  const exists = sql(`select count(*) from public.user_roles where role='admin'`)
  if (exists === '0') sql(`select public.provision_first_admin('${ADMIN.email}')`)
  else sql(`insert into public.user_roles(user_id, role) select id, 'admin' from auth.users where email='${ADMIN.email}'; update public.profiles set status='approved' where email='${ADMIN.email}'`)
  ok('primeiro administrador provisionado via SQL')

  await signup(page, INT)
  ok('cadastro público do entrevistador → pendente')

  // Entrevistador pendente: tela de análise e sem acesso ao /admin
  await login(page, INT)
  await page.getByText('Cadastro em análise').waitFor()
  await page.goto(`${BASE}/admin`)
  await page.waitForURL(/\/campo/)
  await page.setViewportSize({ width: 390, height: 800 })
  await page.screenshot({ path: `${SHOTS}/02-entrevistador-pendente-mobile.png` })
  await page.setViewportSize({ width: 1366, height: 860 })
  ok('entrevistador pendente vê "em análise" e é redirecionado ao tentar /admin')
  await page.getByLabel('Sair').click()

  // Admin
  await login(page, ADMIN)
  await page.waitForURL(/\/admin$/)
  await page.getByText('Visão geral', { exact: true }).first().waitFor()
  await page.getByText('aguardando aprovação').waitFor()
  ok('admin entra no painel e vê alerta de cadastro pendente')

  await page.getByRole('link', { name: /Entrevistadores/ }).click()
  await page.getByRole('row', { name: new RegExp(INT.email.replace('.', '\\.')) }).getByRole('button', { name: 'Aprovar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click()
  await page.getByText('aprovar concluído').waitFor()
  if (sql(`select status from public.profiles where email='${INT.email}'`) !== 'approved') throw new Error('não aprovou')
  await page.screenshot({ path: `${SHOTS}/03-entrevistadores.png`, fullPage: true })
  ok('admin aprova o entrevistador')

  // Pesquisa
  await page.getByRole('link', { name: 'Pesquisas' }).click()
  await page.getByRole('button', { name: 'Cadastrar pesquisa' }).click()
  await page.getByLabel('Nome da pesquisa *').fill('Avaliação dos serviços públicos municipais')
  await page.getByLabel('Código identificador *').fill(`AVAL-${stamp}`)
  await page.getByLabel('Município').fill('Campinas')
  await page.getByLabel('Estado').selectOption('SP')
  await page.getByLabel('Meta de entrevistas *').fill('400')
  await page.getByLabel('Data inicial').fill('2026-11-10')
  await page.getByLabel('Data final').fill('2026-12-10')
  await page.getByLabel('Método de amostragem').fill('Cotas por sexo e faixa etária')
  await page.getByRole('button', { name: 'Salvar pesquisa' }).click()
  await page.waitForURL(/\/admin\/pesquisas\/[0-9a-f-]{36}$/)
  ok('pesquisa criada pelo formulário')

  await page.getByRole('link', { name: 'Questionário' }).click()
  await page.getByRole('button', { name: 'Criar questionário' }).click()
  await page.getByRole('button', { name: 'Adicionar pergunta' }).waitFor()

  // P1 escolha única com "Outro"
  await page.getByRole('button', { name: 'Adicionar pergunta' }).click()
  let dlg = page.getByRole('dialog')
  await dlg.getByLabel('Enunciado *').fill('O(a) sr(a) utiliza o posto de saúde do bairro?')
  await dlg.getByLabel('Alternativa 1').fill('Sim')
  await dlg.getByLabel('Alternativa 2').fill('Não')
  await dlg.getByRole('button', { name: /Alternativa "Outro/ }).click()
  await dlg.getByRole('button', { name: 'Salvar pergunta' }).click()
  await page.getByText('Pergunta adicionada.').waitFor()
  // P2 numérica
  await page.getByRole('button', { name: 'Adicionar pergunta' }).click()
  dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: /Resposta numérica/ }).click()
  await dlg.getByLabel('Enunciado *').fill('De 0 a 10, que nota dá ao atendimento?')
  await dlg.getByLabel('Valor mínimo').fill('0')
  await dlg.getByLabel('Valor máximo').fill('10')
  await dlg.getByRole('button', { name: 'Salvar pergunta' }).click()
  await page.getByText('Pergunta adicionada.').last().waitFor()
  await page.getByText('De 0 a 10, que nota').waitFor()
  // Ajusta P2 para condicional (P1 = Sim)
  await page.locator('.panel', { hasText: 'De 0 a 10' }).getByRole('button', { name: 'Editar' }).click()
  dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: 'Adicionar condição' }).click()
  await dlg.getByLabel('Alternativa', { exact: true }).selectOption({ label: 'Sim' })
  await dlg.getByRole('button', { name: 'Salvar pergunta' }).click()
  await page.getByText('Pergunta atualizada.').waitFor()
  // P3 múltipla
  await page.getByRole('button', { name: 'Adicionar pergunta' }).click()
  dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: /Múltipla escolha/ }).click()
  await dlg.getByLabel('Enunciado *').fill('Quais os principais problemas do bairro?')
  for (const [i, t] of ['Saúde', 'Segurança', 'Transporte'].entries()) {
    if (i >= 2) await dlg.getByRole('button', { name: 'Alternativa', exact: true }).click()
    await dlg.getByLabel(`Alternativa ${i + 1}`).fill(t)
  }
  await dlg.getByLabel('Máximo de alternativas marcadas (opcional)').fill('2')
  await dlg.getByRole('button', { name: 'Salvar pergunta' }).click()
  await page.getByText('Quais os principais problemas').waitFor()
  // P4 espontânea opcional
  await page.getByRole('button', { name: 'Adicionar pergunta' }).click()
  dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: /Resposta espontânea/ }).click()
  await dlg.getByLabel('Enunciado *').fill('Que sugestão daria à prefeitura?')
  await dlg.getByLabel('Resposta obrigatória').uncheck()
  await dlg.getByRole('button', { name: 'Salvar pergunta' }).click()
  await page.getByText('Que sugestão daria').waitFor()
  await page.getByText('Exibir somente se').waitFor()
  await page.screenshot({ path: `${SHOTS}/04-construtor.png`, fullPage: true })
  ok('construtor: escolha única com "Outro", numérica condicional, múltipla com limite, espontânea opcional')

  // Pré-visualização: P1 = Não oculta a P2
  await page.getByRole('button', { name: 'Visualizar' }).click()
  dlg = page.getByRole('dialog')
  await dlg.getByText('Pergunta 1 de 3').waitFor()
  await dlg.getByRole('button', { name: 'Avançar' }).click()
  await dlg.getByText('Resposta obrigatória.').waitFor()
  await dlg.getByRole('button', { name: 'Sim' }).click()
  await dlg.getByText('Pergunta 1 de 4').waitFor()
  await dlg.getByRole('button', { name: 'Não' }).click()
  await dlg.getByText('Pergunta 1 de 3').waitFor()
  await dlg.getByRole('button', { name: 'Sim' }).click()
  await dlg.getByRole('button', { name: 'Avançar' }).click()
  await dlg.getByRole('spinbutton').fill('11')
  await dlg.getByRole('button', { name: 'Avançar' }).click()
  await dlg.getByText('O valor máximo é 10.').waitFor()
  await dlg.getByRole('spinbutton').fill('8')
  await dlg.getByRole('button', { name: 'Avançar' }).click()
  await dlg.getByRole('button', { name: 'Saúde' }).click()
  await dlg.getByRole('button', { name: 'Segurança' }).click()
  await dlg.getByRole('button', { name: 'Transporte' }).click()
  await dlg.getByRole('button', { name: 'Avançar' }).click()
  await dlg.getByText('Marque no máximo 2').waitFor()
  await page.screenshot({ path: `${SHOTS}/05-previa.png` })
  await dlg.getByRole('button', { name: 'Transporte' }).click()
  await dlg.getByRole('button', { name: 'Avançar' }).click()
  await dlg.getByRole('button', { name: 'Revisar' }).click()
  await dlg.getByText('Confira as respostas').waitFor()
  await dlg.getByLabel('Fechar').click()
  ok('pré-visualização aplica condicional, obrigatoriedade, intervalo e limite de múltipla escolha')

  // Publicar
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publicar versão' }).click()
  await page.getByText('Versão 1 publicada.').waitFor()
  await page.getByText('somente leitura').waitFor()
  ok('versão 1 publicada e travada (somente leitura)')

  // Atribuir entrevistador e liberar pesquisa
  await page.getByRole('link', { name: 'Pesquisa', exact: true }).click()
  await page.getByRole('button', { name: 'Equipe e metas' }).click()
  await page.getByRole('button', { name: 'Atribuir entrevistador' }).click()
  dlg = page.getByRole('dialog')
  await dlg.getByLabel('Entrevistador aprovado').selectOption({ label: `${INT.name} — ${INT.email}` })
  await dlg.getByLabel('Meta individual nesta pesquisa').fill('50')
  await dlg.getByRole('button', { name: 'Atribuir' }).click()
  await page.getByText('Entrevistador atribuído.').waitFor()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await page.getByText('Situação alterada para "Publicada"').waitFor()
  await page.screenshot({ path: `${SHOTS}/06-pesquisa.png`, fullPage: true })
  ok('entrevistador atribuído com meta e pesquisa publicada')

  // Nova versão não altera a publicada
  await page.getByRole('link', { name: 'Questionário' }).click()
  await page.getByRole('button', { name: 'Criar nova versão para editar' }).click()
  await page.getByText('Rascunho editável').waitFor()
  const qs = sql(`select string_agg(v.version||':'||v.status||':'||(select count(*) from public.questions q where q.version_id=v.id), ',' order by v.version) from public.questionnaire_versions v join public.surveys s on s.id=v.survey_id where s.code='AVAL-${stamp}'`)
  if (qs !== '1:published:4,2:draft:4') throw new Error('versões inesperadas: ' + qs)
  ok('nova versão em rascunho copiada; v1 publicada intacta')

  await page.getByRole('link', { name: 'Visão geral' }).click()
  await page.getByText('Entrevistas por pesquisa').waitFor()
  await page.screenshot({ path: `${SHOTS}/07-visao-geral.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${SHOTS}/08-visao-geral-mobile.png`, fullPage: true })
  ok('visão geral renderiza (desktop e celular)')

  // Entrevistador aprovado
  await page.setViewportSize({ width: 1366, height: 860 })
  await page.getByLabel('Menu do usuário').click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await login(page, INT)
  await page.getByText('Cadastro aprovado').waitFor()
  ok('entrevistador aprovado vê o novo status')

  await browser.close()
  console.log(`\nFASE 3: ${step} verificações de ponta a ponta passaram`)
})().catch(async (e) => {
  console.error('FALHOU:', e.message)
  if (current) await current.screenshot({ path: `${SHOTS}/falha.png`, fullPage: true }).catch(() => {})
  process.exit(1)
})
