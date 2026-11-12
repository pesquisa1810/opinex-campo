import { supabase } from '@/lib/supabase'
import type { ActivityItem, Dashboard, InterviewerOverview, SurveyOverview } from '@/types/db'

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}
export const api = {
  rpc,
  dashboard: (survey?: string | null) => rpc<Dashboard>('admin_dashboard', { _survey: survey ?? null, _days: 30 }),
  activity: () => rpc<ActivityItem[]>('admin_recent_activity', { _limit: 10 }),
  surveys: () => rpc<SurveyOverview[]>('admin_survey_overview'),
  interviewers: () => rpc<InterviewerOverview[]>('admin_interviewer_overview'),
}
