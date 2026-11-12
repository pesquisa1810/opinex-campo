-- ============================================================================
-- Testes de fluxo e segurança do banco OPINEX CAMPO
-- Simula usuários reais trocando de papel (authenticated + auth.uid()).
-- Cada verificação imprime PASS; qualquer falha interrompe com ERROR.
-- ============================================================================
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema if not exists t;
create table t.ids (k text primary key, v text);
grant usage on schema t to authenticated;
grant select, insert, update on t.ids to authenticated;

create or replace function t.as_user(_email text) returns void language plpgsql as $$
declare v uuid;
begin
  execute 'reset role';
  select id into v from auth.users where email = _email;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function t.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;
create or replace function t.id(_k text) returns uuid language sql as $$ select v::uuid from t.ids where k = _k $$;
create or replace function t.put(_k text, _v text) returns void language sql as $$
  insert into t.ids values (_k, _v) on conflict (k) do update set v = excluded.v $$;
create or replace function t.pass(_msg text) returns void language plpgsql as $$
begin raise notice 'PASS: %', _msg; end $$;
grant execute on all functions in schema t to authenticated;

-- ------------------------------------------------------------ Cadastro -----
do $$ begin
  begin
    insert into auth.users(email, raw_user_meta_data) values ('semtermos@t.com', '{"full_name":"Sem Termos"}');
    raise exception 'deveria falhar';
  exception when others then
    if sqlerrm not like 'TERMS_NOT_ACCEPTED%' then raise; end if;
  end;
  perform t.pass('cadastro sem aceite de termos é recusado');
end $$;

insert into auth.users(email, raw_user_meta_data)
select e, jsonb_build_object('full_name', n, 'phone', '(11) 99999-0000', 'terms_version', '1.0', 'privacy_version', '1.0',
                             'role', 'admin')     -- tentativa de se autopromover via metadados
from (values ('admin@t.com', 'Admin Geral'), ('i1@t.com', 'Entrevistador Um'), ('i2@t.com', 'Entrevistador Dois'),
             ('i3@t.com', 'Entrevistador Tres'), ('i4@t.com', 'Entrevistador Quatro'), ('i5@t.com', 'Entrevistador Cinco'),
             ('i6@t.com', 'Entrevistador Seis'), ('i7@t.com', 'Entrevistador Sete')) x(e, n);

do $$ begin
  assert (select count(*) from public.profiles where status = 'pending') = 8, 'todos pendentes';
  assert not exists (select 1 from public.user_roles where role = 'admin'), 'nenhum admin pelo cadastro público';
  assert (select count(*) from public.privacy_acceptances) = 16, 'aceites registrados';
  assert (select count(*) from public.admin_notifications where kind = 'new_signup') = 8, 'notificações de cadastro';
  perform t.pass('cadastro público cria apenas entrevistadores PENDENTES (metadado role=admin ignorado)');
end $$;

-- Pendente não vê nada e não se autoaprova
select t.as_user('i1@t.com');
do $$ begin
  assert (select count(*) from public.surveys) = 0;
  begin
    update public.profiles set status = 'approved' where id = auth.uid();
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'FORBIDDEN%' then raise; end if; end;
  begin
    insert into public.user_roles(user_id, role) values (auth.uid(), 'admin');
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null; end;
  perform t.pass('entrevistador não altera o próprio status nem se torna admin');
end $$;
do $$ begin
  begin
    perform public.provision_first_admin('i1@t.com');
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null; end;
  perform t.pass('provision_first_admin bloqueado para usuários da aplicação');
end $$;
select t.as_postgres();

select public.provision_first_admin('admin@t.com');
do $$ begin
  begin perform public.provision_first_admin('i2@t.com'); raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'ADMIN_EXISTS%' then raise; end if; end;
  perform t.pass('primeiro admin provisionado uma única vez');
end $$;

