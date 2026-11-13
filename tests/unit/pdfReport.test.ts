import { describe, expect, it } from 'vitest'
import { buildPdf, type PdfOptions } from '@/services/pdfReport'
import type { SurveyResults } from '@/types/db'

const opts = (o: Partial<PdfOptions> = {}): PdfOptions => ({
  charts: {}, defaultChart: 'tela', base: 'valid', includeOverview: true, includeTables: true, includeTexts: true, ...o,
})
const labels = ['Ótimo', 'Bom', 'Regular', 'Ruim', 'Péssimo', 'Não sabe', 'Não respondeu', 'Outro (especifique)']
const results = (n = 40): SurveyResults => ({
  survey: { id: 's', code: 'TESTE-01', name: 'Pesquisa de avaliação da gestão municipal com título bem longo para quebrar linha', sampling_type: 'non_probabilistic',
    sampling_method: 'Cotas', target_total: 400, municipality: 'São José dos Campos', state: 'SP', start_date: '2026-11-01', end_date: '2026-12-01', responsible: 'Equipe', objective: 'Avaliar serviços' },
  interviews_included: n,
  filters: { statuses: ['approved', 'received'], municipality: null, neighborhood: null, from: null, to: null },
  questions: [
    { position: 1, text: 'Como avalia a gestão?', type: 'single_choice', base_interviews: n, valid_responses: n, non_responses: 0,
      options: labels.map((label, i) => ({ label, code: i + 1, count: 5, pct_valid: 12.5, pct_base: 12.5 })), others: ['Particular'], numeric: null, texts: null },
    { position: 2, text: 'Quais serviços usa? (pergunta com enunciado extenso para testar a quebra automática de linhas no cabeçalho da pergunta)', type: 'multiple_choice',
      base_interviews: n, valid_responses: n - 2, non_responses: 2,
      options: labels.slice(0, 5).map((label, i) => ({ label, code: i + 1, count: 10 + i, pct_valid: 30, pct_base: 28 })), others: [], numeric: null, texts: null },
    { position: 3, text: 'Nota geral', type: 'numeric', base_interviews: n, valid_responses: n, non_responses: 0, options: null, others: null,
      numeric: { n, min: 0, max: 10, mean: 6.4, median: 7 }, texts: null },
    { position: 4, text: 'Sugestões', type: 'open_text', base_interviews: n, valid_responses: 12, non_responses: 28, options: null, others: null, numeric: null,
      texts: Array.from({ length: 12 }, (_, i) => `Sugestão número ${i + 1} com acentuação: iluminação, praças e ônibus.`) },
    { position: 5, text: 'Sem respostas', type: 'single_choice', base_interviews: n, valid_responses: 0, non_responses: n,
      options: [{ label: 'Sim', code: 1, count: 0, pct_valid: null, pct_base: 0 }, { label: 'Não', code: 2, count: 0, pct_valid: null, pct_base: 0 }], others: [], numeric: null, texts: null },
  ],
  by_municipality: [{ label: 'São José dos Campos', total: n }],
  by_neighborhood: Array.from({ length: 18 }, (_, i) => ({ label: `Bairro ${i + 1} (São José dos Campos)`, total: 18 - i })),
  by_day: Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, total: (i % 7) + 1 })),
  by_interviewer: [{ label: 'Entrevistador A', total: 25 }, { label: 'Entrevistador B', total: 15 }],
  methodology_note: 'Amostra não probabilística: os percentuais descrevem apenas as pessoas entrevistadas.',
})

describe('relatório PDF com gráficos', () => {
  for (const chart of ['tela', 'barras', 'colunas', 'setores'] as const) {
    it(`gera sem erros com gráficos "${chart}"`, () => {
      const doc = buildPdf(results(), opts({ defaultChart: chart, charts: { 1: 'setores', 2: 'colunas' } }))
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3)
      expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(20000)
    })
  }
  it('respeita as opções (sem visão geral, tabelas e textos gera menos páginas)', () => {
    const full = buildPdf(results(), opts()).getNumberOfPages()
    const lean = buildPdf(results(), opts({ includeOverview: false, includeTables: false, includeTexts: false })).getNumberOfPages()
    expect(lean).toBeLessThan(full)
  })
  it('funciona sem entrevistas no recorte', () => {
    const doc = buildPdf({ ...results(0), questions: [], by_day: [], by_municipality: [], by_neighborhood: [], by_interviewer: [] }, opts())
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })
})
