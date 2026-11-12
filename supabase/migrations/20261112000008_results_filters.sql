-- ============================================================================
-- OPINEX CAMPO — 0008: Filtros da apuração (município, bairro, período) e
-- microdados para exportação.
-- ============================================================================
drop function if exists public.admin_survey_results(uuid, public.interview_status[]);

create or replace function public.admin_survey_results(_survey uuid,
  _statuses public.interview_status[] default array['approved', 'received', 'under_review']::public.interview_status[],
  _municipality text default null, _neighborhood text default null, _from date default null, _to date default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_total int; v_s public.surveys%rowtype; r jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_s from public.surveys where id = _survey;
  if not found then raise exception 'NOT_FOUND'; end if;

  create temporary table if not exists _iv(id uuid primary key, version_id uuid) on commit drop;
  delete from _iv where true;
  insert into _iv
  select i.id, i.version_id from public.interviews i
   where i.survey_id = _survey and i.status = any(_statuses)
     and (_municipality is null or lower(i.municipality) = lower(_municipality))
     and (_neighborhood is null or lower(i.neighborhood) = lower(_neighborhood))
     and (_from is null or (i.submitted_at at time zone 'America/Sao_Paulo')::date >= _from)
     and (_to is null or (i.submitted_at at time zone 'America/Sao_Paulo')::date <= _to);
  select count(*) into v_total from _iv;

  -- Consolida versões do questionário pela posição + enunciado da pergunta.
  with qs as (
    select q.id, q.version_id, q.position, q.type, q.text from public.questions q
    join public.questionnaire_versions v on v.id = q.version_id and v.survey_id = _survey and v.status <> 'draft'
  ),
  qkeys as (select distinct on (position, text) position, text, type from qs order by position, text),
  per_q as (
    select k.position, k.text, k.type,
      (select count(distinct a.interview_id) from public.interview_answers a join qs on qs.id = a.question_id
        where qs.position = k.position and qs.text = k.text and a.interview_id in (select id from _iv)) as valid_n,
      -- entrevistas cuja versão continha a pergunta (independentemente de condição)
      (select count(*) from _iv i join qs on qs.version_id = i.version_id and qs.position = k.position and qs.text = k.text) as asked_n
    from qkeys k
  )
  select jsonb_build_object(
    'survey', jsonb_build_object('id', v_s.id, 'code', v_s.code, 'name', v_s.name, 'sampling_type', v_s.sampling_type,
                                 'sampling_method', v_s.sampling_method, 'target_total', v_s.target_total,
                                 'municipality', v_s.municipality, 'state', v_s.state, 'start_date', v_s.start_date, 'end_date', v_s.end_date,
                                 'responsible', v_s.responsible, 'objective', v_s.objective),
    'interviews_included', v_total,
    'filters', jsonb_build_object('statuses', to_jsonb(_statuses), 'municipality', _municipality, 'neighborhood', _neighborhood, 'from', _from, 'to', _to),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'position', p.position, 'text', p.text, 'type', p.type,
        'base_interviews', v_total,
        'valid_responses', p.valid_n,
        -- não resposta/não se aplica: entrevistas com a versão da pergunta, mas sem resposta válida (oculta por condição ou opcional em branco)
        'non_responses', greatest(p.asked_n - p.valid_n, 0),
        'options', case when p.type in ('single_choice', 'multiple_choice') then coalesce((
            select jsonb_agg(jsonb_build_object('label', o.label, 'code', o.code, 'count', o.n,
                     'pct_valid', case when p.valid_n > 0 then round(100.0 * o.n / p.valid_n, 1) end,
                     'pct_base', case when v_total > 0 then round(100.0 * o.n / v_total, 1) end) order by o.code)
              from (select op.label, op.code, count(distinct a.interview_id) n
                      from qs join public.question_options op on op.question_id = qs.id
                      left join public.interview_answers a on a.question_id = qs.id and op.id = any(a.option_ids)
                                and a.interview_id in (select id from _iv)
                     where qs.position = p.position and qs.text = p.text
                     group by op.label, op.code) o), '[]'::jsonb) end,
        'others', case when p.type in ('single_choice', 'multiple_choice') then coalesce((
            select jsonb_agg(t.other_text) from (
              select a.other_text from public.interview_answers a join qs on qs.id = a.question_id
               where qs.position = p.position and qs.text = p.text and a.other_text is not null
                 and a.interview_id in (select id from _iv) order by a.other_text limit 200) t), '[]'::jsonb) end,
        'numeric', case when p.type = 'numeric' then (
            select jsonb_build_object('n', count(a.numeric_value), 'min', min(a.numeric_value), 'max', max(a.numeric_value),
                     'mean', round(avg(a.numeric_value), 2),
                     'median', percentile_cont(0.5) within group (order by a.numeric_value))
              from public.interview_answers a join qs on qs.id = a.question_id
             where qs.position = p.position and qs.text = p.text and a.interview_id in (select id from _iv)) end,
        'texts', case when p.type in ('open_text', 'observation') then coalesce((
            select jsonb_agg(t.text_value) from (
              select a.text_value from public.interview_answers a join qs on qs.id = a.question_id
               where qs.position = p.position and qs.text = p.text and a.interview_id in (select id from _iv)
                 and a.text_value is not null order by a.text_value limit 300) t), '[]'::jsonb) end
      ) order by p.position) from per_q p), '[]'::jsonb),
    'by_municipality', coalesce((select jsonb_agg(jsonb_build_object('label', m, 'total', n) order by n desc) from (
        select i.municipality m, count(*) n from public.interviews i join _iv on _iv.id = i.id group by 1) x), '[]'::jsonb),
    'by_neighborhood', coalesce((select jsonb_agg(jsonb_build_object('label', b || ' (' || m || ')', 'total', n) order by n desc) from (
        select i.municipality m, i.neighborhood b, count(*) n from public.interviews i join _iv on _iv.id = i.id group by 1, 2 order by 3 desc limit 40) x), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'total', n) order by d) from (
        select (i.submitted_at at time zone 'America/Sao_Paulo')::date d, count(*) n from public.interviews i join _iv on _iv.id = i.id group by 1) x), '[]'::jsonb),
    'by_interviewer', coalesce((select jsonb_agg(jsonb_build_object('label', p.full_name, 'total', x.n) order by x.n desc) from (
        select i.interviewer_id, count(*) n from public.interviews i join _iv on _iv.id = i.id group by 1) x
        join public.profiles p on p.id = x.interviewer_id), '[]'::jsonb),
    'methodology_note', case when v_s.sampling_type = 'non_probabilistic'
      then 'Amostra não probabilística: os percentuais descrevem apenas as pessoas entrevistadas e não permitem inferência estatística para a população. Margem de erro não se aplica.'
      else 'Amostra declarada como probabilística. A margem de erro depende do desenho amostral e deve ser calculada e validada pelo estatístico responsável; o sistema não a calcula automaticamente.' end
  ) into r;
  return r;