-- ----------------------------------------------- Aprovação (admin) ---------
select t.as_user('admin@t.com');
do $$ declare u record; begin
  for u in select id from public.profiles where email ~ '^i[1-6]@' loop
    perform public.admin_set_user_status(u.id, 'approved');
  end loop;
  begin
    perform public.admin_set_user_status((select id from public.profiles where email = 'i7@t.com'), 'rejected');
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'REASON_REQUIRED%' then raise; end if; end;
  perform public.admin_set_user_status((select id from public.profiles where email = 'i7@t.com'), 'rejected', 'Dados incompletos');
  assert (select count(*) from public.profiles where status = 'approved') = 7;
  perform t.pass('admin aprova e rejeita (rejeição exige justificativa)');
end $$;

-- ------------------------------------------- Pesquisa e questionário -------
do $$ declare s uuid; v uuid; q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; oa uuid; ob uuid; oo uuid; i int;
begin
  insert into public.surveys(code, name, municipality, state, target_total, start_date, end_date, gps_policy, min_duration_seconds)
  values ('PESQ-01', 'Avaliação de serviços públicos', 'Campinas', 'SP', 400, current_date - 1, current_date + 30, 'optional', 120)
  returning id into s;
  perform t.put('survey', s::text);
  v := public.admin_open_draft_version(s);
  perform t.put('v1', v::text);

  insert into public.questions(version_id, position, type, text) values (v, 1, 'single_choice', 'Usa o posto de saúde?') returning id into q1;
  insert into public.question_options(question_id, position, label, code) values (q1, 1, 'Sim', 1) returning id into oa;
  insert into public.question_options(question_id, position, label, code) values (q1, 2, 'Não', 2) returning id into ob;
  insert into public.question_options(question_id, position, label, code, is_other) values (q1, 3, 'Outro', 99, true) returning id into oo;
  insert into public.questions(version_id, position, type, text, min_value, max_value) values (v, 2, 'numeric', 'Nota de 0 a 10', 0, 10) returning id into q2;
  insert into public.question_conditions(question_id, depends_on_question_id, operator, option_id) values (q2, q1, 'equals', oa);
  insert into public.questions(version_id, position, type, text, max_choices) values (v, 3, 'multiple_choice', 'Principais problemas', 2) returning id into q3;
  for i in 1..4 loop insert into public.question_options(question_id, position, label, code) values (q3, i, 'Problema ' || i, i); end loop;
  insert into public.questions(version_id, position, type, text, required) values (v, 4, 'open_text', 'Sugestões', false) returning id into q4;
  insert into public.questions(version_id, position, type, text, required) values (v, 5, 'observation', 'Observações do entrevistador', false) returning id into q5;
  perform t.put('q1', q1::text); perform t.put('q2', q2::text); perform t.put('q3', q3::text); perform t.put('q4', q4::text);
  perform t.put('oa', oa::text); perform t.put('ob', ob::text); perform t.put('oo', oo::text);

  -- Limite de 8 alternativas
  for i in 5..8 loop insert into public.question_options(question_id, position, label, code) values (q3, i, 'Problema ' || i, i); end loop;
  begin
    insert into public.question_options(question_id, position, label, code) values (q3, 9, 'Nona', 9);
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'OPTION_LIMIT%' and sqlerrm not like '%question_options_position_check%' then raise; end if; end;
  perform t.pass('limite de 8 alternativas por pergunta');

  -- Limite de 30 perguntas (num rascunho de outra pesquisa)
  insert into public.surveys(code, name) values ('LIMITE', 'Teste de limite') returning id into s;
  v := public.admin_open_draft_version(s);
  for i in 1..30 loop insert into public.questions(version_id, position, type, text) values (v, i, 'open_text', 'P' || i); end loop;
  begin
    insert into public.questions(version_id, position, type, text) values (v, 31, 'open_text', 'P31');
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'QUESTION_LIMIT%' then raise; end if; end;
  perform t.pass('limite de 30 perguntas por questionário');
end $$;

