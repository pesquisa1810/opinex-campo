-- ============================================================================
-- OPINEX CAMPO — 0005: Entrevistas
-- begin_interview  -> valida tudo e abre sessão com horário do servidor
-- submit_interview -> revalida, valida respostas (inclui lógica condicional),
--                     grava de forma idempotente e calcula alertas de qualidade
-- Erros de negócio são devolvidos como {ok:false,error} para preservar logs.
-- ============================================================================

create or replace function public.err(_code text, _message text, _extra jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'error', _code, 'message', _message) || _extra
$$;

-- Validações comuns de usuário/dispositivo/pesquisa. Retorna null se tudo ok.
create or replace function public.validate_collection_context(_survey uuid, _device uuid, _secret text, _action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_dev text; v_survey public.survey_status;
begin
  if auth.uid() is null then return public.err('NOT_AUTHENTICATED', 'Sessão expirada. Entre novamente.'); end if;
  if not public.is_active_interviewer() then
    return public.err('INTERVIEWER_NOT_APPROVED', 'Seu cadastro não está aprovado para coleta.');
  end if;
  v_dev := public.check_device(_device, _secret);
  if v_dev = 'revoked' then
    perform public.write_audit('blocked_' || _action || '_revoked_device', 'devices', _device::text,
      null, jsonb_build_object('survey_id', _survey));
    return public.err('DEVICE_REVOKED', 'Este celular teve a autorização revogada. Procure o administrador.');
  elsif v_dev <> 'ok' then
    perform public.write_audit('blocked_' || _action || '_invalid_device', 'devices', coalesce(_device::text, ''),
      null, jsonb_build_object('survey_id', _survey, 'reason', v_dev));
    return public.err('DEVICE_NOT_AUTHORIZED', 'Este celular não está autorizado. Leia o QR Code de autorização.');
  end if;
  if not exists (select 1 from public.survey_assignments
                 where survey_id = _survey and interviewer_id = auth.uid() and active) then
    return public.err('NOT_ASSIGNED', 'Você não está atribuído a esta pesquisa.');
  end if;
  select status into v_survey from public.surveys where id = _survey;
  if v_survey is null or v_survey not in ('published', 'in_progress') then
    return public.err('SURVEY_NOT_ACTIVE', 'Esta pesquisa não está liberada para coleta no momento.');
  end if;
  return null;
end $$;
revoke execute on function public.validate_collection_context(uuid, uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------- Início ------
create or replace function public.begin_interview(_survey uuid, _device uuid, _secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_err jsonb; v_version public.questionnaire_versions%rowtype; v_session uuid; v_started timestamptz;
        v_s public.surveys%rowtype;
begin
  v_err := public.validate_collection_context(_survey, _device, _secret, 'begin');
  if v_err is not null then return v_err; end if;

  select * into v_version from public.questionnaire_versions where survey_id = _survey and status = 'published';
  if not found then return public.err('NO_PUBLISHED_QUESTIONNAIRE', 'Questionário ainda não publicado.'); end if;
  select * into v_s from public.surveys where id = _survey;

  insert into public.interview_sessions(survey_id, version_id, interviewer_id, device_id)
  values (_survey, v_version.id, auth.uid(), _device)
  returning id, started_at into v_session, v_started;

  return jsonb_build_object(
    'ok', true, 'session_id', v_session, 'started_at', v_started,
    'survey', jsonb_build_object('id', v_s.id, 'code', v_s.code, 'name', v_s.name, 'municipality', v_s.municipality,
                                 'state', v_s.state, 'gps_policy', v_s.gps_policy),
    'questionnaire', v_version.snapshot);
end $$;

-- ------------------------------------------- Avaliação de condições --------
-- _answers: objeto { question_id: {option_ids:[...], text_value, numeric_value} }
create or replace function public.condition_met(_cond jsonb, _answers jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  a jsonb := _answers -> (_cond ->> 'depends_on_question_id');
  op text := _cond ->> 'operator';
  has_opt boolean;
begin
  if a is null then return false; end if;                       -- pergunta de origem não respondida/oculta
  has_opt := coalesce(a -> 'option_ids', '[]'::jsonb) ? (_cond ->> 'option_id');
  return case op
    when 'equals' then has_opt
    when 'includes' then has_opt
    when 'not_equals' then not has_opt
    when 'greater_than' then (a ->> 'numeric_value')::numeric > (_cond ->> 'numeric_value')::numeric
    when 'less_than' then (a ->> 'numeric_value')::numeric < (_cond ->> 'numeric_value')::numeric
    when 'answered' then true
    else false end;
end $$;

-- ------------------------------------------------------------- Envio -------
create or replace function public.submit_interview(_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%rowtype;
  v_survey public.surveys%rowtype;
  v_snapshot jsonb;
  v_err jsonb;
  v_given jsonb := '{}'::jsonb;      -- respostas recebidas, indexadas por question_id
  v_valid jsonb := '{}'::jsonb;      -- respostas válidas de perguntas visíveis
  v_q jsonb; v_a jsonb; v_c jsonb;
  v_visible boolean; v_answered boolean;
  v_opts jsonb; v_sel jsonb; v_n int; v_num numeric; v_txt text;
  v_other_selected boolean;
  v_ignored int := 0; v_optional_blank int := 0;
  v_loc jsonb := coalesce(_payload -> 'location', '{}'::jsonb);
  v_perm text := coalesce(v_loc ->> 'permission', 'unavailable');
  v_mun text := trim(coalesce(_payload ->> 'municipality', ''));
  v_bai text := trim(coalesce(_payload ->> 'neighborhood', ''));
  v_sector text := nullif(trim(coalesce(_payload ->> 'sector', '')), '');
  v_duration int;
  v_fingerprint text;
  v_count int;
  k text;
begin
  if v_uid is null then return public.err('NOT_AUTHENTICATED', 'Sessão expirada. Entre novamente.'); end if;

  select * into v_session from public.interview_sessions
   where id = (_payload ->> 'session_id')::uuid and interviewer_id = v_uid for update;
  if not found then return public.err('SESSION_NOT_FOUND', 'Entrevista não encontrada. Inicie uma nova entrevista.'); end if;

  -- Idempotência: reenvio da mesma entrevista devolve a gravação existente
  if v_session.submitted_at is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'interview_id', v_session.id,
                              'submitted_at', v_session.submitted_at);
  end if;

  if (_payload ->> 'device_id')::uuid is distinct from v_session.device_id then
    perform public.write_audit('blocked_submit_device_mismatch', 'interview_sessions', v_session.id::text);
    return public.err('DEVICE_MISMATCH', 'A entrevista deve ser enviada pelo mesmo celular em que foi iniciada.');
  end if;

  v_err := public.validate_collection_context(v_session.survey_id, v_session.device_id, _payload ->> 'device_secret', 'submit');
  if v_err is not null then return v_err; end if;

  select * into v_survey from public.surveys where id = v_session.survey_id;
  select snapshot into v_snapshot from public.questionnaire_versions
   where id = v_session.version_id and status in ('published', 'superseded');
  if v_snapshot is null then return public.err('INVALID_VERSION', 'Versão do questionário inválida.'); end if;

  if char_length(v_mun) < 2 or char_length(v_bai) < 2 then
    return public.err('LOCATION_FIELDS_REQUIRED', 'Informe município e bairro.');
  end if;
  if v_perm not in ('granted', 'denied', 'unavailable', 'timeout') then v_perm := 'unavailable'; end if;
  if v_perm = 'granted' and ((v_loc ->> 'latitude') is null or (v_loc ->> 'longitude') is null) then
    v_perm := 'unavailable';
  end if;
  if v_survey.gps_policy = 'required' and v_perm <> 'granted' then
    return public.err('GPS_REQUIRED', 'Esta pesquisa exige a localização (GPS) do celular.');
  end if;

  -- Índice das respostas recebidas
  for v_a in select * from jsonb_array_elements(coalesce(_payload -> 'answers', '[]'::jsonb)) loop
    v_given := v_given || jsonb_build_object(v_a ->> 'question_id', v_a);
  end loop;
  for k in select jsonb_object_keys(v_given) loop
    if not exists (select 1 from jsonb_array_elements(v_snapshot -> 'questions') q where q ->> 'id' = k) then
      return public.err('INVALID_QUESTION', 'Resposta para pergunta inexistente nesta versão.');
    end if;
  end loop;

  -- Percorre as perguntas na ordem, avaliando visibilidade e validando
  for v_q in select q from jsonb_array_elements(v_snapshot -> 'questions') q order by (q ->> 'position')::int loop
    v_visible := true;
    for v_c in select * from jsonb_array_elements(coalesce(v_q -> 'conditions', '[]'::jsonb)) loop
      if not public.condition_met(v_c, v_valid) then v_visible := false; end if;
    end loop;

    v_a := v_given -> (v_q ->> 'id');
    if not v_visible then
      if v_a is not null then v_ignored := v_ignored + 1; end if;
      continue;
    end if;

    v_opts := coalesce(v_q -> 'options', '[]'::jsonb);
    v_sel := coalesce(v_a -> 'option_ids', '[]'::jsonb);
    v_n := jsonb_array_length(v_sel);
    v_txt := nullif(trim(coalesce(v_a ->> 'text_value', '')), '');
    v_num := case when coalesce(v_a ->> 'numeric_value', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                  then (v_a ->> 'numeric_value')::numeric end;

    v_answered := case v_q ->> 'type'
      when 'single_choice' then v_n > 0
      when 'multiple_choice' then v_n > 0
      when 'numeric' then v_num is not null
      else v_txt is not null end;

    if not v_answered then
      if (v_q ->> 'required')::boolean and v_q ->> 'type' <> 'observation' then
        return public.err('ANSWER_REQUIRED', format('A pergunta %s é obrigatória.', v_q ->> 'position'),
                          jsonb_build_object('position', (v_q ->> 'position')::int));
      end if;
      v_optional_blank := v_optional_blank + 1;
      continue;
    end if;

    if v_q ->> 'type' in ('single_choice', 'multiple_choice') then
      if (select count(*) from jsonb_array_elements_text(v_sel) s
           where not exists (select 1 from jsonb_array_elements(v_opts) o where o ->> 'id' = s)) > 0
         or (select count(distinct s) from jsonb_array_elements_text(v_sel) s) <> v_n then
        return public.err('INVALID_OPTION', format('Alternativa inválida na pergunta %s.', v_q ->> 'position'));
      end if;
      if v_q ->> 'type' = 'single_choice' and v_n <> 1 then
        return public.err('INVALID_OPTION', format('Escolha apenas uma alternativa na pergunta %s.', v_q ->> 'position'));
      end if;
      if v_q ->> 'type' = 'multiple_choice' and v_n > coalesce((v_q ->> 'max_choices')::int, jsonb_array_length(v_opts)) then
        return public.err('TOO_MANY_OPTIONS', format('Alternativas acima do limite na pergunta %s.', v_q ->> 'position'));
      end if;
      select exists (select 1 from jsonb_array_elements(v_opts) o
                      where (o ->> 'is_other')::boolean and v_sel ? (o ->> 'id')) into v_other_selected;
      if v_other_selected and nullif(trim(coalesce(v_a ->> 'other_text', '')), '') is null then
        return public.err('OTHER_TEXT_REQUIRED', format('Especifique a opção "Outro" na pergunta %s.', v_q ->> 'position'));
      end if;
      v_valid := v_valid || jsonb_build_object(v_q ->> 'id', jsonb_build_object(
        'option_ids', v_sel,
        'other_text', case when v_other_selected then left(trim(v_a ->> 'other_text'), 300) end));
    elsif v_q ->> 'type' = 'numeric' then
      if (v_q ->> 'min_value') is not null and v_num < (v_q ->> 'min_value')::numeric
         or (v_q ->> 'max_value') is not null and v_num > (v_q ->> 'max_value')::numeric then
        return public.err('NUMBER_OUT_OF_RANGE', format('Valor fora do intervalo na pergunta %s.', v_q ->> 'position'));
      end if;
      v_valid := v_valid || jsonb_build_object(v_q ->> 'id', jsonb_build_object('numeric_value', v_num));
    else
      v_valid := v_valid || jsonb_build_object(v_q ->> 'id', jsonb_build_object('text_value', left(v_txt, 2000)));
    end if;
  end loop;

  v_duration := greatest(0, extract(epoch from (now() - v_session.started_at))::int);
  select md5(string_agg(key || '=' || value::text, '|' order by key)) into v_fingerprint
    from jsonb_each(v_valid);

  insert into public.interviews(id, survey_id, version_id, interviewer_id, device_id, municipality, neighborhood, sector,
    started_at, finished_at, duration_seconds, answers_count, answers_fingerprint)
  values (v_session.id, v_session.survey_id, v_session.version_id, v_uid, v_session.device_id,
    left(v_mun, 120), left(v_bai, 120), left(v_sector, 120),
    v_session.started_at, now(), v_duration, (select count(*) from jsonb_object_keys(v_valid)), v_fingerprint);

  insert into public.interview_answers(interview_id, question_id, option_ids, text_value, numeric_value, other_text)
  select v_session.id, e.key::uuid,
         coalesce(array(select jsonb_array_elements_text(e.value -> 'option_ids'))::uuid[], '{}'),
         e.value ->> 'text_value', (e.value ->> 'numeric_value')::numeric, e.value ->> 'other_text'
    from jsonb_each(v_valid) e;

  insert into public.interview_locations(interview_id, permission, latitude, longitude, accuracy_m, captured_at)
  values (v_session.id, v_perm::public.gps_permission,
    case when v_perm = 'granted' then (v_loc ->> 'latitude')::double precision end,
    case when v_perm = 'granted' then (v_loc ->> 'longitude')::double precision end,
    case when v_perm = 'granted' then (v_loc ->> 'accuracy')::double precision end,
    case when v_perm = 'granted' then coalesce((v_loc ->> 'captured_at')::timestamptz, now()) end);

  update public.interview_sessions set submitted_at = now() where id = v_session.id;
  if v_survey.status = 'published' then
    update public.surveys set status = 'in_progress' where id = v_survey.id;
  end if;

  perform public.compute_quality_flags(v_session.id, v_ignored, v_optional_blank);
  select count(*) into v_count from public.quality_flags where interview_id = v_session.id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'interview_id', v_session.id,
                            'submitted_at', now(), 'flags', v_count);
end $$;

-- ------------------------------------------------- Controle de qualidade ---
-- Gera ALERTAS. Nunca rejeita automaticamente: a decisão é do administrador.
create or replace function public.compute_quality_flags(_interview uuid, _ignored int default 0, _optional_blank int default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i public.interviews%rowtype;
  s public.surveys%rowtype;
  l public.interview_locations%rowtype;
  v_single int; v_same int; v_dup_same int; v_dup_other int; v_overlap int; v_score int;
begin
  select * into i from public.interviews where id = _interview;
  select * into s from public.surveys where id = i.survey_id;
  select * into l from public.interview_locations where interview_id = _interview;
  delete from public.quality_flags where interview_id = _interview;

  if l.permission is distinct from 'granted' then
    insert into public.quality_flags(interview_id, code, severity, message, details)
    values (_interview, 'no_gps', 'warning', 'Entrevista sem localização GPS.', jsonb_build_object('permission', l.permission));
  elsif l.accuracy_m > 100 then
    insert into public.quality_flags(interview_id, code, severity, message, details)
    values (_interview, 'low_gps_accuracy', 'info', 'Precisão do GPS acima de 100 m.', jsonb_build_object('accuracy_m', l.accuracy_m));
  end if;

  if i.duration_seconds < s.min_duration_seconds then
    insert into public.quality_flags(interview_id, code, severity, message, details)
    values (_interview, 'short_duration', 'warning', 'Duração abaixo do mínimo configurado.',
            jsonb_build_object('duration_seconds', i.duration_seconds, 'min', s.min_duration_seconds));
  end if;

  if (s.start_date is not null and (i.submitted_at at time zone 'America/Sao_Paulo')::date < s.start_date)
     or (s.end_date is not null and (i.submitted_at at time zone 'America/Sao_Paulo')::date > s.end_date) then
    insert into public.quality_flags(interview_id, code, severity, message)
    values (_interview, 'outside_period', 'warning', 'Entrevista realizada fora do período da pesquisa.');
  end if;

  if _optional_blank > 0 then
    insert into public.quality_flags(interview_id, code, severity, message, details)
    values (_interview, 'missing_answers', 'info', 'Perguntas opcionais sem resposta.', jsonb_build_object('count', _optional_blank));
  end if;

  if _ignored > 0 then
    insert into public.quality_flags(interview_id, code, severity, message, details)
    values (_interview, 'inconsistent_answers', 'warning', 'Respostas enviadas para perguntas que não se aplicavam (descartadas).',
            jsonb_build_object('count', _ignored));
  end if;

  -- Padrão repetitivo: >=5 perguntas de escolha única, todas na mesma posição de alternativa
  select count(*), count(distinct o.position) into v_single, v_same
    from public.interview_answers a
    join public.questions q on q.id = a.question_id and q.type = 'single_choice'
    join public.question_options o on o.id = a.option_ids[1]
   where a.interview_id = _interview;
  if v_single >= 5 and v_same = 1 then
    insert into public.quality_flags(interview_id, code, severity, message, details)
    values (_interview, 'repetitive_pattern', 'warning', 'Todas as respostas de escolha única na mesma posição.',
            jsonb_build_object('questions', v_single));
  end if;

  -- Duplicidade: mesmas respostas na mesma pesquisa em até 7 dias
  if i.answers_fingerprint is not null and i.answers_count >= 3 then
    select count(*) filter (where interviewer_id = i.interviewer_id), count(*) filter (where interviewer_id <> i.interviewer_id)
      into v_dup_same, v_dup_other
      from public.interviews
     where survey_id = i.survey_id and id <> i.id and answers_fingerprint = i.answers_fingerprint
       and submitted_at > i.submitted_at - interval '7 days';
    if v_dup_same > 0 then
      insert into public.quality_flags(interview_id, code, severity, message, details)
      values (_interview, 'duplicate_same_interviewer', 'critical', 'Respostas idênticas a outra entrevista do mesmo entrevistador.',
              jsonb_build_object('matches', v_dup_same));
    elsif v_dup_other > 0 then
      insert into public.quality_flags(interview_id, code, severity, message, details)
      values (_interview, 'duplicate_answers', 'warning', 'Respostas idênticas a entrevista de outro entrevistador.',
              jsonb_build_object('matches', v_dup_other));
    end if;
  end if;

  -- Sobreposição de horário com outra entrevista do mesmo entrevistador
  select count(*) into v_overlap from public.interviews
   where interviewer_id = i.interviewer_id and id <> i.id
     and tstzrange(started_at, finished_at) && tstzrange(i.started_at, i.finished_at);
  if v_overlap > 0 then
    insert into public.quality_flags(interview_id, code, severity, message, details)
    values (_interview, 'overlapping_interviews', 'warning', 'Horário sobreposto a outra entrevista do mesmo entrevistador.',
            jsonb_build_object('matches', v_overlap));
  end if;

  select greatest(0, 100 - coalesce(sum(case severity when 'critical' then 40 when 'warning' then 15 else 5 end), 0))
    into v_score from public.quality_flags where interview_id = _interview;
  update public.interviews set quality_score = v_score where id = _interview;
end $$;

-- ------------------------------------------------------ Revisão (admin) ----
create or replace function public.admin_review_interview(_interview uuid, _status public.interview_status, _note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if _status in ('rejected', 'needs_revision') and coalesce(trim(_note), '') = '' then
    raise exception 'REASON_REQUIRED: informe a justificativa';
  end if;
  update public.interviews
     set status = _status, review_note = nullif(trim(_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = _interview;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

revoke execute on function public.compute_quality_flags(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.begin_interview(uuid, uuid, text) from public, anon;
revoke execute on function public.submit_interview(jsonb) from public, anon;
revoke execute on function public.admin_review_interview(uuid, public.interview_status, text) from public, anon;
grant execute on function public.begin_interview(uuid, uuid, text) to authenticated;
grant execute on function public.submit_interview(jsonb) to authenticated;
grant execute on function public.admin_review_interview(uuid, public.interview_status, text) to authenticated;