end $$;

-- Microdados (uma linha por entrevista, respostas por pergunta) para exportação CSV/Excel.
-- Não inclui identificação de entrevistados (o sistema não coleta) nem coordenadas GPS.
create or replace function public.admin_export_microdata(_survey uuid,
  _statuses public.interview_status[] default array['approved', 'received', 'under_review']::public.interview_status[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.write_audit('export_microdata', 'surveys', _survey::text, null, jsonb_build_object('statuses', _statuses));
  return coalesce((select jsonb_agg(jsonb_build_object(
      'protocolo', upper(left(i.id::text, 8)), 'versao', v.version, 'status', i.status,
      'enviada_em', to_char(i.submitted_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
      'duracao_seg', i.duration_seconds, 'entrevistador', p.full_name,
      'municipio', i.municipality, 'bairro', i.neighborhood, 'setor', i.sector,
      'gps', (select l.permission from public.interview_locations l where l.interview_id = i.id),
      'qualidade', i.quality_score,
      'respostas', coalesce((select jsonb_object_agg('P' || q.position, case
            when q.type in ('single_choice', 'multiple_choice') then to_jsonb((
              select string_agg(o.label || case when o.is_other and a.other_text is not null then ': ' || a.other_text else '' end, '; ' order by o.position)
                from public.question_options o where o.id = any(a.option_ids)))
            when q.type = 'numeric' then to_jsonb(a.numeric_value)
            else to_jsonb(a.text_value) end)
          from public.interview_answers a join public.questions q on q.id = a.question_id where a.interview_id = i.id), '{}'::jsonb)
    ) order by i.submitted_at)
    from public.interviews i
    join public.questionnaire_versions v on v.id = i.version_id
    join public.profiles p on p.id = i.interviewer_id
   where i.survey_id = _survey and i.status = any(_statuses)), '[]'::jsonb);
end $$;

revoke execute on function public.admin_survey_results(uuid, public.interview_status[], text, text, date, date) from public, anon;
grant execute on function public.admin_survey_results(uuid, public.interview_status[], text, text, date, date) to authenticated;
revoke execute on function public.admin_export_microdata(uuid, public.interview_status[]) from public, anon;
grant execute on function public.admin_export_microdata(uuid, public.interview_status[]) to authenticated;
