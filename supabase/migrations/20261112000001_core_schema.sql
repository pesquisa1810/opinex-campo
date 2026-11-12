-- ============================================================================
-- OPINEX CAMPO — 0001: Esquema principal
-- Tabelas, tipos, índices, restrições e utilitários.
-- ============================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- Tipos ----
create type public.app_role as enum ('admin', 'interviewer');
create type public.user_status as enum ('pending', 'approved', 'rejected', 'blocked', 'inactive');
create type public.survey_status as enum ('draft', 'in_review', 'published', 'in_progress', 'suspended', 'completed', 'archived');
create type public.sampling_type as enum ('probabilistic', 'non_probabilistic');
create type public.gps_policy as enum ('required', 'optional');
create type public.version_status as enum ('draft', 'published', 'superseded');
create type public.question_type as enum ('single_choice', 'multiple_choice', 'open_text', 'numeric', 'observation');
create type public.condition_operator as enum ('equals', 'not_equals', 'includes', 'greater_than', 'less_than', 'answered');
create type public.device_status as enum ('active', 'revoked');
create type public.authorization_status as enum ('pending', 'consumed', 'expired', 'cancelled');
create type public.interview_status as enum ('received', 'under_review', 'approved', 'rejected', 'needs_revision');
create type public.gps_permission as enum ('granted', 'denied', 'unavailable', 'timeout');
create type public.flag_severity as enum ('info', 'warning', 'critical');
create type public.legal_document as enum ('terms_of_use', 'privacy_notice');

-- ------------------------------------------------------------ Utilitários --
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------- Usuários/perfis ----
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 120),
  email text not null,
  phone text check (phone is null or phone ~ '^[0-9+() -]{8,20}$'),
  status public.user_status not null default 'pending',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_status_idx on public.profiles(status);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.interviewer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  individual_target integer not null default 0 check (individual_target >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger interviewer_profiles_updated_at before update on public.interviewer_profiles
  for each row execute function public.set_updated_at();

create table public.privacy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document public.legal_document not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, document_version)
);

-- ------------------------------------------------------------- Pesquisas ----
create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  name text not null check (char_length(name) between 3 and 160),
  description text,
  objective text,
  municipality text,
  state char(2),
  coverage_area text,
  start_date date,
  end_date date,
  target_total integer not null default 0 check (target_total >= 0),
  sampling_method text,
  sampling_type public.sampling_type not null default 'non_probabilistic',
  responsible text,
  notes text,
  status public.survey_status not null default 'draft',
  gps_policy public.gps_policy not null default 'optional',
  min_duration_seconds integer not null default 60 check (min_duration_seconds >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index surveys_status_idx on public.surveys(status);
create trigger surveys_updated_at before update on public.surveys
  for each row execute function public.set_updated_at();

create table public.survey_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  interviewer_id uuid not null references public.profiles(id) on delete cascade,
  target integer not null default 0 check (target >= 0),
  active boolean not null default true,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (survey_id, interviewer_id)
);
create index survey_assignments_interviewer_idx on public.survey_assignments(interviewer_id) where active;
create trigger survey_assignments_updated_at before update on public.survey_assignments
  for each row execute function public.set_updated_at();

-- Metas por área (município/bairro/setor)
create table public.survey_targets (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  municipality text not null,
  neighborhood text,
  sector text,
  target integer not null check (target >= 0),
  created_at timestamptz not null default now()
);
create index survey_targets_survey_idx on public.survey_targets(survey_id);

-- -------------------------------------------------------- Questionários ----
create table public.questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  version integer not null check (version > 0),
  status public.version_status not null default 'draft',
  snapshot jsonb,                       -- cópia congelada no momento da publicação
  published_at timestamptz,
  published_by uuid references auth.users(id),
  superseded_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (survey_id, version)
);
-- No máximo um rascunho e uma versão publicada por pesquisa
create unique index questionnaire_one_draft on public.questionnaire_versions(survey_id) where status = 'draft';
create unique index questionnaire_one_published on public.questionnaire_versions(survey_id) where status = 'published';

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.questionnaire_versions(id) on delete cascade,
  position integer not null check (position between 1 and 30),
  type public.question_type not null,
  text text not null check (char_length(text) between 1 and 500),
  help_text text,
  required boolean not null default true,
  min_value numeric,
  max_value numeric,
  max_choices integer check (max_choices is null or max_choices between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, position) deferrable initially deferred,
  check (min_value is null or max_value is null or max_value >= min_value)
);
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position integer not null check (position between 1 and 8),
  label text not null check (char_length(label) between 1 and 200),
  code integer not null,
  is_other boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, position) deferrable initially deferred
);

