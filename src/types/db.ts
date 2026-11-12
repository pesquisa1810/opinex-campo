export type AppRole = 'admin' | 'interviewer'
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'blocked' | 'inactive'
export type SurveyStatus = 'draft' | 'in_review' | 'published' | 'in_progress' | 'suspended' | 'completed' | 'archived'
export type SamplingType = 'probabilistic' | 'non_probabilistic'
export type GpsPolicy = 'required' | 'optional'
export type VersionStatus = 'draft' | 'published' | 'superseded'
export type QuestionType = 'single_choice' | 'multiple_choice' | 'open_text' | 'numeric' | 'observation'
export type ConditionOperator = 'equals' | 'not_equals' | 'includes' | 'greater_than' | 'less_than' | 'answered'
export type InterviewStatus = 'received' | 'under_review' | 'approved' | 'rejected' | 'needs_revision'

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  status: UserStatus
  status_reason: string | null
  created_at: string
}

export interface Survey {
  id: string
  code: string
  name: string
  description: string | null
  objective: string | null
  municipality: string | null
  state: string | null
  coverage_area: string | null
  start_date: string | null
  end_date: string | null
  target_total: number
  sampling_method: string | null
  sampling_type: SamplingType
  responsible: string | null
  notes: string | null
  status: SurveyStatus
  gps_policy: GpsPolicy
  min_duration_seconds: number
  created_at: string
  updated_at: string
}

export interface SurveyOverview {
  id: string
  code: string
  name: string
  municipality: string | null
  state: string | null
  start_date: string | null
  end_date: string | null
  status: SurveyStatus
  target_total: number
  published_version: number | null
  published_questions: number | null
  draft_version: number | null
  draft_questions: number | null
  interviews: number
  approved: number
  interviewers: number
  updated_at: string
}

export interface InterviewerOverview {
  id: string
  full_name: string
  email: string
  phone: string | null
  status: UserStatus
  status_reason: string | null
  created_at: string
  individual_target: number
  assigned_surveys: number
  active_devices: number
  interviews: number
  approved: number
  rejected: number
  pending: number
  last_interview_at: string | null
}

export interface QuestionnaireVersion {
  id: string
  survey_id: string
  version: number
  status: VersionStatus
  published_at: string | null
  created_at: string
}

export interface QOption {
  id: string
  position: number
  label: string
  code: number
  is_other: boolean
}

export interface QCondition {
  depends_on_question_id: string
  operator: ConditionOperator
  option_id: string | null
  numeric_value: number | null
}

export interface Question {
  id: string
  position: number
  type: QuestionType
  text: string
  help_text: string | null
  required: boolean
  min_value: number | null
  max_value: number | null
  max_choices: number | null
  options: QOption[]
  conditions: QCondition[]
}

export interface QuestionnaireSnapshot {
  version_id: string
  version: number
  survey_id: string
  questions: Question[]
}

export interface Assignment {
  id: string
  survey_id: string
  interviewer_id: string
  target: number
  active: boolean
  assigned_at: string
}

export interface SurveyTarget {
  id: string
  survey_id: string
  municipality: string
  neighborhood: string | null
  sector: string | null
  target: number
}

export interface Dashboard {
  surveys_total: number
  surveys_in_progress: number
  surveys_completed: number
  interviewers_total: number
  interviewers_pending: number
  interviewers_approved: number
  interviewers_active_7d: number
  devices_active: number
  devices_limit: number
  interviews_total: number
  interviews_approved: number
  interviews_rejected: number
  interviews_pending: number
  target_total: number
  by_day: { day: string; total: number }[]
  by_status: { status: InterviewStatus; total: number }[]
  by_survey: { survey_id: string; code: string; name: string; target: number; total: number }[]
  by_interviewer: { interviewer_id: string; name: string; total: number; approved: number; rejected: number }[]
  by_municipality: { municipality: string; total: number }[]
  by_neighborhood: { municipality: string; neighborhood: string; total: number }[]
}

export interface ActivityItem {
  created_at: string
  action: string
  entity: string
  entity_id: string | null
  actor_name: string | null
  summary: string | null
}
