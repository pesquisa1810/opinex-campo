import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Question } from '@/types/db'
import { describeAnswer, evaluate, validateAnswer, type Answer, type Answers } from './logic'

interface Props {
  questions: Question[]
  /** Chamado na confirmação final. Se omitido, a revisão mostra apenas o resumo (modo pré-visualização). */
  onSubmit?: (answers: Answers) => Promise<void> | void
  submitting?: boolean
  initialAnswers?: Answers
  onChange?: (answers: Answers) => void
  submitLabel?: string
}

/** Aplica o questionário: uma pergunta por tela, condicionais, validação e revisão antes do envio. */
export default function QuestionnaireRunner({ questions, onSubmit, submitting, initialAnswers, onChange, submitLabel = 'Confirmar e enviar' }: Props) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers ?? {})
  const [index, setIndex] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { visible } = useMemo(() => evaluate(questions, answers), [questions, answers])
  const q = visible[Math.min(index, visible.length - 1)]

  function update(id: string, a: Answer) {
    const next = { ...answers, [id]: a }
    setAnswers(next); setError(null); onChange?.(next)
  }
  function next() {
    const err = validateAnswer(q, answers[q.id])
    if (err) return setError(err)
    if (index + 1 >= visible.length) setReviewing(true)
    else setIndex(index + 1)
    window.scrollTo({ top: 0 })
  }
  function back() { setError(null); if (index > 0) setIndex(index - 1) }

  if (!visible.length) return <p className="muted">Este questionário não tem perguntas.</p>

  if (reviewing) {
    const firstError = visible.find((v) => validateAnswer(v, answers[v.id]))
    return (
      <div>
        <div className="eyebrow">Revisão antes do envio</div>
        <h3 className="mt-1">Confira as respostas</h3>
        <ol className="space-y-2">
          {visible.map((v, i) => (
            <li key={v.id} className="rounded-lg border border-line bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold">{i + 1}. {v.text}</div>
                  <div className={cn('mt-1 text-sm', validateAnswer(v, answers[v.id]) ? 'text-alert' : 'text-ink')}>{describeAnswer(v, answers[v.id])}</div>
                </div>
                <button className="btn-soft btn-sm shrink-0" onClick={() => { setReviewing(false); setIndex(i) }} aria-label={`Editar pergunta ${i + 1}`}><Pencil className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ol>
        {firstError && <div className="notice notice-bad mt-3">Há respostas pendentes. Toque em editar para corrigir.</div>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn-soft" onClick={() => setReviewing(false)}><ArrowLeft className="h-4 w-4" />Voltar</button>
          {onSubmit ? (
            <button className="btn-primary" disabled={!!firstError || submitting} onClick={() => onSubmit(answers)}>
              <Check className="h-4 w-4" />{submitting ? 'Enviando…' : submitLabel}
            </button>
          ) : <div className="notice !my-0 text-center">Pré-visualização: nada é enviado.</div>}
        </div>
      </div>
    )
  }

  const a = answers[q.id] ?? {}
  const progress = Math.round((index / visible.length) * 100)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[1.5px] text-gold-deep">
        <span>Pergunta {index + 1} de {visible.length}</span><span>{progress}%</span>
      </div>
      <div className="track mb-4"><div className="fill transition-all" style={{ width: `${progress}%` }} /></div>

      <div className="panel !p-4">
        <div className="text-[15px] font-bold leading-snug">{index + 1}. {q.text}{q.required && q.type !== 'observation' && <span className="text-alert"> *</span>}</div>
        {q.help_text && <div className="mt-1 rounded-md bg-[#fff8e8] px-2 py-1 text-xs text-[#745b28]">{q.help_text}</div>}
        {q.type === 'multiple_choice' && <div className="k mt-1">Pode marcar mais de uma{q.max_choices ? ` (até ${q.max_choices})` : ''}.</div>}

        <div className="mt-3">
          {(q.type === 'single_choice' || q.type === 'multiple_choice') && q.options.map((o) => {
            const sel = (a.option_ids ?? []).includes(o.id)
            return (
              <div key={o.id}>
                <button type="button" aria-pressed={sel}
                  onClick={() => {
                    const ids = q.type === 'single_choice' ? (sel ? [] : [o.id])
                      : sel ? (a.option_ids ?? []).filter((x) => x !== o.id) : [...(a.option_ids ?? []), o.id]
                    update(q.id, { ...a, option_ids: ids })
                  }}
                  className={cn('my-[5px] flex w-full items-center gap-3 rounded-lg border bg-white p-3 text-left text-sm transition',
                    sel ? 'border-gold bg-[#fff9eb] font-semibold' : 'border-[#dce2eb] hover:border-gold/50')}>
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center border-2', q.type === 'single_choice' ? 'rounded-full' : 'rounded',
                    sel ? 'border-gold bg-gold text-white' : 'border-[#c5ceda]')}>{sel && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                  {o.label}
                </button>
                {o.is_other && sel && (
                  <input className="input mb-2" autoFocus placeholder="Especifique" value={a.other_text ?? ''} maxLength={300}
                    onChange={(e) => update(q.id, { ...a, other_text: e.target.value })} />
                )}
              </div>
            )
          })}
          {q.type === 'numeric' && (
            <input className="input text-lg" type="number" inputMode="decimal" min={q.min_value ?? undefined} max={q.max_value ?? undefined}
              placeholder={q.min_value != null || q.max_value != null ? `De ${q.min_value ?? '…'} a ${q.max_value ?? '…'}` : 'Digite um número'}
              value={a.numeric_value ?? ''} onChange={(e) => update(q.id, { numeric_value: e.target.value === '' ? null : Number(e.target.value) })} />
          )}
          {(q.type === 'open_text' || q.type === 'observation') && (
            <textarea className="input" rows={4} maxLength={2000} placeholder={q.type === 'observation' ? 'Observações do entrevistador' : 'Registre a resposta com as palavras do entrevistado'}
              value={a.text_value ?? ''} onChange={(e) => update(q.id, { text_value: e.target.value })} />
          )}
        </div>
        {error && <div className="mt-2 text-xs font-semibold text-alert" role="alert">{error}</div>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-soft" onClick={back} disabled={index === 0}><ArrowLeft className="h-4 w-4" />Voltar</button>
        <button className="btn-primary" onClick={next}>{index + 1 >= visible.length ? 'Revisar' : 'Avançar'}<ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