do $$ declare r jsonb; begin
  r := public.admin_publish_version(t.id('v1'));
  assert (r ->> 'ok')::boolean, r::text;
  begin
    update public.questions set text = 'Alterado' where id = t.id('q1');
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'VERSION_LOCKED%' then raise; end if; end;
  begin
    perform public.admin_publish_version(t.id('v1'));
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'VERSION_LOCKED%' then raise; end if; end;
  perform t.pass('questionário publicado é imutável');

  perform public.admin_assign_survey(t.id('survey'), (select id from public.profiles where email = 'i1@t.com'), 50);
  perform public.admin_assign_survey(t.id('survey'), (select id from public.profiles where email = 'i2@t.com'), 50);
  begin
    perform public.admin_assign_survey(t.id('survey'), (select id from public.profiles where email = 'i7@t.com'), 50);
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'INTERVIEWER_NOT_APPROVED%' then raise; end if; end;
  perform public.admin_set_survey_status(t.id('survey'), 'published');
  perform t.pass('atribuição somente para entrevistadores aprovados; pesquisa publicada');
end $$;
select t.as_postgres();

-- ---------------------------------------------------------- Dispositivos ---
-- Entrevistador não emite QR
select t.as_user('i1@t.com');
do $$ begin
  begin perform public.admin_create_device_authorization(auth.uid()); raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'FORBIDDEN%' then raise; end if; end;
  perform t.pass('entrevistador não consegue emitir autorização de dispositivo');
end $$;
select t.as_postgres();

-- Emite e consome para i1..i5
do $$ declare n int; r jsonb; begin
  for n in 1..5 loop
    perform t.as_user('admin@t.com');
    r := public.admin_create_device_authorization((select id from public.profiles where email = 'i' || n || '@t.com'));
    perform t.put('tok' || n, r ->> 'token');
    perform t.as_postgres();
  end loop;
end $$;
do $$ declare n int; r jsonb; begin
  for n in 1..5 loop
    perform t.as_user('i' || n || '@t.com');
    r := public.consume_device_authorization((select v from t.ids where k = 'tok' || n), repeat('k', 30) || 'dev' || n, 'Android Chrome', 'UA');
    assert (r ->> 'ok')::boolean, r::text;
    perform t.put('dev' || n, r ->> 'device_id'); perform t.put('sec' || n, r ->> 'device_secret');
    perform t.as_postgres();
  end loop;
  assert (select count(*) from public.devices where status = 'active') = 5;
  perform t.pass('5 dispositivos autorizados por QR Code');
end $$;

-- Reutilização do QR
select t.as_user('i1@t.com');
do $$ declare r jsonb; begin
  r := public.consume_device_authorization((select v from t.ids where k = 'tok1'), repeat('z', 40), 'Outro', 'UA');
  assert r ->> 'error' = 'TOKEN_ALREADY_USED', r::text;
  perform t.pass('QR Code de uso único (reutilização bloqueada)');
end $$;
select t.as_postgres();

-- 6º dispositivo bloqueado já na emissão
select t.as_user('admin@t.com');
do $$ begin
  begin perform public.admin_create_device_authorization((select id from public.profiles where email = 'i6@t.com'));
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'DEVICE_LIMIT_REACHED%' then raise; end if; end;
  assert (public.device_slots() ->> 'active')::int = 5;
  perform t.pass('sexto dispositivo bloqueado (limite global de 5)');
end $$;
select t.as_postgres();

-- Defesa em profundidade: inserção direta do 6º também falha
do $$ begin
  begin
    insert into public.devices(interviewer_id, label, device_key_hash, secret_hash)
    values ((select id from public.profiles where email = 'i6@t.com'), 'x', 'x', 'x');
    raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'DEVICE_LIMIT_REACHED%' then raise; end if; end;
  perform t.pass('trigger impede 6º dispositivo mesmo por inserção direta');
end $$;

