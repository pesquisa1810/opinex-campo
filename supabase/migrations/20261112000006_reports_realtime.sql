-- ============================================================================
-- OPINEX CAMPO — 0006: Indicadores, resultados e Realtime
-- Todas as funções leem dados reais gravados; acesso restrito a administradores
-- (exceto my_productivity, restrita ao próprio entrevistador).
-- ============================================================================

create or replace function public.admin_dashboard(_survey uuid default null, _days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  with iv as (
    select i.* from public.interviews i where _survey is null or i.survey_id = _survey
  )
  select jsonb_build_object(
    'surveys_total', (select count(*) from public.surveys where status <> 'archived'),
    'surveys_in_progress', (select count(*) from public.surveys where status in ('published', 'in_progress')),
    'surveys_completed', (select count(*) from public.surveys where status = 'completed'),
    'interviewers_total', (select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id where r.role = 'interviewer'),
    'interviewers_pending', (select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id where r.role = 'interviewer' and p.status = 'pending'),
    'interviewers_approved', (select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id where r.role = 'interviewer' and p.status = 'approved'),
    'interviewers_active_7d', (select count(distinct interviewer_id) from iv where submitted_at > now() - interval '7 days'),
    'devices_active', (select count(*) from public.devices where status = 'active'),
    'devices_limit', public.device_limit(),
    'interviews_total', (select count(*) from iv),
    'interviews_approved', (select count(*) from iv where status = 'approved'),
    'interviews_rejected', (select count(*) from iv where status = 'rejected'),
    'interviews_pending', (select count(*) from iv where status in ('received', 'under_review', 'needs_revision')),
    'target_total', (select coalesce(sum(target_total), 0) from public.surveys
                      where status <> 'archived' and (_survey is null or id = _survey)),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'total', n) order by d) from (
        select (submitted_at at time zone 'America/Sao_Paulo')::date d, count(*) n from iv
         where submitted_at > now() - make_interval(days => _days) group by 1) x), '[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'total', n)) from (
        select status, count(*) n from iv group by 1) x), '[]'::jsonb),
    'by_survey', coalesce((select jsonb_agg(jsonb_build_object('survey_id', s.id, 'code', s.code, 'name', s.name,
        'target', s.target_total, 'total', coalesce(x.n, 0)) order by coalesce(x.n, 0) desc) from public.surveys s
        left join (select survey_id, count(*) n from public.interviews where status <> 'rejected' group by 1) x on x.survey_id = s.id
        where s.status not in ('archived', 'draft') and (_survey is null or s.id = _survey)), '[]'::jsonb),
    'by_interviewer', coalesce((select jsonb_agg(jsonb_build_object('interviewer_id', p.id, 'name', p.full_name, 'total', x.n,
        'approved', x.a, 'rejected', x.r) order by x.n desc) from (
        select interviewer_id, count(*) n, count(*) filter (where status = 'approved') a,
               count(*) filter (where status = 'rejected') r from iv group by 1) x
        join public.profiles p on p.id = x.interviewer_id), '[]'::jsonb),
    'by_municipality', coalesce((select jsonb_agg(jsonb_build_object('municipality', municipality, 'total', n) order by n desc) from (
        select municipality, count(*) n from iv where status <> 'rejected' group by 1 limit 30) x), '[]'::jsonb),
    'by_neighborhood', coalesce((select jsonb_agg(jsonb_build_object('municipality', municipality, 'neighborhood', neighborhood, 'total', n) order by n desc) from (
        select municipality, neighborhood, count(*) n from iv where status <> 'rejected' group by 1, 2 order by 3 desc limit 30) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Distribuição de respostas de uma pesquisa (todas as versões), com denominadores explícitos.
-- _statuses: situações das entrevistas incluídas (padrão: aprovadas + recebidas + em análise).
create or replace function public.admin_survey_results(_survey uuid,
  _statuses public.interview_status[] default array['approved', 'received', 'under_review']::public.interview_status[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_total int; v_s public.surveys%rowtype; r jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_s from public.surveys where id = _survey;
  if not found then raise exception 'NOT_FOUND'; end if;
  select count(*) into v_total from public.interviews where survey_id = _survey and status = any(_statuses);

  -- Agrupa por posição/texto da pergunta para consolidar versões diferentes do questionário.
  with iv as (select id from public.interviews where survey_id = _survey and status = any(_statuses)),
  qs as (
    select q.id, q.version_id, q.position, q.type, q.text from public.questions q
    join public.questionnaire_versions v on v.id = q.version_id and v.survey_id = _survey and v.status <> 'draft'
  ),
  qkeys as (select distinct on (position, text) position, text, type from qs order by position, text),
  per_q as (
    select k.position, k.text, k.type,
      (select count(distinct a.interview_id) from public.interview_answers a join qs on qs.id = a.question_id
        where qs.position = k.position and qs.text = k.text and a.interview_id in (select id from iv)) as valid_n,
      (select count(*) from iv i join public.interviews ii on ii.id = i.id
         join qs on qs.version_id = ii.version_id and qs.position = k.position and qs.text = k.text) as asked_n
    from qkeys k
  )
  select jsonb_build_object(
    'survey', jsonb_build_object('id', v_s.id, 'code', v_s.code, 'name', v_s.name, 'sampling_type', v_s.sampling_type,
                                 'sampling_method', v_s.sampling_method, 'target_total', v_s.target_total),
    'interviews_included', v_total,
    'statuses', to_jsonb(_statuses),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'position', p.position, 'text', p.text, 'type', p.type,
        'base_interviews', v_total,
        'valid_responses', p.valid_n,
        'non_responses', greatest(p.asked_n - p.valid_n, 0),
        'not_applicable', greatest(v_total - p.asked_n, 0),
        'options', case when p.type in ('single_choice', 'multiple_choice') then coalesce((
            select jsonb_agg(jsonb_build_object('label', o.label, 'code', o.code, 'count', o.n,
                     'pct_valid', case when p.valid_n > 0 then round(100.0 * o.n / p.valid_n, 1) end) order by o.code)
              from (select op.label, op.code, count(distinct a.interview_id) n
                      from qs join public.question_options op on op.question_id = qs.id
                      left join public.interview_answers a on a.question_id = qs.id and op.id = any(a.option_ids)
                                and a.interview_id in (select id from iv)
                     where qs.position = p.position and qs.text = p.text
                     group by op.label, op.code) o), '[]'::jsonb) end,
        'numeric', case when p.type = 'numeric' then (
            select jsonb_build_object('min', min(a.numeric_value), 'max', max(a.numeric_value),
                     'mean', round(avg(a.numeric_value), 2),
                     'median', percentile_cont(0.5) within group (order by a.numeric_value))
              from public.interview_answers a join qs on qs.id = a.question_id
             where qs.position = p.position and qs.text = p.text and a.interview_id in (select id from iv)) end,
        'texts', case when p.type in ('open_text', 'observation') then coalesce((
            select jsonb_agg(t.text_value) from (
              select a.text_value from public.interview_answers a join qs on qs.id = a.question_id
               where qs.position = p.position and qs.text = p.text and a.interview_id in (select id from iv)
                 and a.text_value is not null order by a.text_value limit 300) t), '[]'::jsonb) end
      ) order by p.position) from per_q p), '[]'::jsonb),
    'methodology_note', case when v_s.sampling_type = 'non_probabilistic'
      then 'Amostra não probabilística: os percentuais descrevem apenas os entrevistados e não permitem inferência estatística para a população. Margem de erro não se aplica.'
      else 'Amostra declarada como probabilística. O cálculo de margem de erro depende do desenho amostral e deve ser validado pelo estatístico responsável.' end
  ) into r;
  return r;
