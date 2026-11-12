-- ============================================================================
-- OPINEX CAMPO — 0004: Operações administrativas
-- Entrevistadores (status, sessões), atribuições, versões de questionário,
-- publicação e duplicação de pesquisas.
-- ============================================================================

-- ----------------------------------------------------- Entrevistadores -----
create or replace function public.admin_set_user_status(_user uuid, _status public.user_status, _reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if _user = auth.uid() then raise exception 'FORBIDDEN: não é possível alterar o próprio status'; end if;
  if public.has_role(_user, 'admin') or exists (select 1 from public.user_roles where user_id = _user and role = 'admin') then
    raise exception 'FORBIDDEN: status de administrador não é alterado por esta tela';
  end if;
  if _status in ('rejected', 'blocked') and coalesce(trim(_reason), '') = '' then
    raise exception 'REASON_REQUIRED: informe a justificativa';
  end if;

  update public.profiles
     set status = _status, status_reason = nullif(trim(_reason), ''),
         status_changed_at = now(), status_changed_by = auth.uid()
   where id = _user;
  if not found then raise exception 'NOT_FOUND'; end if;

  if _status <> 'approved' then
    -- Perda de acesso: revoga dispositivos, cancela QR pendentes e encerra sessões.
    update public.devices set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
           revoke_reason = 'Usuário com status ' || _status::text
     where interviewer_id = _user and status = 'active';
    update public.device_authorizations set status = 'cancelled'
     where interviewer_id = _user and status = 'pending';
    delete from auth.sessions where user_id = _user;
  end if;
end $$;

create or replace function public.admin_revoke_sessions(_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  delete from auth.sessions where user_id = _user;
  get diagnostics v = row_count;
  perform public.write_audit('sessions_revoked', 'profiles', _user::text, null, jsonb_build_object('sessions', v));
  return v;
end $$;

-- --------------------------------------------------------- Atribuições -----
create or replace function public.admin_assign_survey(_survey uuid, _interviewer uuid, _target integer default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not public.has_role(_interviewer, 'interviewer') then
    raise exception 'INTERVIEWER_NOT_APPROVED: somente entrevistadores aprovados podem receber pesquisas';
  end if;
  if exists (select 1 from public.surveys where id = _survey and status in ('completed', 'archived')) then
    raise exception 'SURVEY_CLOSED: pesquisa concluída ou arquivada';
  end if;
  insert into public.survey_assignments(survey_id, interviewer_id, target, assigned_by, active)
  values (_survey, _interviewer, greatest(coalesce(_target, 0), 0), auth.uid(), true)
  on conflict (survey_id, interviewer_id)
  do update set active = true, target = excluded.target, assigned_by = excluded.assigned_by
  returning id into v_id;
  return v_id;
end $$;

-- ------------------------------------------------- Versões / snapshot ------
create or replace function public.build_questionnaire_snapshot(_version uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version_id', v.id, 'version', v.version, 'survey_id', v.survey_id,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'position', q.position, 'type', q.type, 'text', q.text, 'help_text', q.help_text,
        'required', q.required, 'min_value', q.min_value, 'max_value', q.max_value, 'max_choices', q.max_choices,
        'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'label', o.label,
                                   'code', o.code, 'is_other', o.is_other) order by o.position)
                             from public.question_options o where o.question_id = q.id), '[]'::jsonb),
        'conditions', coalesce((select jsonb_agg(jsonb_build_object('depends_on_question_id', c.depends_on_question_id,
                                   'operator', c.operator, 'option_id', c.option_id, 'numeric_value', c.numeric_value))
                                from public.question_conditions c where c.question_id = q.id), '[]'::jsonb)
      ) order by q.position)
      from public.questions q where q.version_id = v.id), '[]'::jsonb))
  from public.questionnaire_versions v where v.id = _version
$$;
revoke execute on function public.build_questionnaire_snapshot(uuid) from public, anon, authenticated;