-- Entrevistador não insere dispositivo diretamente
select t.as_user('i6@t.com');
do $$ begin
  begin
    insert into public.devices(interviewer_id, label, device_key_hash, secret_hash) values (auth.uid(), 'x', 'x', 'x');
    raise exception 'deveria falhar';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm not like 'DEVICE_LIMIT_REACHED%' then raise; end if;
  end;
  perform t.pass('entrevistador não cria dispositivo sem QR Code (com limite cheio)');
end $$;
select t.as_postgres();

-- ------------------------------------------------------------ Entrevistas --
select t.as_user('i3@t.com');
do $$ declare r jsonb; begin
  r := public.begin_interview(t.id('survey'), t.id('dev3'), (select v from t.ids where k = 'sec3'));
  assert r ->> 'error' = 'NOT_ASSIGNED', r::text;
  perform t.pass('entrevistador não atribuído não inicia entrevista');
end $$;
select t.as_postgres();

select t.as_user('i1@t.com');
do $$ declare r jsonb; sid uuid; base jsonb; begin
  r := public.begin_interview(t.id('survey'), t.id('dev2'), (select v from t.ids where k = 'sec2'));
  assert r ->> 'error' = 'DEVICE_NOT_AUTHORIZED', r::text;
  r := public.begin_interview(t.id('survey'), t.id('dev1'), 'segredo-errado');
  assert r ->> 'error' = 'DEVICE_NOT_AUTHORIZED', r::text;
  perform t.pass('dispositivo de outro entrevistador / segredo inválido é recusado');

  r := public.begin_interview(t.id('survey'), t.id('dev1'), (select v from t.ids where k = 'sec1'));
  assert (r ->> 'ok')::boolean, r::text;
  assert jsonb_array_length(r -> 'questionnaire' -> 'questions') = 5;
  sid := (r ->> 'session_id')::uuid;
  perform t.put('s1', sid::text);

  base := jsonb_build_object('session_id', sid, 'device_id', t.id('dev1'), 'device_secret', (select v from t.ids where k = 'sec1'),
    'municipality', 'Campinas', 'neighborhood', 'Centro', 'sector', 'Setor 1',
    'location', jsonb_build_object('permission', 'granted', 'latitude', -22.9, 'longitude', -47.06, 'accuracy', 12));

  -- Q3 obrigatória faltando
  r := public.submit_interview(base || jsonb_build_object('answers', jsonb_build_array(
        jsonb_build_object('question_id', t.id('q1'), 'option_ids', jsonb_build_array(t.id('ob'))))));
  assert r ->> 'error' = 'ANSWER_REQUIRED' and (r ->> 'position')::int = 3, r::text;
  perform t.pass('obrigatoriedade validada no servidor');

  -- Q1 = Sim torna Q2 visível e obrigatória
  r := public.submit_interview(base || jsonb_build_object('answers', jsonb_build_array(
        jsonb_build_object('question_id', t.id('q1'), 'option_ids', jsonb_build_array(t.id('oa'))),
        jsonb_build_object('question_id', t.id('q3'), 'option_ids', jsonb_build_array((select id from public.question_options where question_id = t.id('q3') and position = 1))))));
  assert r ->> 'error' = 'ANSWER_REQUIRED' and (r ->> 'position')::int = 2, r::text;
  -- Fora do intervalo
  r := public.submit_interview(base || jsonb_build_object('answers', jsonb_build_array(
        jsonb_build_object('question_id', t.id('q1'), 'option_ids', jsonb_build_array(t.id('oa'))),
        jsonb_build_object('question_id', t.id('q2'), 'numeric_value', 11),
        jsonb_build_object('question_id', t.id('q3'), 'option_ids', jsonb_build_array((select id from public.question_options where question_id = t.id('q3') and position = 1))))));
  assert r ->> 'error' = 'NUMBER_OUT_OF_RANGE', r::text;
  -- Múltipla acima do limite (max 2)
  r := public.submit_interview(base || jsonb_build_object('answers', jsonb_build_array(
        jsonb_build_object('question_id', t.id('q1'), 'option_ids', jsonb_build_array(t.id('ob'))),
        jsonb_build_object('question_id', t.id('q3'), 'option_ids', (select jsonb_agg(id) from public.question_options where question_id = t.id('q3') and position <= 3)))));
  assert r ->> 'error' = 'TOO_MANY_OPTIONS', r::text;
  -- "Outro" sem especificar
  r := public.submit_interview(base || jsonb_build_object('answers', jsonb_build_array(
        jsonb_build_object('question_id', t.id('q1'), 'option_ids', jsonb_build_array(t.id('oo'))),
        jsonb_build_object('question_id', t.id('q3'), 'option_ids', jsonb_build_array((select id from public.question_options where question_id = t.id('q3') and position = 1))))));
  assert r ->> 'error' = 'OTHER_TEXT_REQUIRED', r::text;
  perform t.pass('condicionais, intervalo numérico, limite de múltipla escolha e "Outro" validados');

  -- Envio válido: Q1 = Não (Q2 oculta) mas manda Q2 mesmo assim -> descartada e sinalizada
  r := public.submit_interview(base || jsonb_build_object('answers', jsonb_build_array(
        jsonb_build_object('question_id', t.id('q1'), 'option_ids', jsonb_build_array(t.id('ob'))),
        jsonb_build_object('question_id', t.id('q2'), 'numeric_value', 7),
        jsonb_build_object('question_id', t.id('q3'), 'option_ids', jsonb_build_array((select id from public.question_options where question_id = t.id('q3') and position = 2))))));
  assert (r ->> 'ok')::boolean and not (r ->> 'duplicate')::boolean, r::text;
  assert (select count(*) from public.interview_answers where interview_id = sid) = 2, 'Q2 oculta descartada';
  -- Reenvio idempotente
  r := public.submit_interview(base || jsonb_build_object('answers', '[]'::jsonb));
  assert (r ->> 'ok')::boolean and (r ->> 'duplicate')::boolean, r::text;
  assert (select count(*) from public.interviews) = 1;
  perform t.pass('entrevista gravada; reenvio não duplica (idempotência)');
