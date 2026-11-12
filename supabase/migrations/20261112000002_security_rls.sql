-- ============================================================================
-- OPINEX CAMPO — 0002: Autorização, cadastro, travas de integridade, auditoria e RLS
-- ============================================================================

-- ----------------------------------------------------- Funções de papel ----
-- SECURITY DEFINER evita recursão de RLS ao consultar user_roles/profiles.
create or replace function public.has_role(_user uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = _user and r.role = _role and p.status = 'approved'
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(auth.uid(), 'admin')
$$;

create or replace function public.is_active_interviewer()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(auth.uid(), 'interviewer')
$$;

create or replace function public.is_assigned_to(_survey uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_interviewer() and exists (
    select 1 from public.survey_assignments a
    where a.survey_id = _survey and a.interviewer_id = auth.uid() and a.active
  )
$$;

-- Escrita em audit_logs (uso interno)
create or replace function public.write_audit(_action text, _entity text, _entity_id text,
  _before jsonb default null, _after jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs(actor_id, action, entity, entity_id, before_data, after_data)
  values (auth.uid(), _action, _entity, _entity_id, _before, _after)
$$;

-- --------------------------------------------- Cadastro público (signup) ----
-- Todo usuário criado pelo Supabase Auth vira ENTREVISTADOR PENDENTE.
-- O cadastro público NUNCA cria administrador (ver provision_first_admin).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_terms text := meta ->> 'terms_version';
  v_privacy text := meta ->> 'privacy_version';
  v_name text := trim(coalesce(meta ->> 'full_name', ''));
begin
  if v_terms is null or v_privacy is null then
    raise exception 'TERMS_NOT_ACCEPTED: é obrigatório aceitar os termos de uso e o aviso de privacidade';
  end if;
  if char_length(v_name) < 3 then
    raise exception 'INVALID_NAME: informe o nome completo';
  end if;

  insert into public.profiles(id, full_name, email, phone, status)
  values (new.id, v_name, coalesce(new.email, ''), nullif(trim(meta ->> 'phone'), ''), 'pending');

  insert into public.user_roles(user_id, role) values (new.id, 'interviewer');
  insert into public.interviewer_profiles(user_id) values (new.id);

  insert into public.privacy_acceptances(user_id, document, document_version) values
    (new.id, 'terms_of_use', v_terms),
    (new.id, 'privacy_notice', v_privacy);

  insert into public.admin_notifications(kind, title, body, link)
  values ('new_signup', 'Novo cadastro de entrevistador', v_name || ' aguarda aprovação.', '/admin/entrevistadores?status=pending');

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Provisionamento seguro do PRIMEIRO administrador.
-- Executável apenas pelo dono do banco (SQL Editor do Supabase / service_role).
-- Recusa-se a rodar se já existir um administrador.
create or replace function public.provision_first_admin(_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'ADMIN_EXISTS: já existe administrador. Use promote_admin por um administrador.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(_email);
  if v_id is null then
    raise exception 'USER_NOT_FOUND: cadastre-se primeiro pela página /cadastro com este e-mail';
  end if;
  insert into public.user_roles(user_id, role) values (v_id, 'admin') on conflict do nothing;
  delete from public.user_roles where user_id = v_id and role = 'interviewer';
  delete from public.interviewer_profiles where user_id = v_id;
  update public.profiles set status = 'approved', status_changed_at = now() where id = v_id;
  insert into public.audit_logs(actor_id, action, entity, entity_id)
  values (null, 'provision_first_admin', 'profiles', v_id::text);
  return 'Administrador provisionado: ' || _email;
end $$;
revoke all on function public.provision_first_admin(text) from public, anon, authenticated;

-- -------------------------------------------------- Proteção de perfil -----
-- Usuário comum só altera nome e telefone. Status/e-mail só via administrador.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;        -- service_role / SQL Editor
  if public.is_admin() then return new; end if;
  if new.status is distinct from old.status
     or new.email is distinct from old.email
     or new.status_reason is distinct from old.status_reason
     or new.status_changed_at is distinct from old.status_changed_at
     or new.status_changed_by is distinct from old.status_changed_by
     or new.id is distinct from old.id then
    raise exception 'FORBIDDEN: alteração não permitida';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ------------------------------------- Travas do questionário/versões ------
create or replace function public.assert_version_editable(_version uuid)
returns void language plpgsql set search_path = '' as $$
declare v_status public.version_status;
begin
  select status into v_status from public.questionnaire_versions where id = _version;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'VERSION_LOCKED: versão publicada não pode ser alterada; crie uma nova versão';
  end if;
end $$;

create or replace function public.guard_question_change()
returns trigger language plpgsql set search_path = '' as $$
declare v_count int;
begin
  if tg_op = 'DELETE' then
    perform public.assert_version_editable(old.version_id);
    return old;
  end if;
  perform public.assert_version_editable(new.version_id);
  if tg_op = 'UPDATE' and new.version_id <> old.version_id then
    raise exception 'FORBIDDEN: não é possível mover pergunta entre versões';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.questions where version_id = new.version_id;
    if v_count >= 30 then
      raise exception 'QUESTION_LIMIT: limite de 30 perguntas por questionário';
    end if;
  end if;
  return new;
end $$;
create trigger questions_guard before insert or update or delete on public.questions
  for each row execute function public.guard_question_change();

create or replace function public.guard_option_change()
returns trigger language plpgsql set search_path = '' as $$
declare v_version uuid; v_count int; v_qid uuid := coalesce(new.question_id, old.question_id);
begin
  select version_id into v_version from public.questions where id = v_qid;
  perform public.assert_version_editable(v_version);
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.question_options where question_id = new.question_id;
    if v_count >= 8 then
      raise exception 'OPTION_LIMIT: limite de 8 alternativas por pergunta';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger question_options_guard before insert or update or delete on public.question_options
  for each row execute function public.guard_option_change();

create or replace function public.guard_condition_change()
returns trigger language plpgsql set search_path = '' as $$
declare v_v1 uuid; v_v2 uuid; v_p1 int; v_p2 int;
begin
  if tg_op = 'DELETE' then
    select version_id into v_v1 from public.questions where id = old.question_id;
    perform public.assert_version_editable(v_v1);
    return old;
  end if;
  select version_id, position into v_v1, v_p1 from public.questions where id = new.question_id;
  select version_id, position into v_v2, v_p2 from public.questions where id = new.depends_on_question_id;
  perform public.assert_version_editable(v_v1);
  if v_v1 <> v_v2 then raise exception 'INVALID_CONDITION: perguntas de versões diferentes'; end if;
  if new.option_id is not null and not exists (
    select 1 from public.question_options o where o.id = new.option_id and o.question_id = new.depends_on_question_id) then
    raise exception 'INVALID_CONDITION: alternativa não pertence à pergunta de origem';
  end if;
  return new;
end $$;
create trigger question_conditions_guard before insert or update or delete on public.question_conditions
  for each row execute function public.guard_condition_change();

create or replace function public.guard_version_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.surveys where id = old.survey_id) then
      raise exception 'VERSION_LOCKED: versões publicadas não podem ser excluídas';
    end if;
    return old;
  end if;
  if old.status = 'published' and new.status not in ('published', 'superseded') then
    raise exception 'VERSION_LOCKED: transição de status inválida';
  end if;
  if old.status = 'superseded' and new.status <> 'superseded' then
    raise exception 'VERSION_LOCKED: versão substituída é definitiva';
  end if;
  if old.snapshot is not null and new.snapshot is distinct from old.snapshot then
    raise exception 'VERSION_LOCKED: snapshot publicado é imutável';
  end if;
  if new.survey_id <> old.survey_id or new.version <> old.version then
    raise exception 'VERSION_LOCKED: identificação da versão é imutável';
  end if;
  return new;
end $$;
create trigger questionnaire_versions_guard before update or delete on public.questionnaire_versions
  for each row execute function public.guard_version_update();

-- ------------------------------------------------- Auditoria automática ----
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, action, entity, entity_id, before_data, after_data)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
             (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'user_id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_surveys after insert or update or delete on public.surveys
  for each row execute function public.audit_row_change();
create trigger audit_survey_assignments after insert or update or delete on public.survey_assignments
  for each row execute function public.audit_row_change();
create trigger audit_survey_targets after insert or update or delete on public.survey_targets
  for each row execute function public.audit_row_change();
create trigger audit_questionnaire_versions after insert or update or delete on public.questionnaire_versions
  for each row execute function public.audit_row_change();
create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row_change();
create trigger audit_interviewer_profiles after update on public.interviewer_profiles
  for each row execute function public.audit_row_change();
create trigger audit_devices after insert or update on public.devices
  for each row execute function public.audit_row_change();
create trigger audit_interviews_update after update on public.interviews
  for each row execute function public.audit_row_change();

-- ===================================================================== RLS ==
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.interviewer_profiles enable row level security;
alter table public.privacy_acceptances enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_assignments enable row level security;
alter table public.survey_targets enable row level security;
alter table public.questionnaire_versions enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_conditions enable row level security;
alter table public.devices enable row level security;
alter table public.device_authorizations enable row level security;
alter table public.device_auth_attempts enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;
alter table public.interview_locations enable row level security;
alter table public.quality_flags enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_notifications enable row level security;

-- Nenhum acesso anônimo a tabelas.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- user_roles: leitura própria; escrita somente por funções de servidor
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- interviewer_profiles
create policy interviewer_profiles_select on public.interviewer_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy interviewer_profiles_admin_update on public.interviewer_profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- privacy_acceptances
create policy privacy_select on public.privacy_acceptances for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- surveys
create policy surveys_admin_all on public.surveys for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy surveys_interviewer_select on public.surveys for select to authenticated
  using (status in ('published', 'in_progress') and public.is_assigned_to(id));

-- survey_assignments
create policy assignments_admin_all on public.survey_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy assignments_own_select on public.survey_assignments for select to authenticated
  using (interviewer_id = auth.uid() and public.is_active_interviewer());

-- survey_targets
create policy targets_admin_all on public.survey_targets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy targets_interviewer_select on public.survey_targets for select to authenticated
  using (public.is_assigned_to(survey_id));

-- questionário (admin: tudo; entrevistador: somente versão publicada de pesquisa atribuída)
create policy versions_admin_all on public.questionnaire_versions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy versions_interviewer_select on public.questionnaire_versions for select to authenticated
  using (status = 'published' and public.is_assigned_to(survey_id));

create policy questions_admin_all on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy questions_interviewer_select on public.questions for select to authenticated
  using (exists (select 1 from public.questionnaire_versions v
                 where v.id = version_id and v.status = 'published' and public.is_assigned_to(v.survey_id)));

create policy options_admin_all on public.question_options for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy options_interviewer_select on public.question_options for select to authenticated
  using (exists (select 1 from public.questions q join public.questionnaire_versions v on v.id = q.version_id
                 where q.id = question_id and v.status = 'published' and public.is_assigned_to(v.survey_id)));

create policy conditions_admin_all on public.question_conditions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy conditions_interviewer_select on public.question_conditions for select to authenticated
  using (exists (select 1 from public.questions q join public.questionnaire_versions v on v.id = q.version_id
                 where q.id = question_id and v.status = 'published' and public.is_assigned_to(v.survey_id)));

-- dispositivos: leitura (admin: todos; entrevistador: os próprios). Escrita só via RPC.
create policy devices_select on public.devices for select to authenticated
  using (public.is_admin() or interviewer_id = auth.uid());
create policy device_authorizations_admin_select on public.device_authorizations for select to authenticated
  using (public.is_admin());
create policy device_auth_attempts_admin_select on public.device_auth_attempts for select to authenticated
  using (public.is_admin());

-- entrevistas: leitura (admin: todas; entrevistador: as próprias). Escrita só via RPC.
create policy sessions_select on public.interview_sessions for select to authenticated
  using (public.is_admin() or interviewer_id = auth.uid());
create policy interviews_select on public.interviews for select to authenticated
  using (public.is_admin() or interviewer_id = auth.uid());
create policy answers_select on public.interview_answers for select to authenticated
  using (public.is_admin() or exists (select 1 from public.interviews i where i.id = interview_id and i.interviewer_id = auth.uid()));
-- Localização restrita a administradores
create policy locations_admin_select on public.interview_locations for select to authenticated
  using (public.is_admin());
create policy quality_flags_admin_select on public.quality_flags for select to authenticated
  using (public.is_admin());

-- auditoria e notificações: administradores
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
  using (public.is_admin());
create policy admin_notifications_select on public.admin_notifications for select to authenticated
  using (public.is_admin());
create policy admin_notifications_update on public.admin_notifications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Funções auxiliares: nada para anon
revoke execute on function public.write_audit(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
