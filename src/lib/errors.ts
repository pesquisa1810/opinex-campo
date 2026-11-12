// Traduz erros do Supabase/PostgreSQL (códigos levantados pelas funções do banco) para mensagens claras.
const messages: Record<string, string> = {
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Registro não encontrado.',
  REASON_REQUIRED: 'Informe a justificativa.',
  VERSION_LOCKED: 'Esta versão do questionário já foi publicada e não pode ser alterada. Crie uma nova versão.',
  QUESTION_LIMIT: 'Limite de 30 perguntas por questionário atingido.',
  OPTION_LIMIT: 'Limite de 8 alternativas por pergunta atingido.',
  INVALID_OPTIONS: 'Apenas uma alternativa "Outro" por pergunta.',
  INTERVIEWER_NOT_APPROVED: 'O entrevistador precisa estar aprovado.',
  SURVEY_CLOSED: 'Pesquisa concluída ou arquivada.',
  NO_PUBLISHED_QUESTIONNAIRE: 'Publique o questionário antes de liberar a pesquisa.',
  INVALID_TRANSITION: 'Mudança de situação não permitida.',
  DEVICE_LIMIT_REACHED: 'Limite global de 5 dispositivos atingido. Revogue um dispositivo para liberar vaga.',
  TERMS_NOT_ACCEPTED: 'É obrigatório aceitar os termos de uso e o aviso de privacidade.',
  INVALID_NAME: 'Informe o nome completo.',
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).',
  'User already registered': 'Já existe um cadastro com este e-mail.',
}

export function errorMessage(err: unknown): string {
  const raw =
    typeof err === 'string' ? err
      : err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message)
        : 'Erro inesperado.'
  if (/duplicate key.*surveys_code_key/.test(raw)) return 'Já existe uma pesquisa com este código.'
  if (/surveys_code_check/.test(raw)) return 'Código inválido: use letras maiúsculas, números, hífen ou sublinhado (2 a 30 caracteres).'
  if (/Database error saving new user/i.test(raw)) return 'Não foi possível concluir o cadastro. Verifique os dados e o aceite dos termos.'
  if (/Password should be at least/i.test(raw)) return 'A senha deve ter pelo menos 8 caracteres.'
  const code = raw.split(':')[0].trim()
  if (messages[code]) return code === raw.trim() || !raw.includes(':') ? messages[code] : raw.slice(code.length + 1).trim() || messages[code]
  return messages[raw] ?? raw
}
