import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, LocateFixed, MapPin, WifiOff } from 'lucide-react'
import QuestionnaireRunner from '@/components/questionnaire/QuestionnaireRunner'
import { payloadAnswers, type Answers } from '@/components/questionnaire/logic'
import { Field, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { drafts, type Draft } from '@/lib/drafts'
import { captureLocation, gpsLabel, type GpsReading } from '@/lib/geo'
import { getDevice } from '@/lib/device'
import { fmtDateTime } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import type { QuestionnaireSnapshot, GpsPolicy } from '@/types/db'

const SERVER_ERRORS: Record<string, string> = {
  DEVICE_REVOKED: 'Este celular teve a autorização revogada. Procure o administrador.',
  DEVICE_NOT_AUTHORIZED: 'Este celular não está autorizado. Leia o QR Code de autorização.',
  NOT_ASSIGNED: 'Você não está mais atribuído a esta pesquisa.',
  SURVEY_NOT_ACTIVE: 'A pesquisa não está liberada para coleta no momento.',
  INTERVIEWER_NOT_APPROVED: 'Seu cadastro não está aprovado para coleta.',
  NOT_AUTHENTICATED: 'Sua sessão expirou. Entre novamente para enviar.',
  NO_PUBLISHED_QUESTIONNAIRE: 'O questionário desta pesquisa ainda não foi publicado.',
}

/** /campo/entrevista/nova/:surveyId — valida no servidor e abre a sessão (horário de início do servidor). */
export function StartInterview() {
  const { surveyId } = useParams() as { surveyId: string }
  const { session } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !session) return
    started.current = true
    ;(async () => {
      if (!navigator.onLine) return setError('Sem conexão com a internet. A entrevista só pode ser iniciada online.')
      const d = getDevice()
      const { data, error } = await supabase.rpc('begin_interview', { _survey: surveyId, _device: d.device_id ?? null, _secret: d.device_secret ?? null })
      if (error) return setError('Falha de comunicação com o servidor. Tente novamente.')
      const r = data as { ok: boolean; error?: string; message?: string; session_id: string; started_at: string;
        survey: Draft['survey'] & { gps_policy: GpsPolicy }; questionnaire: QuestionnaireSnapshot }
      if (!r.ok) return setError(SERVER_ERRORS[r.error ?? ''] ?? r.message ?? 'Não foi possível iniciar a entrevista.')
      drafts.save({
        session_id: r.session_id, user_id: session.user.id, survey: r.survey, started_at: r.started_at, questionnaire: r.questionnaire,
        place: { municipality: r.survey.municipality ?? '', neighborhood: '', sector: '' }, answers: {}, step: 'local', saved_at: new Date().toISOString(),
      })
      navigate(`/campo/entrevista/${r.session_id}`, { replace: true })
    })()
  }, [surveyId, session, navigate])

  if (error) return <div className="space-y-3"><div className="notice notice-bad !text-sm">{error}</div><Link to="/campo" className="btn-soft w-full">Voltar</Link></div>
  return <Spinner label="Validando usuário, celular, atribuição e pesquisa…" />
}