-- A pergunta "question_id" só é exibida se TODAS as suas condições forem verdadeiras.
create table public.question_conditions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  depends_on_question_id uuid not null references public.questions(id) on delete cascade,
  operator public.condition_operator not null,
  option_id uuid references public.question_options(id) on delete cascade,
  numeric_value numeric,
  created_at timestamptz not null default now(),
  check (question_id <> depends_on_question_id)
);
create index question_conditions_q_idx on public.question_conditions(question_id);

-- ---------------------------------------------------------- Dispositivos ----
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,                  -- identificação técnica legível (navegador/SO)
  device_key_hash text not null,        -- hash da chave aleatória gerada no aparelho
  secret_hash text not null,            -- hash do segredo emitido pelo servidor
  user_agent text,
  status public.device_status not null default 'active',
  authorization_id uuid,
  authorized_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoke_reason text
);
create index devices_active_idx on public.devices(status) where status = 'active';
create index devices_interviewer_idx on public.devices(interviewer_id);

create table public.device_authorizations (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  status public.authorization_status not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_device_id uuid references public.devices(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index device_authorizations_pending_idx on public.device_authorizations(status, expires_at) where status = 'pending';
alter table public.devices add constraint devices_authorization_fk
  foreign key (authorization_id) references public.device_authorizations(id);

-- Tentativas de consumo de QR Code (proteção contra força bruta)
create table public.device_auth_attempts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  success boolean not null,
  reason text,
  created_at timestamptz not null default now()
);
create index device_auth_attempts_user_idx on public.device_auth_attempts(user_id, created_at desc);

-- ------------------------------------------------------------ Entrevistas ---
-- Sessão aberta no servidor ao iniciar a entrevista (horário de início confiável).
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  version_id uuid not null references public.questionnaire_versions(id),
  interviewer_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index interview_sessions_interviewer_idx on public.interview_sessions(interviewer_id, started_at desc);

create table public.interviews (
  id uuid primary key references public.interview_sessions(id),   -- = sessão (idempotência)
  survey_id uuid not null references public.surveys(id) on delete restrict,
  version_id uuid not null references public.questionnaire_versions(id) on delete restrict,
  interviewer_id uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null references public.devices(id),
  municipality text not null,
  neighborhood text not null,
  sector text,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_seconds integer not null,
  submitted_at timestamptz not null default now(),
  status public.interview_status not null default 'received',
  answers_count integer not null default 0,
  quality_score integer not null default 100 check (quality_score between 0 and 100),
  answers_fingerprint text,
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
create index interviews_survey_status_idx on public.interviews(survey_id, status);
create index interviews_interviewer_idx on public.interviews(interviewer_id, submitted_at desc);
create index interviews_submitted_idx on public.interviews(submitted_at desc);
create index interviews_place_idx on public.interviews(survey_id, municipality, neighborhood);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  option_ids uuid[] not null default '{}',
  text_value text check (text_value is null or char_length(text_value) <= 2000),
  numeric_value numeric,
  other_text text check (other_text is null or char_length(other_text) <= 300),
  unique (interview_id, question_id)
);
create index interview_answers_question_idx on public.interview_answers(question_id);

create table public.interview_locations (
  interview_id uuid primary key references public.interviews(id) on delete cascade,
  permission public.gps_permission not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m >= 0),
  captured_at timestamptz,
  check (permission <> 'granted' or (latitude is not null and longitude is not null))
);

create table public.quality_flags (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  code text not null,
  severity public.flag_severity not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index quality_flags_interview_idx on public.quality_flags(interview_id);

-- ------------------------------------------------------------- Auditoria ----
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity, entity_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- Notificações internas do painel (ex.: novo cadastro pendente)
create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index admin_notifications_unread_idx on public.admin_notifications(created_at desc) where read_at is null;
