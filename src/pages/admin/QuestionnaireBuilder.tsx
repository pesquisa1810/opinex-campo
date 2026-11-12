import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, GitBranch, Lock, Pencil, Plus, Rocket, Trash2, X } from 'lucide-react'
import { Empty, Field, Modal, Notice, PageHeader, Panel, Pill, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import QuestionnaireRunner from '@/components/questionnaire/QuestionnaireRunner'
import { supabase } from '@/lib/supabase'
import { conditionOperator, questionType } from '@/lib/labels'
import { cn } from '@/lib/cn'
import type { ConditionOperator, QCondition, Question, QuestionType, QuestionnaireVersion, Survey } from '@/types/db'

const MAX_Q = 30
const MAX_O = 8

type Row = Omit<Question, 'options' | 'conditions'> & {
  question_options: Question['options']
  question_conditions: QCondition[]
}

async function loadQuestions(versionId: string): Promise<Question[]> {
  const { data, error } = await supabase.from('questions')
    .select('id, position, type, text, help_text, required, min_value, max_value, max_choices, question_options(id, position, label, code, is_other), question_conditions!question_conditions_question_id_fkey(depends_on_question_id, operator, option_id, numeric_value)')
    .eq('version_id', versionId).order('position')
  if (error) throw error
  return (data as unknown as Row[]).map(({ question_options, question_conditions, ...q }) => ({
    ...q, options: [...question_options].sort((a, b) => a.position - b.position), conditions: question_conditions,
  }))
}

export default function QuestionnaireBuilder() {
  const { id } = useParams() as { id: string }
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Question | 'new' | 'new-conditional' | null>(null)
  const [preview, setPreview] = useState(false)
  const [publishErrors, setPublishErrors] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const survey = useQuery({
    queryKey: ['survey', id],
    queryFn: async () => { const { data, error } = await supabase.from('surveys').select('*').eq('id', id).single(); if (error) throw error; return data as Survey },
  })
  const versions = useQuery({
    queryKey: ['versions', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('questionnaire_versions').select('id, survey_id, version, status, published_at, created_at').eq('survey_id', id).order('version', { ascending: false })
      if (error) throw error
      return data as QuestionnaireVersion[]
    },
  })
  const chosen = params.get('versao')
  const version = useMemo(() => {
    const v = versions.data ?? []
    return v.find((x) => x.id === chosen) ?? v.find((x) => x.status === 'draft') ?? v.find((x) => x.status === 'published') ?? v[0]
  }, [versions.data, chosen])
  const questions = useQuery({ queryKey: ['questions', version?.id], enabled: !!version, queryFn: () => loadQuestions(version!.id) })
  const editable = version?.status === 'draft'
  const list = questions.data ?? []

  const refresh = () => { qc.invalidateQueries({ queryKey: ['questions', version?.id] }); qc.invalidateQueries({ queryKey: ['surveys'] }) }

  async function openDraft() {
    setBusy(true)
    const { error } = await supabase.rpc('admin_open_draft_version', { _survey: id })
    setBusy(false)
    if (error) return toast.error(error)
    setParams({}); await qc.invalidateQueries({ queryKey: ['versions', id] })
    toast.ok('Versão em rascunho pronta para edição.')
  }
  async function move(q: Question, dir: -1 | 1) {
    const ids = list.map((x) => x.id)
    const i = ids.indexOf(q.id); const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const { error } = await supabase.rpc('admin_reorder_questions', { _version: version!.id, _ids: ids })
    if (error) return toast.error(error)
    refresh()
  }
  async function del(q: Question) {
    const deps = list.filter((x) => x.conditions.some((c) => c.depends_on_question_id === q.id))
    const warn = deps.length ? `\n\nAtenção: ${deps.length} pergunta(s) condicional(is) dependem desta e perderão a condição.` : ''
    if (!window.confirm(`Excluir a pergunta ${q.position}?${warn}`)) return
    const { error } = await supabase.rpc('admin_delete_question', { _question: q.id })
    if (error) return toast.error(error)
    toast.ok('Pergunta excluída.'); refresh()
  }
  async function dup(q: Question) {
    if (list.length >= MAX_Q) return toast.error('QUESTION_LIMIT')
    const { error } = await supabase.rpc('admin_duplicate_question', { _question: q.id })
    if (error) return toast.error(error)
    toast.ok('Pergunta duplicada.'); refresh()
  }
  async function publish() {
    if (!window.confirm('Publicar esta versão? Depois de publicada ela não poderá mais ser alterada; entrevistadores atribuídos passarão a usá-la.')) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_publish_version', { _version: version!.id })
    setBusy(false)
    if (error) return toast.error(error)
    const r = data as { ok: boolean; errors?: string[]; version?: number }
    if (!r.ok) return setPublishErrors(r.errors ?? [])
    toast.ok(`Versão ${r.version} publicada.`)
    setParams({}); qc.invalidateQueries({ queryKey: ['versions', id] }); qc.invalidateQueries({ queryKey: ['surveys'] })
  }

  if (survey.isLoading || versions.isLoading) return <Spinner />
  const s = survey.data

  return (
    <>
      <PageHeader eyebrow={`Questionário · ${s?.code ?? ''}`} title={s?.name ?? 'Questionário'}
        description={version ? <span className="flex flex-wrap items-center gap-2">Versão {version.version}
          <Pill tone={version.status === 'draft' ? 'wait' : version.status === 'published' ? 'ok' : 'off'}>{{ draft: 'Rascunho editável', published: 'Publicada', superseded: 'Substituída' }[version.status]}</Pill>
          <span>· {list.length}/{MAX_Q} perguntas</span></span> : 'Nenhum questionário criado ainda.'}
        actions={<>
          <Link className="btn-soft" to={`/admin/pesquisas/${id}`}><ArrowLeft className="h-4 w-4" />Pesquisa</Link>
          {list.length > 0 && <button className="btn-soft" onClick={() => setPreview(true)}><Eye className="h-4 w-4" />Visualizar</button>}
          {editable && <button className="btn-gold" disabled={busy || !list.length} onClick={publish}><Rocket className="h-4 w-4" />Publicar versão</button>}
          {version && !editable && !versions.data?.some((v) => v.status === 'draft') &&
            <button className="btn-primary" disabled={busy} onClick={openDraft}><Pencil className="h-4 w-4" />Criar nova versão para editar</button>}
          {version && !editable && versions.data?.some((v) => v.status === 'draft') &&
            <button className="btn-primary" onClick={() => setParams({})}><Pencil className="h-4 w-4" />Ir para o rascunho</button>}
        </>} />

      {!version ? (
        <Panel><Empty title="Este questionário ainda não existe">
          <button className="btn-gold mt-3" disabled={busy} onClick={openDraft}><Plus className="h-4 w-4" />Criar questionário</button>
        </Empty></Panel>
      ) : (
        <>
          {!editable && <Notice><Lock className="mr-1 inline h-3.5 w-3.5" />Versão {version.status === 'published' ? 'publicada' : 'substituída'}: somente leitura. Para alterar, crie uma nova versão — as entrevistas já realizadas continuam vinculadas a esta.</Notice>}
          {questions.isLoading ? <Spinner /> : questions.error ? <Notice tone="bad">Erro ao carregar as perguntas.</Notice> : !list.length ? (
            <Panel><Empty title="Nenhuma pergunta ainda">Adicione até {MAX_Q} perguntas com até {MAX_O} alternativas cada.</Empty></Panel>
          ) : (
            <div className="space-y-2.5">
              {list.map((q, i) => (
                <QuestionCard key={q.id} q={q} all={list} editable={editable}
                  onEdit={() => setEditing(q)} onDup={() => dup(q)} onDel={() => del(q)}
                  onUp={i > 0 ? () => move(q, -1) : undefined} onDown={i < list.length - 1 ? () => move(q, 1) : undefined} />
              ))}
            </div>
          )}
          {editable && (
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={list.length >= MAX_Q} onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Adicionar pergunta</button>
              <button className="btn-soft" disabled={list.length >= MAX_Q || !list.length} onClick={() => setEditing('new-conditional')}><GitBranch className="h-4 w-4" />Pergunta condicional</button>
              {list.length >= MAX_Q && <span className="k self-center">Limite de {MAX_Q} perguntas atingido.</span>}
            </div>
          )}
        </>
      )}

      {editing && version && (
        <QuestionEditor key={typeof editing === 'string' ? editing : editing.id} versionId={version.id} all={list}
          initial={typeof editing === 'string' ? null : editing} conditional={editing === 'new-conditional'}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}

      <Modal open={preview} onClose={() => setPreview(false)} title="Pré-visualização do entrevistador">
        <div className="mx-auto max-w-[370px] rounded-[25px] bg-navy p-3">
          <div className="overflow-hidden rounded-2xl bg-[#f7f8fa]">
            <div className="bg-navy p-5 text-white"><strong className="text-xl tracking-[1px]">OPINEX CAMPO</strong>
              <div className="mt-1 text-[11px] text-[#d8c18a]">PESQUISA • COLETA PRESENCIAL</div></div>
            <div className="p-4"><QuestionnaireRunner key={String(preview)} questions={list} /></div>
          </div>
        </div>
      </Modal>

      <Modal open={!!publishErrors} onClose={() => setPublishErrors(null)} title="Corrija antes de publicar">
        <ul className="list-disc space-y-1 pl-5 text-sm">{publishErrors?.map((e) => <li key={e}>{e}</li>)}</ul>
      </Modal>
    </>
  )
}

function conditionText(c: QCondition, all: Question[]) {
  const dep = all.find((x) => x.id === c.depends_on_question_id)
  const opt = dep?.options.find((o) => o.id === c.option_id)
  const val = c.operator === 'greater_than' || c.operator === 'less_than' ? ` ${c.numeric_value}` : opt ? ` "${opt.label}"` : ''
  return `P${dep?.position ?? '?'} ${conditionOperator[c.operator]}${val}`
}

function QuestionCard({ q, all, editable, onEdit, onDup, onDel, onUp, onDown }: {
  q: Question; all: Question[]; editable: boolean; onEdit: () => void; onDup: () => void; onDel: () => void; onUp?: () => void; onDown?: () => void
}) {
  return (
    <div className="panel">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy text-sm font-bold text-gold">{q.position}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone="info">{questionType[q.type].label}</Pill>
            {q.conditions.length > 0 && <Pill tone="wait"><GitBranch className="h-3 w-3" />Condicional</Pill>}
            {q.required && q.type !== 'observation' ? <Pill tone="off">Obrigatória</Pill> : <Pill tone="off">Opcional</Pill>}
          </div>
          <div className="mt-1.5 font-semibold">{q.text}</div>
          {q.help_text && <div className="k mt-0.5">Instrução: {q.help_text}</div>}
          {q.options.length > 0 && (
            <ol className="mt-2 grid gap-1 sm:grid-cols-2">
              {q.options.map((o) => <li key={o.id} className="k"><span className="font-mono text-[10px]">[{o.code}]</span> {o.label}{o.is_other && ' (especificar)'}</li>)}
            </ol>
          )}
          {q.type === 'numeric' && <div className="k mt-1">Intervalo: {q.min_value ?? 'sem mínimo'} a {q.max_value ?? 'sem máximo'}</div>}
          {q.type === 'multiple_choice' && q.max_choices && <div className="k mt-1">Até {q.max_choices} alternativas</div>}
          {q.conditions.length > 0 && <div className="mt-2 text-xs text-[#8a641a]">Exibir somente se: {q.conditions.map((c) => conditionText(c, all)).join(' E ')}</div>}
        </div>
        {editable && (
          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
            <button className="btn-soft btn-sm" onClick={onUp} disabled={!onUp} aria-label="Mover para cima"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button className="btn-soft btn-sm" onClick={onDown} disabled={!onDown} aria-label="Mover para baixo"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button className="btn-soft btn-sm" onClick={onEdit} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></button>
            <button className="btn-soft btn-sm" onClick={onDup} aria-label="Duplicar"><Copy className="h-3.5 w-3.5" /></button>
            <button className="btn-soft btn-sm" onClick={onDel} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  )
}

type DraftOption = { id?: string; label: string; is_other: boolean }
type DraftCond = { depends_on_question_id: string; operator: ConditionOperator; option_id: string; numeric_value: string }

function QuestionEditor({ versionId, all, initial, conditional, onClose, onSaved }: {
  versionId: string; all: Question[]; initial: Question | null; conditional: boolean; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'single_choice')
  const [text, setText] = useState(initial?.text ?? '')
  const [help, setHelp] = useState(initial?.help_text ?? '')
  const [required, setRequired] = useState(initial?.required ?? true)
  const [minV, setMinV] = useState(initial?.min_value?.toString() ?? '')
  const [maxV, setMaxV] = useState(initial?.max_value?.toString() ?? '')
  const [maxChoices, setMaxChoices] = useState(initial?.max_choices?.toString() ?? '')
  const [options, setOptions] = useState<DraftOption[]>(initial?.options.map((o) => ({ id: o.id, label: o.label, is_other: o.is_other })) ?? [{ label: '', is_other: false }, { label: '', is_other: false }])
  const earlier = all.filter((x) => !initial || x.position < initial.position)
  const [conds, setConds] = useState<DraftCond[]>(initial?.conditions.map((c) => ({
    depends_on_question_id: c.depends_on_question_id, operator: c.operator, option_id: c.option_id ?? '', numeric_value: c.numeric_value?.toString() ?? '',
  })) ?? (conditional && earlier.length ? [{ depends_on_question_id: earlier[earlier.length - 1].id, operator: 'equals', option_id: '', numeric_value: '' }] : []))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const choice = type === 'single_choice' || type === 'multiple_choice'

  function opsFor(depId: string): ConditionOperator[] {
    const dep = all.find((x) => x.id === depId)
    if (!dep) return ['answered']
    if (dep.type === 'single_choice') return ['equals', 'not_equals', 'answered']
    if (dep.type === 'multiple_choice') return ['includes', 'not_equals', 'answered']
    if (dep.type === 'numeric') return ['greater_than', 'less_than', 'answered']
    return ['answered']
  }

  async function save() {
    setErr(null)
    if (!text.trim()) return setErr('Digite o enunciado da pergunta.')
    const opts = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label)
    if (choice && opts.length < 2) return setErr('Informe pelo menos 2 alternativas.')
    if (choice && opts.length > MAX_O) return setErr(`Máximo de ${MAX_O} alternativas.`)
    if (choice && new Set(opts.map((o) => o.label.toLowerCase())).size !== opts.length) return setErr('Há alternativas repetidas.')
    if (type === 'numeric' && minV !== '' && maxV !== '' && Number(maxV) < Number(minV)) return setErr('O máximo deve ser maior ou igual ao mínimo.')
    for (const c of conds) {
      if (['equals', 'not_equals', 'includes'].includes(c.operator) && !c.option_id) return setErr('Escolha a alternativa da condição.')
      if (['greater_than', 'less_than'].includes(c.operator) && c.numeric_value === '') return setErr('Informe o valor da condição.')
    }
    setSaving(true)
    const { error } = await supabase.rpc('admin_save_question', {
      _payload: {
        id: initial?.id ?? null, version_id: versionId, type, text: text.trim(), help_text: help.trim() || null, required,
        min_value: minV === '' ? null : Number(minV), max_value: maxV === '' ? null : Number(maxV),
        max_choices: maxChoices === '' ? null : Number(maxChoices),
        options: choice ? opts : [],
        conditions: conds.map((c) => ({ ...c, option_id: c.option_id || null, numeric_value: c.numeric_value === '' ? null : Number(c.numeric_value) })),
      },
    })
    setSaving(false)
    if (error) return toast.error(error)
    toast.ok(initial ? 'Pergunta atualizada.' : 'Pergunta adicionada.')
    onSaved()
  }

  return (
    <Modal open onClose={onClose} wide title={initial ? `Editar pergunta ${initial.position}` : conditional ? 'Nova pergunta condicional' : 'Nova pergunta'}
      footer={<><button className="btn-soft" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar pergunta'}</button></>}>
      <div className="space-y-4">
        <div>
          <span className="field-label">Tipo de resposta</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(questionType) as QuestionType[]).map((t) => (
              <button key={t} type="button" onClick={() => { setType(t); if (t === 'observation') setRequired(false) }}
                className={cn('rounded-lg border p-2.5 text-left', type === t ? 'border-gold bg-[#fff9eb]' : 'border-line hover:border-gold/50')}>
                <div className="text-sm font-bold">{questionType[t].label}</div><div className="k">{questionType[t].hint}</div>
              </button>
            ))}
          </div>
        </div>
        <Field label="Enunciado *"><textarea className="input" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Como o(a) sr(a) avalia o atendimento do posto de saúde?" /></Field>
        <Field label="Instrução ao entrevistador (opcional)" hint="Exibida em destaque, não deve ser lida ao entrevistado."><input className="input" maxLength={300} value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Ex.: Ler as alternativas" /></Field>
        {type !== 'observation' && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-navy" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Resposta obrigatória</label>
        )}

        {choice && (
          <div>
            <span className="field-label">Alternativas ({options.filter((o) => o.label.trim()).length}/{MAX_O})</span>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 text-center font-mono text-xs text-ink-muted">{o.is_other ? 99 : i + 1}</span>
                  <input className="input !py-2" value={o.label} maxLength={200} placeholder={`Alternativa ${i + 1}`} aria-label={`Alternativa ${i + 1}`}
                    onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <button type="button" className="btn-soft btn-sm" disabled={i === 0} aria-label="Subir"
                    onClick={() => { const n = [...options]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setOptions(n) }}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="btn-soft btn-sm" aria-label="Remover" onClick={() => setOptions(options.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-soft btn-sm" disabled={options.length >= MAX_O} onClick={() => setOptions([...options, { label: '', is_other: false }])}><Plus className="h-3.5 w-3.5" />Alternativa</button>
              <button type="button" className="btn-soft btn-sm" disabled={options.length >= MAX_O || options.some((o) => o.is_other)}
                onClick={() => setOptions([...options, { label: 'Outro', is_other: true }])}><Plus className="h-3.5 w-3.5" />Alternativa "Outro (especifique)"</button>
            </div>
            {type === 'multiple_choice' && (
              <Field label="Máximo de alternativas marcadas (opcional)" className="mt-3 max-w-xs">
                <input type="number" min={1} max={MAX_O} className="input" value={maxChoices} onChange={(e) => setMaxChoices(e.target.value)} />
              </Field>
            )}
          </div>
        )}

        {type === 'numeric' && (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Field label="Valor mínimo"><input type="number" className="input" value={minV} onChange={(e) => setMinV(e.target.value)} /></Field>
            <Field label="Valor máximo"><input type="number" className="input" value={maxV} onChange={(e) => setMaxV(e.target.value)} /></Field>
          </div>
        )}

        <div className="rounded-lg border border-dashed border-gold/60 bg-[#fffcf4] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold"><GitBranch className="mr-1 inline h-4 w-4 text-gold-deep" />Condição de exibição</span>
            <button type="button" className="btn-soft btn-sm" disabled={!earlier.length}
              onClick={() => setConds([...conds, { depends_on_question_id: earlier[earlier.length - 1].id, operator: opsFor(earlier[earlier.length - 1].id)[0], option_id: '', numeric_value: '' }])}>
              <Plus className="h-3.5 w-3.5" />Adicionar condição</button>
          </div>
          {!earlier.length && <p className="k mt-1">Condições dependem de perguntas anteriores.</p>}
          {!conds.length ? <p className="k mt-1">Sem condição: a pergunta é sempre exibida.</p> : (
            <div className="mt-2 space-y-2">
              <p className="k">Exibir esta pergunta somente se <b>todas</b> as condições forem atendidas:</p>
              {conds.map((c, i) => {
                const dep = all.find((x) => x.id === c.depends_on_question_id)
                const set = (patch: Partial<DraftCond>) => setConds(conds.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                    <select className="input !py-2" value={c.depends_on_question_id} aria-label="Pergunta de origem"
                      onChange={(e) => set({ depends_on_question_id: e.target.value, operator: opsFor(e.target.value)[0], option_id: '' })}>
                      {earlier.map((x) => <option key={x.id} value={x.id}>P{x.position}. {x.text.slice(0, 50)}</option>)}
                    </select>
                    <select className="input !py-2" value={c.operator} aria-label="Operador" onChange={(e) => set({ operator: e.target.value as ConditionOperator })}>
                      {opsFor(c.depends_on_question_id).map((o) => <option key={o} value={o}>{conditionOperator[o]}</option>)}
                    </select>
                    {['equals', 'not_equals', 'includes'].includes(c.operator) ? (
                      <select className="input !py-2" value={c.option_id} aria-label="Alternativa" onChange={(e) => set({ option_id: e.target.value })}>
                        <option value="">Alternativa…</option>{dep?.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    ) : ['greater_than', 'less_than'].includes(c.operator) ? (
                      <input type="number" className="input !py-2" value={c.numeric_value} aria-label="Valor" onChange={(e) => set({ numeric_value: e.target.value })} />
                    ) : <span />}
                    <button type="button" className="btn-soft btn-sm" aria-label="Remover condição" onClick={() => setConds(conds.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  )
}