end $$;
select t.as_postgres();

do $$ begin
  assert exists (select 1 from public.quality_flags where interview_id = t.id('s1') and code = 'short_duration');
  assert exists (select 1 from public.quality_flags where interview_id = t.id('s1') and code = 'inconsistent_answers');
  assert exists (select 1 from public.quality_flags where interview_id = t.id('s1') and code = 'missing_answers');
  assert (select status from public.interviews where id = t.id('s1')) = 'received', 'nunca rejeita automaticamente';
  assert (select status from public.surveys where id = t.id('survey')) = 'in_progress';
  assert (select permission from public.interview_locations where interview_id = t.id('s1')) = 'granted';
  perform t.pass('alertas de qualidade gerados sem rejeição automática; GPS gravado');
end $$;

-- Isolamento entre entrevistadores
select t.as_user('i2@t.com');
do $$ begin
  assert (select count(*) from public.interviews) = 0, 'não vê entrevistas de terceiros';
  assert (select count(*) from public.interview_answers) = 0;
  assert (select count(*) from public.interview_locations) = 0;
  assert (select count(*) from public.quality_flags) = 0;
  assert (select count(*) from public.audit_logs) = 0;
  assert (select count(*) from public.devices) = 1, 'vê só o próprio dispositivo';
  assert (select count(*) from public.profiles) = 1, 'vê só o próprio perfil';
  assert (select count(*) from public.device_authorizations) = 0;
  begin perform public.admin_dashboard(); raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'FORBIDDEN%' then raise; end if; end;
  begin perform public.admin_survey_results(t.id('survey')); raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'FORBIDDEN%' then raise; end if; end;
  begin update public.questions set text = 'x' where id = t.id('q1');
    if found then raise exception 'não deveria alterar'; end if;
  exception when others then if sqlerrm like 'não deveria%' then raise; end if; end;
  begin perform public.admin_review_interview(t.id('s1'), 'approved'); raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'FORBIDDEN%' then raise; end if; end;
  assert (select count(*) from public.surveys) = 1, 'vê somente a pesquisa atribuída';
  perform t.pass('entrevistador isolado: sem dados alheios, resultados, localização ou funções administrativas');
