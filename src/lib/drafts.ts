// Rascunhos de entrevistas no celular. Protegem contra quedas de conexão: a entrevista
// só é considerada ENVIADA quando o servidor confirma a gravação. O envio é idempotente
// (o id da sessão aberta no servidor é o id da entrevista), então reenviar nunca duplica.
import type { Answers } from '@/components/questionnaire/logic'
import type { GpsReading } from './geo'
import type { GpsPolicy, QuestionnaireSnapshot } from '@/types/db'

export interface Draft {
  session_id: string
  user_id: string
  survey: { id: string; code: string; name: string; municipality: string | null; state: string | null; gps_policy: GpsPolicy }
  started_at: string
  questionnaire: QuestionnaireSnapshot
  place: { municipality: string; neighborhood: string; sector: string }
  location?: GpsReading
  answers: Answers
  step: 'local' | 'questionario'
  saved_at: string
  last_error?: string
}

const KEY = (uid: string) => `opinex.drafts.v1.${uid}`
const MAX_AGE_MS = 7 * 24 * 3600 * 1000

function readAll(uid: string): Record<string, Draft> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY(uid)) ?? '{}') as Record<string, Draft>
    const now = Date.now()
    for (const [k, d] of Object.entries(all)) if (now - new Date(d.saved_at).getTime() > MAX_AGE_MS) delete all[k]
    return all
  } catch { return {} }
}
function writeAll(uid: string, all: Record<string, Draft>) {
  try { localStorage.setItem(KEY(uid), JSON.stringify(all)) } catch { /* armazenamento cheio/indisponível */ }
}

export const drafts = {
  list: (uid: string) => Object.values(readAll(uid)).sort((a, b) => b.saved_at.localeCompare(a.saved_at)),
  get: (uid: string, id: string) => readAll(uid)[id] as Draft | undefined,
  save: (d: Draft) => { const all = readAll(d.user_id); all[d.session_id] = { ...d, saved_at: new Date().toISOString() }; writeAll(d.user_id, all) },
  remove: (uid: string, id: string) => { const all = readAll(uid); delete all[id]; writeAll(uid, all) },
}
