// E2E Fases 4 e 5: QR Code, limite global, coleta com GPS, idempotência, rascunho offline, revogação.
const { chromium } = require('playwright')
const { BASE, sql, client, signUp, ensureAdmin, login } = require('./helpers.cjs')
const SHOTS = process.env.SHOTS || '.'
const s = Date.now().toString().slice(-6)
const ADMIN = `adm45${s}@opinex.test`, INT = `ent45${s}@opinex.test`, INT2 = `ent45b${s}@opinex.test`
let step = 0, current = null
const ok = (m) => console.log(`PASS ${++step}: ${m}`)

;(async () => {
  // Preparação: libera todas as posições e cria admin, entrevistadores e uma pesquisa publicada
  sql(`update public.devices set status='revoked', revoked_at=now() where status='active';
       update public.device_authorizations set status='cancelled' where status='pending';`)
  await ensureAdmin(ADMIN, 'Admin Fase Quatro')
  await signUp(INT, 'Joana Campo Souza'); await signUp(INT2, 'Pedro Campo Lima')
  const adm = await client(ADMIN, 'Senha1234')
  for (const e of [INT, INT2]) {
    const id = sql(`select id from public.profiles where email='${e}'`)
    const { error } = await adm.rpc('admin_set_user_status', { _user: id, _status: 'approved' }); if (error) throw error
  }
  const { data: sv, error: e1 } = await adm.from('surveys').insert({ code: `CAMPO-${s}`, name: 'Pesquisa de campo e2e', municipality: 'Campinas', state: 'SP', target_total: 100, min_duration_seconds: 5 }).select('id').single()
  if (e1) throw e1
  const { data: ver } = await adm.rpc('admin_open_draft_version', { _survey: sv.id })
  const { data: q1 } = await adm.rpc('admin_save_question', { _payload: { version_id: ver, type: 'single_choice', text: 'Avalia bem a gestão municipal?', options: [{ label: 'Sim' }, { label: 'Não' }, { label: 'Outro', is_other: true }] } })
  await adm.rpc('admin_save_question', { _payload: { version_id: ver, type: 'numeric', text: 'Que nota daria?', min_value: 0, max_value: 10,
    conditions: [{ depends_on_question_id: q1, operator: 'equals', option_id: sql(`select id from public.question_options where question_id='${q1}' and position=1`) }] } })
  await adm.rpc('admin_save_question', { _payload: { version_id: ver, type: 'open_text', text: 'Comentário livre', required: false } })
  const pub = await adm.rpc('admin_publish_version', { _version: ver }); if (!pub.data?.ok) throw new Error(JSON.stringify(pub))
  for (const e of [INT, INT2]) await adm.rpc('admin_assign_survey', { _survey: sv.id, _interviewer: sql(`select id from public.profiles where email='${e}'`), _target: 20 })
  await adm.rpc('admin_set_survey_status', { _survey: sv.id, _status: 'published' })
  ok('preparação: admin, 2 entrevistadores aprovados, pesquisa publicada e atribuída')

  const browser = await chromium.launch()
  const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 860 } })
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    geolocation: { latitude: -22.9056, longitude: -47.0608, accuracy: 15 }, permissions: ['geolocation'],
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' })
  const a = await adminCtx.newPage(); const p = await phoneCtx.newPage(); current = p
  for (const pg of [a, p]) pg.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message))

  // Entrevistador sem celular autorizado não consegue iniciar
  await login(p, INT)
  await p.getByText('Autorize este celular para coletar').waitFor()
  if (!(await p.getByRole('button', { name: 'Iniciar entrevista' }).isDisabled())) throw new Error('deveria estar desabilitado')
  ok('sem celular autorizado o botão de iniciar fica bloqueado')

  // Admin gera QR
  await login(a, ADMIN)
  await a.getByRole('link', { name: /Dispositivos/ }).click()
  await a.getByRole('button', { name: 'Gerar QR Code' }).click()
  await a.getByRole('dialog').getByLabel('Entrevistador aprovado').selectOption({ label: 'Joana Campo Souza' })
  await a.getByRole('dialog').getByRole('button', { name: 'Gerar QR Code' }).click()
  const qr = a.getByTestId('qr-code'); await qr.waitFor()
  const url = await qr.getAttribute('data-qr-url')
  await a.getByText('Aguardando leitura').first().waitFor()
  await a.screenshot({ path: `${SHOTS}/10-qr-emitido.png`, fullPage: true })
  ok('admin emite QR Code (5 minutos, posição reservada)')

  // Celular abre o link do QR (como a câmera nativa faria)
  await p.goto(url)
  await p.getByText('Celular autorizado com sucesso').waitFor()
  if (new URL(p.url()).searchParams.get('t')) throw new Error('token ficou na URL')
  await p.screenshot({ path: `${SHOTS}/11-celular-autorizado.png` })
  await a.getByText('Celular autorizado.').waitFor({ timeout: 15000 })
  ok('celular lê o QR, é autorizado no servidor e o painel confirma em tempo real')

  // Reutilização do mesmo QR por outro entrevistador
  const p2ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await p2ctx.newPage()
  await login(p2, INT2); await p2.getByText('Autorize este celular').waitFor()
  await p2.goto(url)
  await p2.getByText(/inválido ou emitido para outro|já foi utilizado/).waitFor()
  ok('QR Code reutilizado é recusado')
  if (sql(`select count(*) from public.devices where status='active'`) !== '1') throw new Error('dispositivos ativos != 1')

  // Coleta completa
  await p.getByRole('link', { name: 'Ir para minhas pesquisas' }).click()
  await p.getByRole('button', { name: 'Iniciar entrevista' }).click()
  await p.getByText('Etapa 1 · Local da entrevista').waitFor()
  await p.getByText(/Localização registrada \(precisão aproximada de 15 m\)/).waitFor()
  await p.getByRole('button', { name: 'Iniciar questionário' }).click()
  await p.getByText('Informe município e bairro.').waitFor()
  await p.getByLabel('Bairro *').fill('Cambuí')
  await p.getByLabel('Setor ou região').fill('Setor Central')
  await p.screenshot({ path: `${SHOTS}/12-local-gps.png` })
  await p.getByRole('button', { name: 'Iniciar questionário' }).click()
  await p.getByRole('button', { name: 'Sim' }).click()
  await p.getByRole('button', { name: 'Avançar' }).click()
  await p.getByRole('spinbutton').fill('9')
  await p.screenshot({ path: `${SHOTS}/13-pergunta.png` })
  await p.getByRole('button', { name: 'Avançar' }).click()
  await p.getByRole('textbox').fill('Melhorar a iluminação das ruas.')
  await p.getByRole('button', { name: 'Revisar' }).click()
  await p.getByText('Confira as respostas').waitFor()
  await p.screenshot({ path: `${SHOTS}/14-revisao.png`, fullPage: true })
  await p.getByRole('button', { name: 'Confirmar e enviar' }).click()
  await p.getByText('ENVIADA').waitFor()
  await p.screenshot({ path: `${SHOTS}/15-enviada.png` })
  const row = sql(`select i.municipality||'|'||i.neighborhood||'|'||i.answers_count||'|'||l.permission||'|'||round(l.latitude::numeric,4) from public.interviews i join public.interview_locations l on l.interview_id=i.id join public.surveys s on s.id=i.survey_id where s.code='CAMPO-${s}'`)
  if (row !== 'Campinas|Cambuí|3|granted|-22.9056') throw new Error('gravação inesperada: ' + row)
  ok('entrevista completa enviada; status ENVIADA só após confirmação; GPS e respostas gravados no Supabase')

  // Rascunho offline: queda de conexão no envio
  await p.getByRole('button', { name: 'Nova entrevista nesta pesquisa' }).click()
  await p.getByLabel('Bairro *').fill('Taquaral')
  await p.getByRole('button', { name: 'Iniciar questionário' }).click()
  await p.getByRole('button', { name: 'Não' }).click()
  await p.getByRole('button', { name: 'Avançar' }).click()
  await p.getByRole('button', { name: 'Revisar' }).click()
  await phoneCtx.setOffline(true)
  await p.getByRole('button', { name: 'Confirmar e enviar' }).click()
  await p.getByText(/NÃO foi enviada/).waitFor()
  await p.screenshot({ path: `${SHOTS}/16-offline.png` })
  if (sql(`select count(*) from public.interviews i join public.surveys s on s.id=i.survey_id where s.code='CAMPO-${s}'`) !== '1') throw new Error('contou entrevista offline')
  await phoneCtx.setOffline(false)
  await p.goto(`${BASE}/campo`)
  await p.getByText('Entrevistas não enviadas (1)').waitFor()
  await p.getByRole('button', { name: 'Retomar' }).click()
  await p.getByRole('button', { name: 'Avançar' }).click()
  await p.getByRole('button', { name: 'Revisar' }).click()
  await p.getByRole('button', { name: 'Confirmar e enviar' }).click()
  await p.getByText('ENVIADA').waitFor()
  ok('sem conexão: entrevista NÃO é contabilizada, fica guardada e é enviada depois')

  // Idempotência: reenvio da mesma sessão pela API
  const ent = await client(INT, 'Senha1234')
  const sess = sql(`select i.id from public.interviews i join public.surveys s on s.id=i.survey_id where s.code='CAMPO-${s}' order by submitted_at limit 1`)
  const dev = await p.evaluate(() => JSON.parse(localStorage.getItem('opinex.device.v1')))
  const re = await ent.rpc('submit_interview', { _payload: { session_id: sess, device_id: dev.device_id, device_secret: dev.device_secret, municipality: 'X', neighborhood: 'Y', answers: [] } })
  if (!re.data?.duplicate) throw new Error('reenvio não idempotente: ' + JSON.stringify(re.data))
  if (sql(`select count(*) from public.interviews i join public.surveys s on s.id=i.survey_id where s.code='CAMPO-${s}'`) !== '2') throw new Error('duplicou')
  ok('reenvio da mesma entrevista não cria duplicata')

  // Painel: limite global de 5 posições
  sql(`insert into public.devices(interviewer_id, label, device_key_hash, secret_hash)
       select (select id from public.profiles where email='${INT2}'), 'Simulado '||g, md5(random()::text), md5(random()::text) from generate_series(1,4) g`)
  await a.reload()
  await a.getByText('Ativos: 5').waitFor()
  if (!(await a.getByRole('button', { name: 'Gerar QR Code' }).isDisabled())) throw new Error('botão deveria estar bloqueado com 5 ativos')
  const six = await adm.rpc('admin_create_device_authorization', { _interviewer: sql(`select id from public.profiles where email='${INT2}'`) })
  if (!String(six.error?.message).startsWith('DEVICE_LIMIT_REACHED')) throw new Error('6º não bloqueado')
  await a.screenshot({ path: `${SHOTS}/17-dispositivos-cheio.png`, fullPage: true })
  ok('com 5 celulares ativos o painel e o servidor bloqueiam o sexto')

  // Revogação imediata
  await a.locator('div.rounded-\\[10px\\]', { hasText: 'Joana Campo Souza' }).getByRole('button', { name: 'Revogar' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Revogar agora' }).click()
  await a.getByText('Dispositivo revogado').waitFor()
  if (sql(`select status from public.devices where id='${dev.device_id}'`) !== 'revoked') throw new Error('revogou o dispositivo errado')
  await p.goto(`${BASE}/campo`)
  await p.getByText('Autorização revogada.').waitFor()
  const blocked = await ent.rpc('begin_interview', { _survey: sv.id, _device: dev.device_id, _secret: dev.device_secret })
  if (blocked.data?.error !== 'DEVICE_REVOKED') throw new Error('não bloqueou: ' + JSON.stringify(blocked.data))
  if (sql(`select count(*) from public.audit_logs where action='blocked_begin_revoked_device' and created_at > now() - interval '2 minutes'`) === '0') throw new Error('sem auditoria')
  ok('revogação imediata pelo painel: celular bloqueado e tentativa auditada')

  await browser.close()
  console.log(`\nFASES 4 e 5: ${step} verificações de ponta a ponta passaram`)
})().catch(async (e) => {
  console.error('FALHOU:', e.message)
  if (current) await current.screenshot({ path: `${SHOTS}/falha.png`, fullPage: true }).catch(() => {})
  process.exit(1)
})