end $$;
select t.as_postgres();

-- Interviews não podem ser alteradas pelo autor
select t.as_user('i1@t.com');
do $$ begin
  update public.interviews set municipality = 'Fraude' where id = t.id('s1');
  assert (select municipality from public.interviews where id = t.id('s1')) = 'Campinas';
  perform t.pass('entrevista enviada não pode ser alterada pelo entrevistador');
end $$;
select t.as_postgres();

-- ------------------------------------------------------------ Revogação ----
select t.as_user('i1@t.com');
do $$ declare r jsonb; begin
  r := public.begin_interview(t.id('survey'), t.id('dev1'), (select v from t.ids where k = 'sec1'));
  perform t.put('s_open', r ->> 'session_id');
end $$;
select t.as_user('admin@t.com');
select public.admin_revoke_device(t.id('dev1'), 'Teste de revogação');
select t.as_user('i1@t.com');
do $$ declare r jsonb; begin
  r := public.begin_interview(t.id('survey'), t.id('dev1'), (select v from t.ids where k = 'sec1'));
  assert r ->> 'error' = 'DEVICE_REVOKED', r::text;
  r := public.submit_interview(jsonb_build_object('session_id', t.id('s_open'), 'device_id', t.id('dev1'),
        'device_secret', (select v from t.ids where k = 'sec1'), 'municipality', 'Campinas', 'neighborhood', 'Centro',
        'answers', jsonb_build_array(jsonb_build_object('question_id', t.id('q1'), 'option_ids', jsonb_build_array(t.id('ob'))),
          jsonb_build_object('question_id', t.id('q3'), 'option_ids', jsonb_build_array((select id from public.question_options where question_id = t.id('q3') and position = 1))))));
  assert r ->> 'error' = 'DEVICE_REVOKED', r::text;
end $$;
select t.as_postgres();
do $$ begin
  assert (select count(*) from public.audit_logs where action like 'blocked_%_revoked_device') = 2;
  assert (select count(*) from public.interviews) = 1;
  perform t.pass('dispositivo revogado bloqueado no início e no envio; tentativas auditadas');
end $$;

-- Com vaga livre, a RLS sozinha impede o entrevistador de criar dispositivo
select t.as_user('i6@t.com');
do $$ begin
  begin
    insert into public.devices(interviewer_id, label, device_key_hash, secret_hash) values (auth.uid(), 'x', 'x', 'x');
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null; end;
  perform t.pass('entrevistador não cria dispositivo sem QR Code (com vaga livre: bloqueio por RLS)');
end $$;
select t.as_postgres();

-- Vaga liberada: QR expirado não serve
select t.as_user('admin@t.com');
do $$ declare r jsonb; begin
  r := public.admin_create_device_authorization((select id from public.profiles where email = 'i6@t.com'));
  perform t.put('tok6', r ->> 'token');
end $$;
select t.as_postgres();
update public.device_authorizations set expires_at = now() - interval '1 second'
 where token_hash = public.sha256_hex((select v from t.ids where k = 'tok6'));
select t.as_user('i6@t.com');
do $$ declare r jsonb; begin
  r := public.consume_device_authorization((select v from t.ids where k = 'tok6'), repeat('q', 40), 'iPhone Safari', 'UA');
  assert r ->> 'error' = 'TOKEN_EXPIRED', r::text;
  perform t.pass('QR Code expirado (validade de 5 minutos) é recusado');
  -- Token de outro usuário
  r := public.consume_device_authorization((select v from t.ids where k = 'tok2'), repeat('q', 40), 'iPhone', 'UA');
  assert r ->> 'error' in ('INVALID_TOKEN', 'TOKEN_ALREADY_USED'), r::text;
  assert r ->> 'error' = 'INVALID_TOKEN', 'não revela que o token existe para outro usuário';
  perform t.pass('QR Code de outro entrevistador é recusado');
