-- ============================================================================
-- OPINEX CAMPO — 0007: Construtor de questionário (operações atômicas) e
-- resumos para as listagens do painel.
-- ============================================================================

-- Salva uma pergunta completa (pergunta + alternativas + condições) numa única transação.
-- payload: { id?, version_id, type, text, help_text, required, min_value, max_value, max_choices,
--            options: [{id?, label, is_other}], conditions: [{depends_on_question_id, operator, option_id?, numeric_value?}] }
create or replace function public.admin_save_question(_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(_payload ->> 'id', '')::uuid;
  v_version uuid := (_payload ->> 'version_id')::uuid;
  v_type public.question_type := (_payload ->> 'type')::public.question_type;
  v_opts jsonb := coalesce(_payload -> 'options', '[]'::jsonb);
  v_keep uuid[];
  v_pos int;
  o jsonb; i int := 0; v_oid uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.assert_version_editable(v_version);

  if v_type in ('single_choice', 'multiple_choice') then
    if jsonb_array_length(v_opts) > 8 then raise exception 'OPTION_LIMIT: limite de 8 alternativas por pergunta'; end if;
    if (select count(*) from jsonb_array_elements(v_opts) x where (x ->> 'is_other')::boolean) > 1 then
      raise exception 'INVALID_OPTIONS: apenas uma alternativa "Outro" por pergunta';
    end if;
  else
    v_opts := '[]'::jsonb;
  end if;

  if v_id is null then
    select coalesce(max(position), 0) + 1 into v_pos from public.questions where version_id = v_version;
    insert into public.questions(version_id, position, type, text, help_text, required, min_value, max_value, max_choices)
    values (v_version, v_pos, v_type, trim(_payload ->> 'text'), nullif(trim(coalesce(_payload ->> 'help_text', '')), ''),
            coalesce((_payload ->> 'required')::boolean, true),
            case when v_type = 'numeric' then (_payload ->> 'min_value')::numeric end,
            case when v_type = 'numeric' then (_payload ->> 'max_value')::numeric end,
            case when v_type = 'multiple_choice' then (_payload ->> 'max_choices')::int end)
    returning id into v_id;
  else
    update public.questions set type = v_type, text = trim(_payload ->> 'text'),
           help_text = nullif(trim(coalesce(_payload ->> 'help_text', '')), ''),
           required = coalesce((_payload ->> 'required')::boolean, true),
           min_value = case when v_type = 'numeric' then (_payload ->> 'min_value')::numeric end,
           max_value = case when v_type = 'numeric' then (_payload ->> 'max_value')::numeric end,
           max_choices = case when v_type = 'multiple_choice' then (_payload ->> 'max_choices')::int end
     where id = v_id and version_id = v_version;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;

  -- Alternativas: mantém ids existentes, remove as excluídas, renumera posições/códigos
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_keep
    from jsonb_array_elements(v_opts) x where nullif(x ->> 'id', '') is not null;
  delete from public.question_options where question_id = v_id and not (id = any(v_keep));
  update public.question_options set position = position + 100 where question_id = v_id;  -- libera posições
  for o in select * from jsonb_array_elements(v_opts) loop
    i := i + 1;
    v_oid := nullif(o ->> 'id', '')::uuid;
    if v_oid is not null and exists (select 1 from public.question_options where id = v_oid and question_id = v_id) then
      update public.question_options set position = i, label = trim(o ->> 'label'),
             is_other = coalesce((o ->> 'is_other')::boolean, false),
             code = case when coalesce((o ->> 'is_other')::boolean, false) then 99 else i end
       where id = v_oid;
    else
      insert into public.question_options(question_id, position, label, code, is_other)
      values (v_id, i, trim(o ->> 'label'), case when coalesce((o ->> 'is_other')::boolean, false) then 99 else i end,
              coalesce((o ->> 'is_other')::boolean, false));
    end if;
  end loop;

  -- Condições: substitui todas
  delete from public.question_conditions where question_id = v_id;
  insert into public.question_conditions(question_id, depends_on_question_id, operator, option_id, numeric_value)
  select v_id, (c ->> 'depends_on_question_id')::uuid, (c ->> 'operator')::public.condition_operator,
         nullif(c ->> 'option_id', '')::uuid, nullif(c ->> 'numeric_value', '')::numeric
    from jsonb_array_elements(coalesce(_payload -> 'conditions', '[]'::jsonb)) c
   where nullif(c ->> 'depends_on_question_id', '') is not null;

  return v_id;
end $$;

-- As renumerações temporárias (position + 100/1000) exigem remover o CHECK de faixa original.
-- Os limites de 30 perguntas e 8 alternativas continuam garantidos pelos triggers de guarda.
alter table public.question_options drop constraint if exists question_options_position_check;
alter table public.question_options add constraint question_options_position_positive check (position > 0);
alter table public.questions drop constraint if exists questions_position_check;
alter table public.questions add constraint questions_position_positive check (position > 0);

-- Reordena perguntas: _ids na nova ordem (todas as perguntas da versão)
create or replace function public.admin_reorder_questions(_version uuid, _ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.assert_version_editable(_version);
  if (select count(*) from public.questions where version_id = _version) <> coalesce(array_length(_ids, 1), 0) then
    raise exception 'INVALID_ORDER: lista de perguntas incompleta';
  end if;
  update public.questions set position = position + 1000 where version_id = _version;
  update public.questions q set position = x.ord
    from unnest(_ids) with ordinality as x(id, ord)
   where q.id = x.id and q.version_id = _version;
end $$;

-- Exclui pergunta e renumera as seguintes
create or replace function public.admin_delete_question(_question uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_version uuid; v_pos int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select version_id, position into v_version, v_pos from public.questions where id = _question;
  if v_version is null then raise exception 'NOT_FOUND'; end if;
  perform public.assert_version_editable(v_version);
  delete from public.questions where id = _question;
  update public.questions set position = position + 1000 where version_id = v_version and position > v_pos;
  update public.questions set position = position - 1001 where version_id = v_version and position > 1000;
end $$;

-- Duplica uma pergunta (logo após a original)
create or replace function public.admin_duplicate_question(_question uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q public.questions%rowtype; v_new uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into q from public.questions where id = _question;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.assert_version_editable(q.version_id);
  update public.questions set position = position + 1000 where version_id = q.version_id and position > q.position;
  insert into public.questions(version_id, position, type, text, help_text, required, min_value, max_value, max_choices)
  values (q.version_id, q.position + 1, q.type, left(q.text || ' (cópia)', 500), q.help_text, q.required, q.min_value, q.max_value, q.max_choices)
  returning id into v_new;
  insert into public.question_options(question_id, position, label, code, is_other)
  select v_new, position, label, code, is_other from public.question_options where question_id = _question;
  update public.questions set position = position - 999 where version_id = q.version_id and position > 1000;
  return v_new;
end $$;

-- Listagem de pesquisas com contadores
create or replace function public.admin_survey_overview()
returns table (id uuid, code text, name text, municipality text, state char(2), start_date date, end_date date,
               status public.survey_status, target_total int, published_version int, published_questions int,
               draft_version int, draft_questions int, interviews int, approved int, interviewers int, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select s.id, s.code, s.name, s.municipality, s.state, s.start_date, s.end_date, s.status, s.target_total,
    pv.version, (select count(*)::int from public.questions q where q.version_id = pv.id),
    dv.version, (select count(*)::int from public.questions q where q.version_id = dv.id),
    (select count(*)::int from public.interviews i where i.survey_id = s.id and i.status <> 'rejected'),
    (select count(*)::int from public.interviews i where i.survey_id = s.id and i.status = 'approved'),
    (select count(*)::int from public.survey_assignments a where a.survey_id = s.id and a.active),
    s.updated_at
  from public.surveys s
  left join public.questionnaire_versions pv on pv.survey_id = s.id and pv.status = 'published'
  left join public.questionnaire_versions dv on dv.survey_id = s.id and dv.status = 'draft'
  order by s.updated_at desc;
end $$;

-- Listagem de entrevistadores com produtividade
create or replace function public.admin_interviewer_overview()
returns table (id uuid, full_name text, email text, phone text, status public.user_status, status_reason text,
               created_at timestamptz, individual_target int, assigned_surveys int, active_devices int,
               interviews int, approved int, rejected int, pending int, last_interview_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, p.full_name, p.email, p.phone, p.status, p.status_reason, p.created_at,
    coalesce(ip.individual_target, 0),
    (select count(*)::int from public.survey_assignments a where a.interviewer_id = p.id and a.active),
    (select count(*)::int from public.devices d where d.interviewer_id = p.id and d.status = 'active'),
    coalesce(x.n, 0)::int, coalesce(x.a, 0)::int, coalesce(x.r, 0)::int, coalesce(x.p, 0)::int, x.last_at
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'interviewer'
  left join public.interviewer_profiles ip on ip.user_id = p.id
  left join (select interviewer_id, count(*) n, count(*) filter (where status = 'approved') a,
                    count(*) filter (where status = 'rejected') r,
                    count(*) filter (where status in ('received', 'under_review', 'needs_revision')) p,
                    max(submitted_at) last_at
               from public.interviews group by 1) x on x.interviewer_id = p.id
  order by (p.status = 'pending') desc, p.created_at desc;
end $$;

-- Atividade recente legível (para o painel)
create or replace function public.admin_recent_activity(_limit int default 12)
returns table (created_at timestamptz, action text, entity text, entity_id text, actor_name text, summary text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select l.created_at, l.action, l.entity, l.entity_id, p.full_name,
    coalesce(l.after_data ->> 'name', l.after_data ->> 'full_name', l.after_data ->> 'label', l.after_data ->> 'status', '')
  from public.audit_logs l left join public.profiles p on p.id = l.actor_id
  order by l.created_at desc limit least(greatest(_limit, 1), 50);
end $$;

do $$ declare f text; begin
  foreach f in array array['admin_save_question(jsonb)', 'admin_reorder_questions(uuid, uuid[])',
    'admin_delete_question(uuid)', 'admin_duplicate_question(uuid)', 'admin_survey_overview()',
    'admin_interviewer_overview()', 'admin_recent_activity(int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