/** /campo/entrevista/:sessionId — local + GPS, questionário, revisão e envio. */
export default function Interview() {
  const { sessionId } = useParams() as { sessionId: string }
  const { session } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const uid = session?.user.id ?? ''
  const [draft, setDraft] = useState<Draft | undefined>(() => (uid ? drafts.get(uid, sessionId) : undefined))
  const [gpsBusy, setGpsBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ id: string; at: string; duplicate: boolean } | null>(null)
  const [placeErr, setPlaceErr] = useState<string | null>(null)
  const autoGps = useRef(false)

  function update(patch: Partial<Draft>) {
    setDraft((d) => { if (!d) return d; const n = { ...d, ...patch }; drafts.save(n); return n })
  }
  async function gps() {
    setGpsBusy(true)
    const reading: GpsReading = await captureLocation()
    setGpsBusy(false)
    update({ location: reading })
  }
  useEffect(() => { if (draft && !draft.location && !autoGps.current) { autoGps.current = true; gps() } })

  if (sent) {
    return (
      <div className="panel flex flex-col items-center py-8 text-center">
        <CheckCircle2 className="h-14 w-14 text-ok" />
        <div className="mt-3 text-lg font-extrabold tracking-wide text-ok">ENVIADA</div>
        <p className="muted mt-1 text-sm">Gravação confirmada pelo servidor em {fmtDateTime(sent.at)}.</p>
        {sent.duplicate && <p className="k mt-1">Esta entrevista já havia sido recebida; nenhuma duplicata foi criada.</p>}
        <p className="k mt-1 font-mono">Protocolo {sent.id.slice(0, 8).toUpperCase()}</p>
        <div className="mt-5 grid w-full gap-2">
          {draft && <button className="btn-primary" onClick={() => navigate(`/campo/entrevista/nova/${draft.survey.id}`)}>Nova entrevista nesta pesquisa</button>}
          <Link to="/campo" className="btn-soft">Voltar ao início</Link>
        </div>
      </div>
    )
  }
  if (!draft) return <div className="space-y-3"><div className="notice notice-bad">Entrevista não encontrada neste celular.</div><Link to="/campo" className="btn-soft w-full">Voltar</Link></div>

  const required = draft.survey.gps_policy === 'required'
  const loc = draft.location

  async function submit(answers: Answers) {
    if (!draft) return
    setSendError(null)
    if (!navigator.onLine) {
      const msg = 'Sem conexão: a entrevista NÃO foi enviada. Ela ficou guardada neste celular; envie quando a internet voltar.'
      update({ answers, last_error: msg }); return setSendError(msg)
    }
    setSending(true)
    const d = getDevice()
    const { data, error } = await supabase.rpc('submit_interview', { _payload: {
      session_id: draft.session_id, device_id: d.device_id, device_secret: d.device_secret,
      municipality: draft.place.municipality, neighborhood: draft.place.neighborhood, sector: draft.place.sector,
      location: draft.location ?? { permission: 'unavailable' },
      answers: payloadAnswers(draft.questionnaire.questions, answers),
    } })
    setSending(false)
    if (error) {
      const msg = 'Falha de comunicação: a entrevista NÃO foi enviada. Ela ficou guardada neste celular; tente novamente.'
      update({ answers, last_error: msg }); return setSendError(msg)
    }
    const r = data as { ok: boolean; error?: string; message?: string; interview_id: string; submitted_at: string; duplicate: boolean }
    if (!r.ok) {
      const msg = SERVER_ERRORS[r.error ?? ''] ?? r.message ?? 'O servidor recusou o envio.'
      update({ answers, last_error: msg }); return setSendError(msg)
    }
    drafts.remove(uid, draft.session_id)
    qc.invalidateQueries({ queryKey: ['field-home'] })
    setSent({ id: r.interview_id, at: r.submitted_at, duplicate: r.duplicate })
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="min-w-0"><div className="eyebrow">{draft.survey.code}</div><div className="truncate font-bold">{draft.survey.name}</div></div>
        <span className="k shrink-0">Início {fmtDateTime(draft.started_at)}</span>
      </div>

      {draft.step === 'local' ? (
        <div className="panel space-y-3">
          <div className="eyebrow">Etapa 1 · Local da entrevista</div>
          <Field label="Município *"><input className="input" value={draft.place.municipality} onChange={(e) => update({ place: { ...draft.place, municipality: e.target.value } })} /></Field>
          <Field label="Bairro *"><input className="input" value={draft.place.neighborhood} onChange={(e) => update({ place: { ...draft.place, neighborhood: e.target.value } })} /></Field>
          <Field label="Setor ou região"><input className="input" value={draft.place.sector} onChange={(e) => update({ place: { ...draft.place, sector: e.target.value } })} /></Field>

          <div className="rounded-lg border border-line bg-[#fafbfd] p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold"><MapPin className="h-4 w-4 text-gold-deep" />GPS {required ? '(exigido)' : '(opcional)'}</span>
              <button className="btn-soft btn-sm" onClick={gps} disabled={gpsBusy}>{gpsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}{loc ? 'Capturar novamente' : 'Registrar localização'}</button>
            </div>
            {gpsBusy ? <p className="k mt-2">Obtendo localização…</p> : loc && (
              <p className={loc.permission === 'granted' ? 'mt-2 text-ok' : 'mt-2 text-alert'}>
                {gpsLabel[loc.permission]}{loc.permission === 'granted' && ` (precisão aproximada de ${loc.accuracy} m)`}.
                {loc.permission !== 'granted' && (required
                  ? ' Esta pesquisa EXIGE localização: sem ela a entrevista não poderá ser enviada. Libere a localização nas configurações do navegador e tente novamente.'
                  : ' A entrevista poderá ser enviada, mas ficará marcada como "sem GPS" para análise do administrador.')}
              </p>
            )}
            <p className="k mt-2">A localização é capturada somente agora, uma única vez. Não há rastreamento contínuo.</p>
          </div>
          {placeErr && <div className="text-xs font-semibold text-alert">{placeErr}</div>}
          <button className="btn-primary w-full" onClick={() => {
            if (draft.place.municipality.trim().length < 2 || draft.place.neighborhood.trim().length < 2) return setPlaceErr('Informe município e bairro.')
            if (required && loc?.permission !== 'granted') return setPlaceErr('Esta pesquisa exige a localização do GPS.')
            setPlaceErr(null); update({ step: 'questionario' }); window.scrollTo({ top: 0 })
          }}>Iniciar questionário</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg bg-soft px-3 py-2 text-xs">
            <span className="truncate">{draft.place.neighborhood} · {draft.place.municipality}</span>
            <button className="btn-link shrink-0" onClick={() => update({ step: 'local' })}>Alterar local</button>
          </div>
          <QuestionnaireRunner questions={draft.questionnaire.questions} initialAnswers={draft.answers}
            onChange={(answers) => update({ answers })} onSubmit={submit} submitting={sending} />
          {sendError && (
            <div className="notice notice-bad flex gap-2 !text-sm"><WifiOff className="h-5 w-5 shrink-0" /><span>{sendError}</span></div>
          )}
        </>
      )}
    </div>
  )
}
