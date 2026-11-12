// Regras do questionário no cliente. ESPELHAM as regras do servidor (submit_interview);
// o servidor sempre revalida — esta camada existe para orientar o entrevistador.
import type { QCondition, Question } from '@/types/db'

export interface Answer {
  option_ids?: string[]
  text_value?: string
  numeric_value?: number | null
  other_text?: string
}
export type Answers = Record<string, Answer>

export function isAnswered(q: Question, a?: Answer): boolean {
  if (!a) return false
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice': return (a.option_ids?.length ?? 0) > 0
    case 'numeric': return typeof a.numeric_value === 'number' && Number.isFinite(a.numeric_value)
    default: return !!a.text_value?.trim()
  }
}

export function conditionMet(c: QCondition, valid: Answers): boolean {
  const a = valid[c.depends_on_question_id]
  if (!a) return false
  const hasOpt = !!c.option_id && (a.option_ids ?? []).includes(c.option_id)
  switch (c.operator) {
    case 'equals':
    case 'includes': return hasOpt
    case 'not_equals': return !hasOpt
    case 'greater_than': return a.numeric_value != null && c.numeric_value != null && a.numeric_value > c.numeric_value
    case 'less_than': return a.numeric_value != null && c.numeric_value != null && a.numeric_value < c.numeric_value
    case 'answered': return true
  }
}

/** Percorre as perguntas em ordem e devolve as visíveis + respostas válidas (só de visíveis respondidas). */
export function evaluate(questions: Question[], answers: Answers) {
  const ordered = [...questions].sort((a, b) => a.position - b.position)
  const valid: Answers = {}
  const visible: Question[] = []
  for (const q of ordered) {
    if (!q.conditions.every((c) => conditionMet(c, valid))) continue
    visible.push(q)
    const a = answers[q.id]
    if (isAnswered(q, a)) valid[q.id] = a!
  }
  return { visible, valid }
}

export function validateAnswer(q: Question, a?: Answer): string | null {
  if (!isAnswered(q, a)) return q.required && q.type !== 'observation' ? 'Resposta obrigatória.' : null
  if (q.type === 'single_choice' && a!.option_ids!.length !== 1) return 'Escolha apenas uma alternativa.'
  if (q.type === 'multiple_choice') {
    const max = q.max_choices ?? q.options.length
    if (a!.option_ids!.length > max) return `Marque no máximo ${max} alternativa(s).`
  }
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const other = q.options.find((o) => o.is_other)
    if (other && a!.option_ids!.includes(other.id) && !a!.other_text?.trim()) return 'Especifique a opção "Outro".'
  }
  if (q.type === 'numeric') {
    const v = a!.numeric_value!
    if (q.min_value != null && v < q.min_value) return `O valor mínimo é ${q.min_value}.`
    if (q.max_value != null && v > q.max_value) return `O valor máximo é ${q.max_value}.`
  }
  return null
}

/** Monta as respostas a enviar: apenas perguntas visíveis e respondidas. */
export function payloadAnswers(questions: Question[], answers: Answers) {
  const { visible, valid } = evaluate(questions, answers)
  return visible.filter((q) => valid[q.id]).map((q) => {
    const a = valid[q.id]
    const other = q.options.find((o) => o.is_other)
    return {
      question_id: q.id,
      option_ids: a.option_ids ?? [],
      text_value: a.text_value?.trim() || null,
      numeric_value: a.numeric_value ?? null,
      other_text: other && a.option_ids?.includes(other.id) ? a.other_text?.trim() || null : null,
    }
  })
}

export function describeAnswer(q: Question, a?: Answer): string {
  if (!isAnswered(q, a)) return '—'
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    return q.options.filter((o) => a!.option_ids!.includes(o.id))
      .map((o) => (o.is_other && a!.other_text ? `${o.label}: ${a!.other_text}` : o.label)).join('; ')
  }
  if (q.type === 'numeric') return String(a!.numeric_value).replace('.', ',')
  return a!.text_value!.trim()
}
