// Relatório PDF com gráficos vetoriais (nítidos na tela e na impressão).
// Os gráficos são desenhados diretamente com jsPDF: barras horizontais, colunas e setores.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ResultQuestion, SurveyResults } from '@/types/db'
import { interviewStatus, questionType } from '@/lib/labels'
import { fmtDate, fmtDateTime } from '@/lib/format'

export type PdfChart = 'barras' | 'colunas' | 'setores'
export interface PdfOptions {
  /** Tipo de gráfico por pergunta (posição → tipo). Perguntas sem escolha usam `defaultChart`. */
  charts: Record<number, PdfChart>
  defaultChart: PdfChart | 'tela'
  base: 'valid' | 'base'
  includeOverview: boolean
  includeTables: boolean
  includeTexts: boolean
}

type RGB = [number, number, number]
const NAVY: RGB = [16, 29, 53]
const NAVY2: RGB = [27, 49, 84]
const GOLD: RGB = [198, 166, 107]
const INK: RGB = [24, 38, 61]
const MUTED: RGB = [104, 115, 134]
const LINE: RGB = [228, 232, 239]
const TRACK: RGB = [237, 240, 244]
const PALETTE: RGB[] = [[16, 29, 53], [198, 166, 107], [62, 92, 138], [161, 125, 53], [126, 147, 181], [227, 211, 176], [38, 64, 107], [139, 107, 46], [185, 196, 214]]

const M = 14 // margem
const BOTTOM = 280 // limite útil antes do rodapé

const br = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d })
const pctTxt = (v: number | null | undefined) =>
  v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

class Report {
  doc = new jsPDF({ unit: 'mm', format: 'a4' })
  W = this.doc.internal.pageSize.getWidth()
  y = 0
  private r: SurveyResults
  constructor(r: SurveyResults) { this.r = r }

  get cw() { return this.W - 2 * M }

