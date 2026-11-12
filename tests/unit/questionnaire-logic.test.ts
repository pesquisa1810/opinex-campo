import { describe, expect, it } from 'vitest'
import { evaluate, payloadAnswers, validateAnswer } from '@/components/questionnaire/logic'
import type { Question } from '@/types/db'

const q = (p: Partial<Question> & Pick<Question, 'id' | 'position' | 'type'>): Question => ({
  text: p.id, help_text: null, required: true, min_value: null, max_value: null, max_choices: null, options: [], conditions: [], ...p,
})
const opts = (...l: string[]) => l.map((label, i) => ({ id: `o${i + 1}`, position: i + 1, label, code: i + 1, is_other: label === 'Outro' }))

const Q1 = q({ id: 'q1', position: 1, type: 'single_choice', options: opts('Sim', 'Não', 'Outro') })
const Q2 = q({ id: 'q2', position: 2, type: 'numeric', min_value: 0, max_value: 10,
  conditions: [{ depends_on_question_id: 'q1', operator: 'equals', option_id: 'o1', numeric_value: null }] })
const Q3 = q({ id: 'q3', position: 3, type: 'multiple_choice', max_choices: 2, options: opts('A', 'B', 'C') })
const Q4 = q({ id: 'q4', position: 4, type: 'open_text', required: false,
  conditions: [{ depends_on_question_id: 'q2', operator: 'greater_than', option_id: null, numeric_value: 8 }] })
const all = [Q3, Q1, Q4, Q2]

describe('lógica condicional', () => {
  it('oculta perguntas cujas condições não são atendidas', () => {
    expect(evaluate(all, {}).visible.map((x) => x.id)).toEqual(['q1', 'q3'])
    expect(evaluate(all, { q1: { option_ids: ['o2'] } }).visible.map((x) => x.id)).toEqual(['q1', 'q3'])
    expect(evaluate(all, { q1: { option_ids: ['o1'] } }).visible.map((x) => x.id)).toEqual(['q1', 'q2', 'q3'])
    expect(evaluate(all, { q1: { option_ids: ['o1'] }, q2: { numeric_value: 9 } }).visible.map((x) => x.id)).toEqual(['q1', 'q2', 'q3', 'q4'])
  })
  it('condição em cadeia: se a origem fica oculta, a dependente também some', () => {
    const r = evaluate(all, { q1: { option_ids: ['o2'] }, q2: { numeric_value: 9 } })
    expect(r.visible.map((x) => x.id)).not.toContain('q4')
  })
  it('payload envia apenas respostas de perguntas visíveis', () => {
    const p = payloadAnswers(all, { q1: { option_ids: ['o2'] }, q2: { numeric_value: 7 }, q3: { option_ids: ['o1'] } })
    expect(p.map((x) => x.question_id)).toEqual(['q1', 'q3'])
  })
})

describe('validação', () => {
  it('obrigatoriedade', () => {
    expect(validateAnswer(Q1, undefined)).toMatch(/obrigatória/)
    expect(validateAnswer(Q4, undefined)).toBeNull()
  })
  it('intervalo numérico', () => {
    expect(validateAnswer(Q2, { numeric_value: 11 })).toMatch(/máximo/)
    expect(validateAnswer(Q2, { numeric_value: 5 })).toBeNull()
  })
  it('limite da múltipla escolha', () => {
    expect(validateAnswer(Q3, { option_ids: ['o1', 'o2', 'o3'] })).toMatch(/no máximo 2/)
  })
  it('"Outro" exige especificação', () => {
    expect(validateAnswer(Q1, { option_ids: ['o3'] })).toMatch(/Outro/)
    expect(validateAnswer(Q1, { option_ids: ['o3'], other_text: 'Particular' })).toBeNull()
  })
})
