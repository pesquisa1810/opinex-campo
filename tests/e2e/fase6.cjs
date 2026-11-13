// E2E Fase 6: monitoramento, mapa, análise de qualidade, apuração e exportações (PDF/Excel/CSV).
const { chromium } = require('playwright')
const fs = require('fs')
const { sql, client, signUp, ensureAdmin, login } = require('./helpers.cjs')
const SHOTS = process.env.SHOTS || '.'
const s = Date.now().toString().slice(-6)
const ADMIN = `adm6${s}@opinex.test`, INT = `ent6${s}@opinex.test`
let step = 0, current = null
const ok = (m) => console.log(`PASS ${++step}: ${m}`)

;(async () => {
  sql(`update public.devices set status='revoked', revoked_at=now() where status='active';
       update public.device_authorizations set status='cancelled' where status='pending';`)
  await ensureAdmin(ADMIN, 'Admin Fase Seis'); await signUp(INT, 'Carlos Apuração Dias')
  const adm = await client(ADMIN, 'Senha1234'); const ent = await client(INT, 'Senha1234')
  const intId = sql(`select id from public.profiles where email='${INT}'`)
  await adm.rpc('admin_set_user_status', { _user: intId, _status: 'approved' })
  const { data: sv } = await adm.from('surveys').insert({ code: `APUR-${s}`, name: 'Avaliação de serviços (apuração)', municipality: 'Campinas', state: 'SP', target_total: 50, min_duration_seconds: 120, sampling_method: 'Cotas por bairro' }).select('id').single()
  const { data: ver } = await adm.rpc('admin_open_draft_version', { _survey: sv.id })
  const save = async (p) => { const r = await adm.rpc('admin_save_question', { _payload: { version_id: ver, ...p } }); if (r.error) throw r.error; return r.data }
  const q1 = await save({ type: 'single_choice', text: 'Como avalia a coleta de lixo?', options: [{ label: 'Boa' }, { label: 'Regular' }, { label: 'Ruim' }, { label: 'Outro', is_other: true }] })
  const q2 = await save({ type: 'multiple_choice', text: 'Quais serviços utiliza?', max_choices: 2, options: [{ label: 'Saúde' }, { label: 'Educação' }, { label: 'Transporte' }] })
  const q3 = await save({ type: 'numeric', text: 'Nota geral (0 a 10)', min_value: 0, max_value: 10 })
  const q4 = await save({ type: 'open_text', text: 'Sugestão', required: false })
  await adm.rpc('admin_publish_version', { _version: ver })
  await adm.rpc('admin_assign_survey', { _survey: sv.id, _interviewer: intId, _target: 50 })
  await adm.rpc('admin_set_survey_status', { _survey: sv.id, _status: 'in_progress' })
  const { data: auth } = await adm.rpc('admin_create_device_authorization', { _interviewer: intId })
  const { data: dev } = await ent.rpc('consume_device_authorization', { _token: auth.token, _device_key: 'k'.repeat(40) + s, _label: 'Android · Chrome (teste)', _user_agent: 'e2e' })
  if (!dev.ok) throw new Error('consumo falhou')
  const opt = (q, label) => sql(`select id from public.question_options where question_id='${q}' and label='${label}'`)
  const plan = [
    ['Cambuí', 'Boa', ['Saúde'], 9, 'Mais praças', true], ['Cambuí', 'Boa', ['Saúde', 'Educação'], 8, null, true],
    ['Taquaral', 'Regular', ['Transporte'], 6, 'Ônibus', true], ['Taquaral', 'Ruim', ['Saúde'], 3, null, true],
    ['Centro', 'Outro', ['Educação'], 7, null, false], ['Centro', 'Boa', ['Transporte', 'Saúde'], 10, 'Nada', true],
  ]
  const ids = []
  for (const [k, [bairro, a1, a2, a3, a4, gps]] of plan.entries()) {
    const b = await ent.rpc('begin_interview', { _survey: sv.id, _device: dev.device_id, _secret: dev.device_secret })
    if (!b.data.ok) throw new Error(JSON.stringify(b.data))
    const r = await ent.rpc('submit_interview', { _payload: {
      session_id: b.data.session_id, device_id: dev.device_id, device_secret: dev.device_secret,
      municipality: 'Campinas', neighborhood: bairro, sector: `S${k + 1}`,
      location: gps ? { permission: 'granted', latitude: -22.90 - k * 0.004, longitude: -47.06 + k * 0.005, accuracy: 12 } : { permission: 'denied' },
      answers: [
        { question_id: q1, option_ids: [opt(q1, a1)], other_text: a1 === 'Outro' ? 'Não utiliza' : null },
        { question_id: q2, option_ids: a2.map((x) => opt(q2, x)) },
        { question_id: q3, numeric_value: a3 },
        ...(a4 ? [{ question_id: q4, text_value: a4 }] : []),
      ] } })
    if (!r.data.ok) throw new Error(JSON.stringify(r.data))
    ids.push(r.data.interview_id)
  }
  ok('6 entrevistas reais enviadas por celular autorizado (5 com GPS, 1 sem)')

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const a = await ctx.newPage(); current = a
  a.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message))
  await login(a, ADMIN)
  await a.getByRole('link', { name: 'Monitoramento' }).click()
  await a.getByLabel('Pesquisa').selectOption({ label: `APUR-${s}` })
  await a.locator('tbody tr').nth(5).waitFor()
  if (await a.locator('tbody tr').count() !== 6) throw new Error('linhas != 6')
  await a.waitForTimeout(1500)
  const markers = await a.locator('path.leaflet-interactive').count()
  if (markers !== 5) throw new Error(`marcadores no mapa: ${markers}`)
  await a.screenshot({ path: `${SHOTS}/20-monitoramento.png`, fullPage: true })
  ok('monitoramento lista as 6 entrevistas e o mapa mostra 5 pontos GPS')

  await a.getByLabel('Somente com alertas').check()
  await a.waitForTimeout(800)
  if (await a.locator('tbody tr').count() !== 6) throw new Error('todas deveriam ter alerta de duração curta')
  await a.getByLabel('Somente com alertas').uncheck()
  ok('alertas de qualidade (duração curta / sem GPS) gerados sem rejeição automática')

  // Análise: rejeitar exige justificativa
  await a.locator('tbody tr', { hasText: 'Centro' }).filter({ has: a.getByLabel('Sem GPS') }).click()
  const dlg = a.getByRole('dialog')
  await dlg.getByText('Entrevista sem localização GPS.').waitFor()
  await dlg.getByText('Não utiliza').waitFor()
  await a.screenshot({ path: `${SHOTS}/21-analise.png` })
  await dlg.getByRole('button', { name: 'Rejeitar' }).click()
  await a.getByText('Informe a justificativa.').waitFor()
  await dlg.getByLabel(/Observação/).fill('Sem GPS e local não confirmado.')
  await dlg.getByRole('button', { name: 'Rejeitar' }).click()
  await a.getByText('marcada como "Rejeitada"').waitFor()
  await dlg.getByText('Sem GPS e local não confirmado.').first().waitFor()
  await dlg.getByLabel('Fechar').click()
  for (const id of ids.slice(0, 3)) await adm.rpc('admin_review_interview', { _interview: id, _status: 'approved', _note: null })
  ok('análise: rejeição exige justificativa e fica no histórico; aprovações registradas')

  // Apuração
  await a.getByRole('link', { name: 'Apuração e relatórios' }).click()
  await a.getByLabel('Pesquisa').selectOption({ label: `APUR-${s} — Avaliação de serviços (apuração)` })
  await a.getByText('P1. Como avalia a coleta de lixo?').waitFor()
  const included = await a.locator('.panel', { has: a.locator('.k', { hasText: /^Entrevistas incluídas$/ }) }).locator('.num').innerText()
  if (included.trim() !== '5') throw new Error('incluídas (sem rejeitada) = ' + included)
  const p1 = a.locator('.panel', { hasText: 'P1. Como avalia' })
  await p1.getByRole('row', { name: /Boa 3 60%/ }).waitFor()
  await p1.getByRole('button', { name: 'setores' }).click(); await p1.locator('.recharts-pie').waitFor()
  await a.getByLabel('Base de cálculo dos percentuais').selectOption('base')
  await a.screenshot({ path: `${SHOTS}/22-apuracao.png`, fullPage: true })
  await a.getByText('Somente aprovadas').count()
  await a.getByRole('button', { name: 'Recebida', exact: true }).click()
  await a.getByRole('button', { name: 'Em análise', exact: true }).click()
  await a.waitForFunction(() => document.querySelector('.panel .num')?.textContent?.trim() === '3')
  ok('apuração: denominadores corretos (rejeitada excluída), frequência absoluta/relativa, gráficos e filtro por situação')

  const files = {}
  // PDF: abre a janela de opções e gera com gráficos (P1 em setores, escolhido na tela)
  await a.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  const pdfDlg = a.getByRole('dialog', { name: 'Relatório em PDF com gráficos' })
  await pdfDlg.getByText('Tipo de gráfico das perguntas').waitFor()
  await a.screenshot({ path: `${SHOTS}/23-opcoes-pdf.png` })
  {
    const [dl] = await Promise.all([a.waitForEvent('download'), pdfDlg.getByRole('button', { name: 'Gerar PDF' }).click()])
    const path = `${SHOTS}/${dl.suggestedFilename()}`; await dl.saveAs(path); files.pdf = path
  }
  for (const [btn, key] of [['Excel', 'xlsx'], ['CSV', 'csv'], ['Microdados CSV', 'micro']]) {
    const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: btn, exact: true }).click()])
    const path = `${SHOTS}/${dl.suggestedFilename()}`; await dl.saveAs(path); files[key] = path
  }
  const head = (p, n) => fs.readFileSync(p).subarray(0, n).toString('latin1')
  if (!head(files.pdf, 5).startsWith('%PDF')) throw new Error('PDF inválido')
  const pdfText = require('child_process').execSync(`pdftotext -layout "${files.pdf}" -`).toString()
  for (const must of ['RELATÓRIO DE APURAÇÃO', 'Visão geral da coleta', 'Evolução diária', 'Resultados por pergunta', 'P1. Como avalia a coleta de lixo?', 'marcações', 'Nota metodológica'])
    if (!pdfText.includes(must)) throw new Error('PDF sem o trecho: ' + must)
  const pages = Number(require('child_process').execSync(`pdfinfo "${files.pdf}" | awk '/^Pages/{print $2}'`).toString().trim())
  if (pages < 3) throw new Error('PDF com poucas páginas: ' + pages)
  const drawOps = Number(require('child_process').execSync(`python3 -I ${require('path').join(__dirname, 'pdfdraw.py')} "${files.pdf}"`).toString().trim())
  if (drawOps < 100) throw new Error('PDF sem gráficos (poucas operações de desenho): ' + drawOps)
  if (!head(files.xlsx, 2).startsWith('PK')) throw new Error('XLSX inválido')
  const csv = fs.readFileSync(files.csv, 'utf8'); const micro = fs.readFileSync(files.micro, 'utf8')
  if (!csv.includes('Boa;1;2;66,7;66,7')) throw new Error('CSV frequências inesperado:\n' + csv.slice(0, 800))
  if (micro.trim().split('\r\n').length !== 4) throw new Error('microdados deveriam ter 3 linhas + cabeçalho')
  if (sql(`select count(*) from public.audit_logs where action='export_microdata' and created_at > now() - interval '5 minutes'`) === '0') throw new Error('exportação não auditada')
  ok(`exportações geradas e conferidas: PDF com gráficos (${pages} páginas, ${drawOps} operações de desenho, ${fs.statSync(files.pdf).size} B), Excel (${fs.statSync(files.xlsx).size} B), CSV e microdados; exportação auditada`)

  // Entrevistador não acessa resultados
  const r = await ent.rpc('admin_survey_results', { _survey: sv.id })
  const m = await ent.rpc('admin_export_microdata', { _survey: sv.id })
  const locs = await ent.from('interview_locations').select('*')
  if (!String(r.error?.message).startsWith('FORBIDDEN') || !String(m.error?.message).startsWith('FORBIDDEN') || locs.data.length) throw new Error('entrevistador acessou dados restritos')
  ok('entrevistador bloqueado: sem resultados consolidados, microdados ou localização')

  await browser.close()
  console.log(`\nFASE 6: ${step} verificações de ponta a ponta passaram`)
})().catch(async (e) => {
  console.error('FALHOU:', e.message)
  if (current) await current.screenshot({ path: `${SHOTS}/falha.png`, fullPage: true }).catch(() => {})
  process.exit(1)
})