  fill(c: RGB) { this.doc.setFillColor(c[0], c[1], c[2]) }
  stroke(c: RGB) { this.doc.setDrawColor(c[0], c[1], c[2]) }
  color(c: RGB) { this.doc.setTextColor(c[0], c[1], c[2]) }
  font(size: number, style: 'normal' | 'bold' = 'normal', c: RGB = INK) {
    this.doc.setFont('helvetica', style); this.doc.setFontSize(size); this.color(c)
  }
  /** Quebra o texto em linhas que cabem na largura; corta com reticências após `maxLines`. */
  lines(text: string, width: number, maxLines = 99): string[] {
    const l = this.doc.splitTextToSize(text, width) as string[]
    if (l.length <= maxLines) return l
    const cut = l.slice(0, maxLines)
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S{0,3}$/, '') + '…'
    return cut
  }

  pageHeader() {
    this.fill(NAVY); this.doc.rect(0, 0, this.W, 11, 'F')
    this.font(8, 'bold', [255, 255, 255]); this.doc.text('OPIN', M, 7)
    this.color(GOLD); this.doc.text('EX', M + this.doc.getTextWidth('OPIN'), 7)
    this.font(7, 'normal', [220, 226, 236])
    this.doc.text(`${this.r.survey.code} — Relatório de apuração`, this.W - M, 7, { align: 'right' })
    this.y = 19
  }
  ensure(h: number) {
    if (this.y + h > BOTTOM) { this.doc.addPage(); this.pageHeader() }
  }
  section(title: string, subtitle?: string) {
    this.ensure(22)
    this.fill(GOLD); this.doc.rect(M, this.y - 4, 1.4, subtitle ? 10 : 6, 'F')
    this.font(13, 'bold'); this.doc.text(title, M + 4, this.y)
    if (subtitle) { this.font(8, 'normal', MUTED); this.doc.text(subtitle, M + 4, this.y + 5); this.y += 4 }
    this.y += 8
  }

  cover() {
    const { doc, r } = this
    this.fill(NAVY); doc.rect(0, 0, this.W, 62, 'F')
    this.fill(GOLD); doc.rect(0, 62, this.W, 1.2, 'F')
    // Marca: pino com barras
    this.stroke(GOLD); doc.setLineWidth(1.1)
    doc.circle(M + 9, 22, 7.5, 'S')
    doc.lines([[4.6, 6.8], [4.6, -6.8]], M + 4.4, 25.5, [1, 1], 'S')
    this.fill([255, 255, 255]); doc.rect(M + 6, 21, 1.6, 4, 'F'); doc.rect(M + 8.4, 18.8, 1.6, 6.2, 'F')
    this.fill(GOLD); doc.rect(M + 10.8, 16.8, 1.6, 8.2, 'F')
    this.font(22, 'bold', [255, 255, 255]); doc.text('OPIN', M + 22, 25)
    this.color(GOLD); doc.text('EX', M + 22 + doc.getTextWidth('OPIN'), 25)
    this.font(8, 'normal', [203, 212, 223]); doc.text('CAMPO  •  Inteligência na coleta. Precisão na informação.', M + 22, 31)
    this.font(9, 'bold', GOLD); doc.text('RELATÓRIO DE APURAÇÃO', M, 46)
    this.font(15, 'bold', [255, 255, 255])
    const t = this.lines(`${r.survey.code} — ${r.survey.name}`, this.cw, 2)
    doc.text(t, M, 53)
    this.y = 74

    // Cartões de indicadores
    const share = r.survey.target_total > 0 ? (r.interviews_included / r.survey.target_total) * 100 : null
    const cards: [string, string, string][] = [
      ['Entrevistas incluídas', br(r.interviews_included, 0), 'conforme filtros abaixo'],
      ['Meta da pesquisa', br(r.survey.target_total, 0), share == null ? 'sem meta definida' : `${pctTxt(share)} da meta`],
      ['Tipo de amostra', r.survey.sampling_type === 'probabilistic' ? 'Probabilística' : 'Não probabilística', r.survey.sampling_method ?? '—'],
      ['Período da pesquisa', fmtDate(r.survey.start_date), `até ${fmtDate(r.survey.end_date)}`],
    ]
    const gap = 4, w = (this.cw - gap * 3) / 4, h = 24
    cards.forEach(([k, v, hint], i) => {
      const x = M + i * (w + gap)
      this.fill([255, 255, 255]); this.stroke(i === 0 ? GOLD : LINE); doc.setLineWidth(0.3)
      doc.roundedRect(x, this.y, w, h, 2, 2, 'FD')
      this.font(7, 'normal', MUTED); doc.text(k, x + 3, this.y + 5.5)
      this.font(v.length > 12 ? 10 : 15, 'bold'); doc.text(this.lines(v, w - 6, 1), x + 3, this.y + 13.5)
      this.font(6.5, 'normal', MUTED); doc.text(this.lines(hint, w - 6, 1), x + 3, this.y + 19.5)
    })
    this.y += h + 8

    // Ficha técnica
    this.font(10, 'bold'); doc.text('Ficha técnica', M, this.y); this.y += 5
    const f = r.filters
    const rows: [string, string][] = [
      ['Local', [r.survey.municipality, r.survey.state].filter(Boolean).join('/') || '—'],
      ['Responsável', r.survey.responsible ?? '—'],
      ['Objetivo', r.survey.objective ?? '—'],
      ['Situações incluídas', f.statuses.map((s) => interviewStatus[s].label).join(', ')],
      ['Recorte geográfico', [f.municipality && `Município: ${f.municipality}`, f.neighborhood && `Bairro: ${f.neighborhood}`].filter(Boolean).join(' · ') || 'Todos os locais'],
      ['Recorte de período', f.from || f.to ? `${f.from ? fmtDate(f.from) : 'início'} a ${f.to ? fmtDate(f.to) : 'hoje'}` : 'Todo o período'],
      ['Gerado em', fmtDateTime(new Date().toISOString())],
    ]
    autoTable(doc, {
      startY: this.y, body: rows, theme: 'plain', margin: { left: M, right: M },
      styles: { fontSize: 8, cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 2 }, textColor: INK },
      columnStyles: { 0: { cellWidth: 40, textColor: MUTED }, 1: { fontStyle: 'bold' } },
    })
    this.y = this.lastY() + 6

    // Nota metodológica
    const note = this.lines(`Nota metodológica: ${r.methodology_note}`, this.cw - 8)
    const nh = note.length * 3.8 + 6
    this.fill([255, 248, 232]); this.stroke([238, 223, 185]); doc.setLineWidth(0.3)
    doc.roundedRect(M, this.y, this.cw, nh, 2, 2, 'FD')
    this.font(8, 'normal', [116, 91, 40]); doc.text(note, M + 4, this.y + 5)
    this.y += nh + 4
    this.font(7, 'normal', MUTED)
    doc.text(this.lines('Percentuais de múltipla escolha podem somar mais de 100%. Não resposta / não se aplica inclui perguntas opcionais em branco e perguntas ocultadas por condição.', this.cw), M, this.y)
    this.y += 8
  }

  lastY() { return (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY }

  // ------------------------------------------------------------- gráficos --
  /** Barras horizontais. `pct` define o comprimento; o texto mostra % e frequência. */
  hBars(items: { label: string; value: number; pct: number | null }[], opts: { labelW?: number; scaleMax?: number } = {}) {
    const { doc } = this
    const labelW = opts.labelW ?? 58, valueW = 26, barW = this.cw - labelW - valueW - 4
    const max = opts.scaleMax ?? 100
    for (const it of items) {
      this.font(8, 'normal')
      const l = this.lines(it.label, labelW - 2, 2)
      const rowH = Math.max(7, l.length * 3.6 + 3)
      this.ensure(rowH)
      const cy = this.y + rowH / 2
      this.font(8, 'normal'); doc.text(l, M, cy - (l.length - 1) * 1.8 + 1)
      this.fill(TRACK); doc.roundedRect(M + labelW, cy - 2, barW, 4, 1.5, 1.5, 'F')
      const w = Math.max(0, Math.min(1, (it.pct ?? 0) / max)) * barW
      if (w > 0.4) { this.fill(GOLD); doc.roundedRect(M + labelW, cy - 2, w, 4, 1.5, 1.5, 'F') }
      this.font(8, 'bold'); doc.text(it.pct == null ? '—' : pctTxt(it.pct), M + labelW + barW + 3, cy + 1)
      this.font(7, 'normal', MUTED); doc.text(`(${br(it.value, 0)})`, this.W - M, cy + 1, { align: 'right' })
      this.y += rowH
    }
    this.y += 2
  }

  /** Colunas verticais com valor no topo e rótulo embaixo. */
  columns(items: { label: string; value: number; display: string }[], opts: { height?: number; color?: RGB; maxLabels?: number } = {}) {
    const { doc } = this
    const H = opts.height ?? 52, labelH = 9
    this.ensure(H + labelH + 6)
    const x0 = M + 8, w = this.cw - 8, top = this.y + 4, base = top + H
    const max = Math.max(...items.map((i) => i.value), 1)
    // eixo e grades
    this.stroke(LINE); doc.setLineWidth(0.2)
    for (let k = 0; k <= 4; k++) {
      const gy = base - (H * k) / 4
      doc.line(x0, gy, x0 + w, gy)
      this.font(6, 'normal', MUTED); doc.text(br((max * k) / 4, 0), x0 - 1.5, gy + 1, { align: 'right' })
    }
    const n = items.length, slot = w / Math.max(n, 1), bw = Math.min(16, slot * 0.62)
    const every = Math.ceil(n / (opts.maxLabels ?? 12))
    items.forEach((it, i) => {
      const h = (it.value / max) * H
      const cx = x0 + slot * i + slot / 2
      this.fill(opts.color ?? GOLD); doc.rect(cx - bw / 2, base - h, bw, h, 'F')
      if (n <= 16) { this.font(6.5, 'bold'); doc.text(it.display, cx, base - h - 1.5, { align: 'center' }) }
      if (i % every === 0) {
        this.font(6, 'normal', MUTED)
        doc.text(this.lines(it.label, Math.max(slot * every - 1, 8), 2), cx, base + 3.5, { align: 'center' })
      }
    })
    this.y = base + labelH + 4
  }

  /** Setores (rosca) com legenda à direita. */
  pie(items: { label: string; value: number; pct: number | null }[]) {
    const { doc } = this
    const legendRows = items.length
    const R = 26, h = Math.max(2 * R + 8, legendRows * 6 + 6)
    this.ensure(h)
    const cx = M + R + 6, cy = this.y + h / 2
    const total = items.reduce((a, i) => a + i.value, 0)
    if (total === 0) {
      this.fill(TRACK); doc.circle(cx, cy, R, 'F')
    } else {
      let a0 = -Math.PI / 2
      items.forEach((it, i) => {
        const sweep = (it.value / total) * Math.PI * 2
        if (sweep <= 0) return
        this.fill(PALETTE[i % PALETTE.length])
        // Fatia como um único polígono (centro → arco → centro): sem emendas visíveis
        const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 90)))
        const pts: [number, number][] = [[cx, cy]]
        for (let s = 0; s <= steps; s++) {
          const t = a0 + (sweep * s) / steps
          pts.push([cx + R * Math.cos(t), cy + R * Math.sin(t)])
        }
        const segs = pts.slice(1).map((p, k) => [p[0] - pts[k][0], p[1] - pts[k][1]])
        doc.lines(segs, cx, cy, [1, 1], 'F', true)
        a0 += sweep
      })
    }
    this.fill([255, 255, 255]); doc.circle(cx, cy, R * 0.52, 'F')
    this.font(11, 'bold'); doc.text(br(total, 0), cx, cy + 1, { align: 'center' })
    this.font(6, 'normal', MUTED); doc.text('marcações', cx, cy + 4.5, { align: 'center' })
    // legenda
    const lx = cx + R + 12
    let ly = cy - (legendRows * 6) / 2 + 3
    items.forEach((it, i) => {
      this.fill(PALETTE[i % PALETTE.length]); doc.roundedRect(lx, ly - 2.6, 3.2, 3.2, 0.6, 0.6, 'F')
      this.font(8, 'normal'); doc.text(this.lines(it.label, this.W - M - lx - 34, 1), lx + 5, ly)
      this.font(8, 'bold'); doc.text(pctTxt(it.pct), this.W - M - 12, ly, { align: 'right' })
      this.font(7, 'normal', MUTED); doc.text(`(${br(it.value, 0)})`, this.W - M, ly, { align: 'right' })
      ly += 6
    })
    this.y += h + 2
  }

  // --------------------------------------------------------------- seções --
  overview() {
    const { r } = this
    this.doc.addPage(); this.pageHeader()
    this.section('Visão geral da coleta', 'Distribuição das entrevistas incluídas no relatório')
    if (r.by_day.length) {
      this.font(9, 'bold'); this.doc.text('Evolução diária das entrevistas', M, this.y); this.y += 2
      this.columns(r.by_day.map((d) => ({ label: fmtDate(d.day).slice(0, 5), value: d.total, display: br(d.total, 0) })), { color: NAVY2, maxLabels: 15 })
    }
    const block = (title: string, list: { label: string; total: number }[], limit = 12) => {
      if (!list.length) return
      this.ensure(14)
      this.font(9, 'bold'); this.doc.text(title, M, this.y); this.y += 4
      const total = list.reduce((a, x) => a + x.total, 0)
      const shown = list.slice(0, limit)
      this.hBars(shown.map((x) => ({ label: x.label, value: x.total, pct: total ? (x.total / total) * 100 : null })),
        { scaleMax: Math.max(...shown.map((x) => (total ? (x.total / total) * 100 : 0)), 1) })
      if (list.length > limit) { this.font(7, 'normal', MUTED); this.doc.text(`+ ${list.length - limit} outros`, M, this.y); this.y += 4 }
      this.y += 2
    }
    block('Entrevistas por município', r.by_municipality)
    block('Entrevistas por bairro', r.by_neighborhood)
    block('Produtividade por entrevistador', r.by_interviewer)
  }

  question(q: ResultQuestion, o: PdfOptions, chart: PdfChart) {
    const { doc } = this
    this.ensure(40)
    // Cabeçalho da pergunta (fonte definida ANTES de medir as linhas)
    this.font(10, 'bold')
    const title = this.lines(`P${q.position}. ${q.text}`, this.cw - 8)
    const hh = title.length * 4.6 + 9
    this.fill([247, 248, 250]); doc.roundedRect(M, this.y - 4, this.cw, hh, 1.5, 1.5, 'F')
    this.fill(GOLD); doc.rect(M, this.y - 4, 1.2, hh, 'F')
    this.font(10, 'bold'); doc.text(title, M + 4, this.y + 0.5)
    this.font(7, 'normal', MUTED)
    doc.text(`${questionType[q.type].label}  ·  Respostas válidas: ${br(q.valid_responses, 0)}  ·  Não resposta / não se aplica: ${br(q.non_responses, 0)}  ·  Entrevistas incluídas: ${br(q.base_interviews, 0)}`,
      M + 4, this.y + title.length * 4.6 + 1)
    this.y += hh + 2

    if (q.options) {
      const items = q.options.map((op) => ({ label: op.label, value: op.count, pct: o.base === 'valid' ? op.pct_valid : op.pct_base }))
      if (q.valid_responses === 0) {
        this.font(8, 'normal', MUTED); doc.text('Sem respostas no recorte selecionado.', M, this.y + 2); this.y += 8
      } else if (chart === 'setores' && q.type === 'single_choice') {
        this.pie(items)
      } else if (chart === 'colunas') {
        this.columns(items.map((i) => ({ label: i.label, value: i.pct ?? 0, display: pctTxt(i.pct) })))
      } else {
        this.hBars(items)
      }
      if (chart === 'setores' && q.type === 'multiple_choice') {
        this.font(6.5, 'normal', MUTED); doc.text('Múltipla escolha: exibida em barras (setores exigiriam percentuais que somam 100%).', M, this.y); this.y += 4
      }
      if (o.includeTables) {
        this.ensure(18)
        autoTable(doc, {
          startY: this.y, margin: { left: M, right: M }, theme: 'grid',
          head: [['Alternativa', 'Código', 'Freq. absoluta', `% ${o.base === 'valid' ? 'respostas válidas' : 'entrevistas incluídas'}`]],
          body: [...q.options.map((op) => [op.label, String(op.code), br(op.count, 0), pctTxt(o.base === 'valid' ? op.pct_valid : op.pct_base)]),
            [{ content: `Base (${o.base === 'valid' ? 'respostas válidas' : 'entrevistas incluídas'})`, styles: { fontStyle: 'bold' } }, '', { content: br(o.base === 'valid' ? q.valid_responses : q.base_interviews, 0), styles: { fontStyle: 'bold' } }, '']],
          styles: { fontSize: 7.5, cellPadding: 1.4, textColor: INK, lineColor: LINE },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'center', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 42 } },
        })
        this.y = this.lastY() + 3
      }
      if (o.includeTexts && q.others?.length) {
        this.ensure(10)
        this.font(7.5, 'bold'); doc.text(`Especificações de "Outro" (${q.others.length})`, M, this.y); this.y += 3.5
        this.font(7, 'normal', MUTED)
        for (const t of q.others.slice(0, 10)) { const l = this.lines(`• ${t}`, this.cw); this.ensure(l.length * 3.4); doc.text(l, M + 2, this.y); this.y += l.length * 3.4 }
      }
    } else if (q.numeric) {
      const s = q.numeric
      const stats: [string, string][] = [['Respostas', br(s.n, 0)], ['Mínimo', br(s.min, 2)], ['Máximo', br(s.max, 2)], ['Média', br(s.mean, 2)], ['Mediana', br(s.median, 2)]]
      this.ensure(18)
      const gap = 3, w = (this.cw - gap * 4) / 5
      stats.forEach(([k, v], i) => {
        const x = M + i * (w + gap)
        this.fill([237, 241, 246]); doc.roundedRect(x, this.y, w, 15, 1.5, 1.5, 'F')
        this.font(7, 'normal', MUTED); doc.text(k, x + 3, this.y + 5)
        this.font(13, 'bold'); doc.text(v, x + 3, this.y + 12)
      })
      this.y += 19
      if (s.min != null && s.max != null && s.mean != null && s.max > s.min) {
        // régua mín–máx com média e mediana
        this.ensure(14)
        const x0 = M + 10, x1 = this.W - M - 10, pos = (v: number) => x0 + ((v - s.min!) / (s.max! - s.min!)) * (x1 - x0)
        this.fill(TRACK); doc.roundedRect(x0, this.y + 2, x1 - x0, 3, 1.5, 1.5, 'F')
        this.fill(GOLD); doc.circle(pos(s.mean), this.y + 3.5, 2.2, 'F')
        if (s.median != null) { this.fill(NAVY); doc.circle(pos(s.median), this.y + 3.5, 1.4, 'F') }
        this.font(6.5, 'normal', MUTED)
        doc.text(br(s.min, 2), x0, this.y + 10, { align: 'center' }); doc.text(br(s.max, 2), x1, this.y + 10, { align: 'center' })
        const mx = (x0 + x1) / 2 - 14
        this.fill(GOLD); doc.circle(mx, this.y + 9.2, 1.3, 'F'); doc.text('média', mx + 2.5, this.y + 10)
        this.fill(NAVY); doc.circle(mx + 16, this.y + 9.2, 1, 'F'); doc.text('mediana', mx + 18.5, this.y + 10)
        this.y += 14
      }
    } else if (q.texts) {
      if (!o.includeTexts) { this.font(8, 'normal', MUTED); doc.text(`${br(q.texts.length, 0)} resposta(s) em texto (omitidas nesta versão do relatório).`, M, this.y + 2); this.y += 7 }
      else if (!q.texts.length) { this.font(8, 'normal', MUTED); doc.text('Sem respostas em texto no recorte selecionado.', M, this.y + 2); this.y += 7 }
      else {
        autoTable(doc, {
          startY: this.y, margin: { left: M, right: M }, theme: 'striped',
          head: [[`Respostas em texto — ${q.texts.length >= 300 ? '300+' : q.texts.length} (primeiras ${Math.min(20, q.texts.length)})`]],
          body: q.texts.slice(0, 20).map((t) => [`"${t}"`]),
          styles: { fontSize: 7.5, cellPadding: 1.4, textColor: INK },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
        })
        this.y = this.lastY() + 3
      }
    }
    this.y += 6
  }

  footers() {
    const n = this.doc.getNumberOfPages()
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i)
      this.stroke(LINE); this.doc.setLineWidth(0.2); this.doc.line(M, 287, this.W - M, 287)
      this.font(6.5, 'normal', [150, 150, 150])
      this.doc.text(`OPINEX CAMPO · ${this.r.survey.code} · Documento restrito ao administrador · Uso descritivo, sem inferência populacional automática`, M, 291)
      this.doc.text(`Página ${i} de ${n}`, this.W - M, 291, { align: 'right' })
    }
  }
}

/** Gera o relatório e retorna o documento (útil para testes) — `save` dispara o download. */
export function buildPdf(r: SurveyResults, o: PdfOptions) {
  const rep = new Report(r)
  rep.cover()
  if (o.includeOverview && r.interviews_included > 0) rep.overview()
  rep.doc.addPage(); rep.pageHeader()
  rep.section('Resultados por pergunta', `Percentuais sobre ${o.base === 'valid' ? 'as respostas válidas de cada pergunta' : 'o total de entrevistas incluídas'}`)
  if (r.interviews_included === 0) {
    rep.font(9, 'normal', MUTED); rep.doc.text('Nenhuma entrevista no recorte selecionado.', M, rep.y)
  } else {
    for (const q of r.questions) {
      const chosen = o.defaultChart === 'tela' ? (o.charts[q.position] ?? 'barras') : o.defaultChart
      rep.question(q, o, chosen)
    }
  }
  rep.footers()
  return rep.doc
}

export function exportPdfReport(r: SurveyResults, o: PdfOptions) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/\D/g, '')
  buildPdf(r, o).save(`opinex-${slug(r.survey.code)}-relatorio-${stamp}.pdf`)
}
