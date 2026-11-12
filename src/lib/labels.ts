import type { ConditionOperator, InterviewStatus, QuestionType, SurveyStatus, UserStatus } from '@/types/db'

export type Tone = 'ok' | 'wait' | 'off' | 'bad' | 'info'

export const userStatus: Record<UserStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pendente', tone: 'wait' },
  approved: { label: 'Aprovado', tone: 'ok' },
  rejected: { label: 'Rejeitado', tone: 'bad' },
  blocked: { label: 'Bloqueado', tone: 'bad' },
  inactive: { label: 'Inativo', tone: 'off' },
}

export const surveyStatus: Record<SurveyStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Rascunho', tone: 'off' },
  in_review: { label: 'Em revisão', tone: 'wait' },
  published: { label: 'Publicada', tone: 'info' },
  in_progress: { label: 'Em andamento', tone: 'ok' },
  suspended: { label: 'Suspensa', tone: 'bad' },
  completed: { label: 'Concluída', tone: 'info' },
  archived: { label: 'Arquivada', tone: 'off' },
}

export const interviewStatus: Record<InterviewStatus, { label: string; tone: Tone }> = {
  received: { label: 'Recebida', tone: 'info' },
  under_review: { label: 'Em análise', tone: 'wait' },
  approved: { label: 'Aprovada', tone: 'ok' },
  rejected: { label: 'Rejeitada', tone: 'bad' },
  needs_revision: { label: 'Necessita revisão', tone: 'wait' },
}

export const questionType: Record<QuestionType, { label: string; hint: string }> = {
  single_choice: { label: 'Escolha única', hint: 'O entrevistado escolhe uma alternativa' },
  multiple_choice: { label: 'Múltipla escolha', hint: 'Permite marcar várias alternativas' },
  open_text: { label: 'Resposta espontânea', hint: 'Texto livre, sem alternativas' },
  numeric: { label: 'Resposta numérica', hint: 'Número com mínimo e máximo opcionais' },
  observation: { label: 'Campo de observação', hint: 'Anotação do entrevistador' },
}

export const conditionOperator: Record<ConditionOperator, string> = {
  equals: 'for igual a',
  not_equals: 'for diferente de',
  includes: 'incluir',
  greater_than: 'for maior que',
  less_than: 'for menor que',
  answered: 'tiver sido respondida',
}

export const BR_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
