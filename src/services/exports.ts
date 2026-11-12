// Exportações de relatórios (somente administradores). Dados vêm das funções do banco.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import writeXlsxFile from 'write-excel-file/browser'
import type { MicroRow, SurveyResults } from '@/types/db'
import { interviewStatus, questionType } from '@/lib/labels'
import { fmtDate, fmtDateTime } from '@/lib/format'

type Cell = string | number | null
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
const stamp = () => new Date().toISOString().slice(0, 16).replace(/\D/g, '')
const pctBR = (v: number | null) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** CSV com ";" e BOM UTF-8: abre corretamente no Excel em português. */
function toCsv(rows: Cell[][]) {
  const esc = (v: Cell) => {
    const s = v == null ? '' : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')
}

function filtersText(r: SurveyResults) {
  const f = r.filters
  return [
    `Situações incluídas: ${f.statuses.map((s) => interviewStatus[s].label).join(', ')}`,
    f.municipality && `Município: ${f.municipality}`, f.neighborhood && `Bairro: ${f.neighborhood}`,
    (f.from || f.to) && `Período: ${f.from ? fmtDate(f.from) : 'início'} a ${f.to ? fmtDate(f.to) : 'hoje'}`,
  ].filter(Boolean).join(' · ')
}

export function frequencyRows(r: SurveyResults): Cell[][] {
  const rows: Cell[][] = [['Pergunta', 'Enunciado', 'Tipo', 'Alternativa', 'Código', 'Frequência absoluta', '% sobre respostas válidas', '% sobre entrevistas incluídas', 'Respostas válidas', 'Não resposta / não se aplica', 'Entrevistas incluídas']]
  for (const q of r.questions) {
    const base = [`P${q.position}`, q.text, questionType[q.type].label]
    const tail = [q.valid_responses, q.non_responses, q.base_interviews]
    if (q.options) for (const o of q.options) rows.push([...base, o.label, o.code, o.count, pctBR(o.pct_valid), pctBR(o.pct_base), ...tail])
    else if (q.numeric) rows.push([...base, `Média ${q.numeric.mean ?? '—'} · Mediana ${q.numeric.median ?? '—'} · Mín ${q.numeric.min ?? '—'} · Máx ${q.numeric.max ?? '—'}`, null, q.numeric.n, null, null, ...tail])
    else rows.push([...base, `${q.texts?.length ?? 0} resposta(s) em texto`, null, q.valid_responses, null, null, ...tail])
  }
  return rows
}

function microRows(micro: MicroRow[], r: SurveyResults): Cell[][] {
  const qs = r.questions.map((q) => `P${q.position}`)
  const head = ['Protocolo', 'Versão', 'Situação', 'Enviada em', 'Duração (s)', 'Entrevistador', 'Município', 'Bairro', 'Setor', 'GPS', 'Qualidade', ...qs]
  return [head, ...micro.map((m) => [m.protocolo, m.versao, interviewStatus[m.status].label, m.enviada_em, m.duracao_seg, m.entrevistador,
    m.municipio, m.bairro, m.setor, m.gps === 'granted' ? 'Sim' : 'Não', m.qualidade, ...qs.map((k) => m.respostas[k] ?? null)])]
}

export function exportCsv(r: SurveyResults) {
  const rows: Cell[][] = [[`OPINEX CAMPO — ${r.survey.code} — ${r.survey.name}`], [filtersText(r)], [`Entrevistas incluídas: ${r.interviews_included}`], [r.methodology_note], [], ...frequencyRows(r)]
  download(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `opinex-${slug(r.survey.code)}-frequencias-${stamp()}.csv`)
}

export function exportMicroCsv(r: SurveyResults, micro: MicroRow[]) {
  download(new Blob([toCsv(microRows(micro, r))], { type: 'text/csv;charset=utf-8' }), `opinex-${slug(r.survey.code)}-microdados-${stamp()}.csv`)
}

export async function exportXlsx(r: SurveyResults, micro: MicroRow[]) {
  const bold = (rows: Cell[][]) => rows.map((row, i) => row.map((v) => (i === 0 ? { value: v ?? '', fontWeight: 'bold' as const } : v)))
  const summary: Cell[][] = [
    ['OPINEX CAMPO — Relatório de apuração'], ['Pesquisa', `${r.survey.code} — ${r.survey.name}`],
    ['Local', [r.survey.municipality, r.survey.state].filter(Boolean).join('/') || '—'],
    ['Período da pesquisa', `${fmtDate(r.survey.start_date)} a ${fmtDate(r.survey.end_date)}`],
    ['Filtros', filtersText(r)], ['Entrevistas incluídas', r.interviews_included], ['Meta', r.survey.target_total],
    ['Nota metodológica', r.methodology_note], ['Gerado em', fmtDateTime(new Date().toISOString())],
  ]
  const dist = (title: string, list: { label: string; total: number }[]): Cell[][] => [[title, 'Entrevistas'], ...list.map((x) => [x.label, x.total])]
  const blob = await writeXlsxFile([
    { data: summary.map((r, i) => r.map((v, j) => (j === 0 || i === 0 ? { value: v ?? '', fontWeight: 'bold' as const } : v))), sheet: 'Resumo', columns: [{ width: 24 }, { width: 90 }] },
    { data: bold(frequencyRows(r)), sheet: 'Frequências', columns: [{ width: 8 }, { width: 50 }, { width: 18 }, { width: 36 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }] },
    { data: bold(dist('Município', r.by_municipality)), sheet: 'Por município', columns: [{ width: 40 }, { width: 12 }] },
    { data: bold(dist('Bairro', r.by_neighborhood)), sheet: 'Por bairro', columns: [{ width: 40 }, { width: 12 }] },
    { data: bold(dist('Entrevistador', r.by_interviewer)), sheet: 'Produtividade', columns: [{ width: 40 }, { width: 12 }] },
    { data: bold([['Dia', 'Entrevistas'], ...r.by_day.map((d) => [fmtDate(d.day), d.total])]), sheet: 'Por dia', columns: [{ width: 14 }, { width: 12 }] },
    { data: bold(microRows(micro, r)), sheet: 'Microdados' },
  ]).toBlob()
  download(blob, `opinex-${slug(r.survey.code)}-relatorio-${stamp()}.xlsx`)
}

export function exportPdf(r: SurveyResults) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const navy: [number, number, number] = [16, 29, 53], gold: [number, number, number] = [198, 166, 107]

  doc.setFillColor(...navy); doc.rect(0, 0, W, 34, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('OPIN', 14, 15); doc.setTextColor(...gold); doc.text('EX', 14 + doc.getTextWidth('OPIN'), 15)
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text('CAMPO • Inteligência na coleta. Precisão na informação.', 14, 21)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Relatório de apuração', 14, 29)

  doc.setTextColor(24, 38, 61); doc.setFontSize(14)
  const title = doc.splitTextToSize(`${r.survey.code} — ${r.survey.name}`, W - 28)
  doc.text(title, 14, 44)
  let y = 44 + title.length * 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(104, 115, 134)
  const meta = [
    `Local: ${[r.survey.municipality, r.survey.state].filter(Boolean).join('/') || '—'}   ·   Período da pesquisa: ${fmtDate(r.survey.start_date)} a ${fmtDate(r.survey.end_date)}`,
    `Entrevistas incluídas: ${r.interviews_included}   ·   Meta: ${r.survey.target_total}   ·   Amostra: ${r.survey.sampling_type === 'probabilistic' ? 'probabilística' : 'não probabilística'}${r.survey.sampling_method ? ` (${r.survey.sampling_method})` : ''}`,
    filtersText(r), `Gerado em ${fmtDateTime(new Date().toISOString())}`,
  ]
  for (const m of meta) { const l = doc.splitTextToSize(m, W - 28); doc.text(l, 14, y); y += l.length * 4.5 }
  doc.setFillColor(255, 248, 232); doc.setDrawColor(238, 223, 185)
  const note = doc.splitTextToSize(`Nota metodológica: ${r.methodology_note}`, W - 34)
  doc.roundedRect(14, y + 1, W - 28, note.length * 4.3 + 5, 2, 2, 'FD')
  doc.setTextColor(116, 91, 40); doc.text(note, 17, y + 6); y += note.length * 4.3 + 11

  for (const q of r.questions) {
    if (y > 250) { doc.addPage(); y = 18 }
    doc.setTextColor(24, 38, 61); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    const qt = doc.splitTextToSize(`P${q.position}. ${q.text}`, W - 28); doc.text(qt, 14, y); y += qt.length * 4.6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(104, 115, 134)
    doc.text(`${questionType[q.type].label} · Respostas válidas: ${q.valid_responses} · Não resposta/não se aplica: ${q.non_responses} · Entrevistas incluídas: ${q.base_interviews}`, 14, y); y += 2
    let body: Cell[][] = []
    let head: string[] = []
    if (q.options) { head = ['Alternativa', 'Freq.', '% válidas', '% incluídas']; body = q.options.map((o) => [o.label, o.count, pctBR(o.pct_valid), pctBR(o.pct_base)]) }
    else if (q.numeric) { head = ['N', 'Mínimo', 'Máximo', 'Média', 'Mediana']; const br = (v: number | null) => (v == null ? null : Number(v).toLocaleString('pt-BR'))
      body = [[q.numeric.n, br(q.numeric.min), br(q.numeric.max), br(q.numeric.mean), br(q.numeric.median)]] }
    else { head = [`Respostas em texto (${q.texts?.length ?? 0}${(q.texts?.length ?? 0) >= 300 ? '+' : ''}) — primeiras 15`]; body = (q.texts ?? []).slice(0, 15).map((t) => [t]) }
    if (!body.length) body = [['Sem respostas no filtro selecionado']]
    autoTable(doc, {
      startY: y + 1, head: [head], body: body.map((r) => r.map((v) => (v == null ? '—' : String(v)))), theme: 'grid', margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 1.6, textColor: [24, 38, 61], lineColor: [228, 232, 239] },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
      columnStyles: q.options ? { 1: { halign: 'right', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 22 }, 3: { halign: 'right', cellWidth: 24 } } : {},
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
    doc.text(`OPINEX CAMPO · ${r.survey.code} · Documento restrito ao administrador`, 14, 290)
    doc.text(`Página ${i} de ${pages}`, W - 14, 290, { align: 'right' })
  }
  doc.save(`opinex-${slug(r.survey.code)}-relatorio-${stamp()}.pdf`)
}