end $$;

-- Produtividade do próprio entrevistador
create or replace function public.my_productivity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'individual_target', (select individual_target from public.interviewer_profiles where user_id = auth.uid()),
    'total', (select count(*) from public.interviews where interviewer_id = auth.uid()),
    'today', (select count(*) from public.interviews where interviewer_id = auth.uid()
               and (submitted_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'approved', (select count(*) from public.interviews where interviewer_id = auth.uid() and status = 'approved'),
    'rejected', (select count(*) from public.interviews where interviewer_id = auth.uid() and status = 'rejected'),
    'pending', (select count(*) from public.interviews where interviewer_id = auth.uid() and status in ('received', 'under_review', 'needs_revision')),
    'by_survey', coalesce((select jsonb_agg(jsonb_build_object('survey_id', a.survey_id, 'target', a.target,
        'done', (select count(*) from public.interviews i where i.survey_id = a.survey_id and i.interviewer_id = auth.uid())))
        from public.survey_assignments a where a.interviewer_id = auth.uid() and a.active), '[]'::jsonb)
  );
end $$;

revoke execute on function public.admin_dashboard(uuid, int) from public, anon;
revoke execute on function public.admin_survey_results(uuid, public.interview_status[]) from public, anon;
revoke execute on function public.my_productivity() from public, anon;
grant execute on function public.admin_dashboard(uuid, int) to authenticated;
grant execute on function public.admin_survey_results(uuid, public.interview_status[]) to authenticated;
grant execute on function public.my_productivity() to authenticated;

-- Realtime: painel atualiza ao receber entrevistas, cadastros e mudanças em dispositivos.
-- (A RLS também se aplica às mensagens do Realtime.)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.interviews, public.profiles, public.devices,
      public.admin_notifications, public.device_authorizations;
  end if;
end $$;