end $$;
-- Força bruta
do $$ declare r jsonb; i int; begin
  for i in 1..12 loop
    r := public.consume_device_authorization(md5(i::text) || md5((i + 100)::text), repeat('q', 40), 'x', 'x');
  end loop;
  assert r ->> 'error' = 'TOO_MANY_ATTEMPTS', r::text;
  perform t.pass('proteção contra força bruta na leitura de QR Code');
end $$;
select t.as_postgres();

-- ------------------------------------------------------------ Versionamento --
select t.as_user('admin@t.com');
do $$ declare v2 uuid; r jsonb; begin
  v2 := public.admin_open_draft_version(t.id('survey'));
  assert v2 <> t.id('v1');
  assert (select count(*) from public.questions where version_id = v2) = 5, 'rascunho copia a versão anterior';
  assert (select count(*) from public.question_conditions c join public.questions q on q.id = c.question_id where q.version_id = v2) = 1;
  update public.questions set text = 'Nota de 0 a 10 (revisada)' where version_id = v2 and position = 2;
  r := public.admin_publish_version(v2);
  assert (r ->> 'ok')::boolean, r::text;
  assert (select status from public.questionnaire_versions where id = t.id('v1')) = 'superseded';
  assert (select version_id from public.interviews where id = t.id('s1')) = t.id('v1'), 'entrevista mantém versão original';
  assert (select snapshot -> 'questions' -> 1 ->> 'text' from public.questionnaire_versions where id = t.id('v1')) = 'Nota de 0 a 10';
  perform t.pass('versionamento: nova versão não altera entrevistas anteriores');
end $$;

-- ------------------------------------------------------- Revisão e status --
do $$ declare r jsonb; begin
  begin perform public.admin_review_interview(t.id('s1'), 'rejected'); raise exception 'deveria falhar';
  exception when others then if sqlerrm not like 'REASON_REQUIRED%' then raise; end if; end;
  perform public.admin_review_interview(t.id('s1'), 'approved', 'Conferida');
  assert (select status from public.interviews where id = t.id('s1')) = 'approved';

  r := public.admin_survey_results(t.id('survey'));
  assert (r ->> 'interviews_included')::int = 1, r::text;
  assert (r -> 'questions' -> 0 ->> 'valid_responses')::int = 1, r::text;
  r := public.admin_dashboard();
  assert (r ->> 'interviews_approved')::int = 1 and (r ->> 'devices_active')::int = 4, r::text;
  perform t.pass('revisão com justificativa; resultados e painel com dados reais');
end $$;
select t.as_postgres();

-- Bloqueio revoga dispositivos e sessões
insert into auth.sessions(user_id) select id from auth.users where email = 'i2@t.com';
select t.as_user('admin@t.com');
select public.admin_set_user_status((select id from public.profiles where email = 'i2@t.com'), 'blocked', 'Conduta inadequada');
select t.as_postgres();
do $$ begin
  assert (select status from public.devices where id = t.id('dev2')) = 'revoked';
  assert not exists (select 1 from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'i2@t.com');
  perform t.pass('bloqueio revoga dispositivos e encerra sessões');
end $$;
select t.as_user('i2@t.com');
do $$ begin
  assert (select count(*) from public.surveys) = 0, 'bloqueado perde acesso imediato';
  perform t.pass('usuário bloqueado perde acesso imediatamente (RLS)');
end $$;
select t.as_postgres();

do $$ begin
  assert (select count(*) from public.audit_logs) > 20;
  perform t.pass('operações administrativas registradas em audit_logs');
end $$;