-- Copia perguntas/alternativas/condições de uma versão para outra (remapeando ids)
create or replace function public.copy_questionnaire(_from uuid, _to uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  create temporary table if not exists _qmap(old_id uuid, new_id uuid) on commit drop;
  create temporary table if not exists _omap(old_id uuid, new_id uuid) on commit drop;
  delete from _qmap; delete from _omap;

  insert into _qmap select id, gen_random_uuid() from public.questions where version_id = _from;
  insert into public.questions(id, version_id, position, type, text, help_text, required, min_value, max_value, max_choices)
  select m.new_id, _to, q.position, q.type, q.text, q.help_text, q.required, q.min_value, q.max_value, q.max_choices
    from public.questions q join _qmap m on m.old_id = q.id;

  insert into _omap select o.id, gen_random_uuid() from public.question_options o join _qmap m on m.old_id = o.question_id;
  insert into public.question_options(id, question_id, position, label, code, is_other)
  select om.new_id, qm.new_id, o.position, o.label, o.code, o.is_other
    from public.question_options o join _omap om on om.old_id = o.id join _qmap qm on qm.old_id = o.question_id;

  insert into public.question_conditions(question_id, depends_on_question_id, operator, option_id, numeric_value)
  select q1.new_id, q2.new_id, c.operator, om.new_id, c.numeric_value
    from public.question_conditions c
    join _qmap q1 on q1.old_id = c.question_id
    join _qmap q2 on q2.old_id = c.depends_on_question_id
    left join _omap om on om.old_id = c.option_id;
end $$;
revoke execute on function public.copy_questionnaire(uuid, uuid) from public, anon, authenticated;

-- Abre (ou retorna) o rascunho editável. Se houver versão publicada, o rascunho nasce como cópia dela.
create or replace function public.admin_open_draft_version(_survey uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_draft uuid; v_last uuid; v_next int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.surveys where id = _survey for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  select id into v_draft from public.questionnaire_versions where survey_id = _survey and status = 'draft';
  if v_draft is not null then return v_draft; end if;

  select id into v_last from public.questionnaire_versions where survey_id = _survey order by version desc limit 1;
  select coalesce(max(version), 0) + 1 into v_next from public.questionnaire_versions where survey_id = _survey;

  insert into public.questionnaire_versions(survey_id, version, status, created_by)
  values (_survey, v_next, 'draft', auth.uid()) returning id into v_draft;
  if v_last is not null then perform public.copy_questionnaire(v_last, v_draft); end if;
  return v_draft;
end $$;

-- Validação e publicação. A versão publicada vira imutável (snapshot congelado).
create or replace function public.admin_publish_version(_version uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.questionnaire_versions%rowtype;
  v_errors text[] := '{}';
  r record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.questionnaire_versions where id = _version for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v.status <> 'draft' then raise exception 'VERSION_LOCKED: somente rascunhos podem ser publicados'; end if;

  if not exists (select 1 from public.questions where version_id = _version) then
    v_errors := v_errors || 'O questionário precisa de pelo menos 1 pergunta.';
  end if;
  for r in
    select q.position, q.type, (select count(*) from public.question_options o where o.question_id = q.id) as n
      from public.questions q where q.version_id = _version order by q.position
  loop
    if r.type in ('single_choice', 'multiple_choice') and r.n < 2 then
      v_errors := v_errors || format('Pergunta %s: são necessárias ao menos 2 alternativas.', r.position);
    end if;
  end loop;
  for r in
    select q.position as pos, d.position as dep_pos, c.operator, c.option_id, c.numeric_value, d.type as dep_type
      from public.question_conditions c
      join public.questions q on q.id = c.question_id
      join public.questions d on d.id = c.depends_on_question_id
     where q.version_id = _version
  loop
    if r.dep_pos >= r.pos then
      v_errors := v_errors || format('Pergunta %s: a condição deve depender de uma pergunta anterior.', r.pos);
    end if;
    if r.operator in ('equals', 'not_equals', 'includes') and r.option_id is null then
      v_errors := v_errors || format('Pergunta %s: condição sem alternativa definida.', r.pos);
    end if;
    if r.operator in ('greater_than', 'less_than') and (r.numeric_value is null or r.dep_type <> 'numeric') then
      v_errors := v_errors || format('Pergunta %s: condição numérica inválida.', r.pos);
    end if;
  end loop;

  if array_length(v_errors, 1) > 0 then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(v_errors));
  end if;

  update public.questionnaire_versions set status = 'superseded', superseded_at = now()
   where survey_id = v.survey_id and status = 'published';
  update public.questionnaire_versions
     set status = 'published', published_at = now(), published_by = auth.uid(),
         snapshot = public.build_questionnaire_snapshot(_version)
   where id = _version;
  return jsonb_build_object('ok', true, 'version', v.version);
end $$;

-- Duplicar pesquisa (dados + último questionário como rascunho v1)
create or replace function public.admin_duplicate_survey(_survey uuid, _new_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_new uuid; v_last uuid; v_draft uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  insert into public.surveys(code, name, description, objective, municipality, state, coverage_area, start_date, end_date,
    target_total, sampling_method, sampling_type, responsible, notes, status, gps_policy, min_duration_seconds, created_by)
  select upper(_new_code), left(name || ' (cópia)', 160), description, objective, municipality, state, coverage_area, start_date, end_date,
    target_total, sampling_method, sampling_type, responsible, notes, 'draft', gps_policy, min_duration_seconds, auth.uid()
    from public.surveys where id = _survey
  returning id into v_new;
  if v_new is null then raise exception 'NOT_FOUND'; end if;

  insert into public.survey_targets(survey_id, municipality, neighborhood, sector, target)
  select v_new, municipality, neighborhood, sector, target from public.survey_targets where survey_id = _survey;

  select id into v_last from public.questionnaire_versions where survey_id = _survey order by version desc limit 1;
  if v_last is not null then
    insert into public.questionnaire_versions(survey_id, version, status, created_by)
    values (v_new, 1, 'draft', auth.uid()) returning id into v_draft;
    perform public.copy_questionnaire(v_last, v_draft);
  end if;
  return v_new;
end $$;

-- Transições de status da pesquisa com validação
create or replace function public.admin_set_survey_status(_survey uuid, _status public.survey_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.survey_status;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select status into v_old from public.surveys where id = _survey for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if _status in ('published', 'in_progress') and not exists (
     select 1 from public.questionnaire_versions where survey_id = _survey and status = 'published') then
    raise exception 'NO_PUBLISHED_QUESTIONNAIRE: publique o questionário antes de liberar a pesquisa';
  end if;
  if v_old = 'archived' and _status <> 'draft' then
    raise exception 'INVALID_TRANSITION: pesquisa arquivada só pode voltar a rascunho';
  end if;
  update public.surveys set status = _status where id = _survey;
end $$;

-- Permissões
do $$ declare f text; begin
  foreach f in array array[
    'admin_set_user_status(uuid, public.user_status, text)', 'admin_revoke_sessions(uuid)',
    'admin_assign_survey(uuid, uuid, integer)', 'admin_open_draft_version(uuid)',
    'admin_publish_version(uuid)', 'admin_duplicate_survey(uuid, text)',
    'admin_set_survey_status(uuid, public.survey_status)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
