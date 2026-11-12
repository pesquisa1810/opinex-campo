-- ============================================================================
-- OPINEX CAMPO — 0003: Autorização de dispositivos por QR Code
-- LIMITE GLOBAL: no máximo 5 dispositivos ativos em TODO o sistema.
--
-- Garantia de concorrência: toda operação que pode ocupar uma vaga adquire o
-- mesmo advisory lock transacional (pg_advisory_xact_lock). Assim, emissões e
-- consumos simultâneos são serializados e a contagem é sempre consistente.
-- Defesa em profundidade: um trigger em devices recusa o 6º ativo.
-- ============================================================================

create or replace function public.device_limit() returns integer
language sql immutable as $$ select 5 $$;

create or replace function public.lock_device_slots() returns void
language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(7300515001)
$$;

create or replace function public.sha256_hex(_value text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(_value, 'UTF8'), 'sha256'), 'hex')
$$;

-- Trigger de defesa: nunca mais que 5 dispositivos ativos
create or replace function public.enforce_device_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_active int;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    perform public.lock_device_slots();
    select count(*) into v_active from public.devices where status = 'active' and id <> new.id;
    if v_active >= public.device_limit() then
      raise exception 'DEVICE_LIMIT_REACHED: limite global de % dispositivos atingido', public.device_limit();
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'revoked' and new.status = 'active' then
    raise exception 'FORBIDDEN: dispositivo revogado não pode ser reativado; emita nova autorização';
  end if;
  return new;
end $$;
create trigger devices_enforce_limit before insert or update of status on public.devices
  for each row execute function public.enforce_device_limit();

-- Situação das vagas (para o painel)
create or replace function public.device_slots()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'limit', public.device_limit(),
    'active', (select count(*) from public.devices where status = 'active'),
    'pending', (select count(*) from public.device_authorizations where status = 'pending' and expires_at > now())
  );
end $$;

-- ------------------------------------------------------------------------
-- 1) Administrador emite autorização (QR Code) para um entrevistador aprovado.
--    Uma autorização pendente RESERVA uma vaga até expirar (5 min) ou ser usada.
-- ------------------------------------------------------------------------
create or replace function public.admin_create_device_authorization(_interviewer uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_id uuid;
  v_expires timestamptz := now() + interval '5 minutes';
  v_used int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: somente administradores'; end if;
  if not public.has_role(_interviewer, 'interviewer') then
    raise exception 'INTERVIEWER_NOT_APPROVED: o entrevistador precisa estar aprovado';
  end if;

  perform public.lock_device_slots();

  update public.device_authorizations set status = 'expired'
   where status = 'pending' and expires_at <= now();

  -- Cancela QR anterior ainda pendente do mesmo entrevistador (evita acumular reservas)
  update public.device_authorizations set status = 'cancelled'
   where status = 'pending' and interviewer_id = _interviewer;

  select (select count(*) from public.devices where status = 'active')
       + (select count(*) from public.device_authorizations where status = 'pending')
    into v_used;
  if v_used >= public.device_limit() then
    raise exception 'DEVICE_LIMIT_REACHED: limite global de % dispositivos atingido. Revogue um dispositivo para liberar vaga.', public.device_limit();
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');   -- 256 bits
  insert into public.device_authorizations(interviewer_id, token_hash, expires_at, created_by)
  values (_interviewer, public.sha256_hex(v_token), v_expires, auth.uid())
  returning id into v_id;

  perform public.write_audit('device_authorization_created', 'device_authorizations', v_id::text,
    null, jsonb_build_object('interviewer_id', _interviewer, 'expires_at', v_expires));

  -- O token em texto puro é devolvido UMA ÚNICA VEZ; o banco guarda apenas o hash.
  return jsonb_build_object('authorization_id', v_id, 'token', v_token, 'expires_at', v_expires);
end $$;

create or replace function public.admin_cancel_device_authorization(_authorization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.device_authorizations set status = 'cancelled'
   where id = _authorization and status = 'pending';
  perform public.write_audit('device_authorization_cancelled', 'device_authorizations', _authorization::text);
end $$;

-- ------------------------------------------------------------------------
-- 2) Entrevistador logado lê o QR Code no celular e consome a autorização.
--    Erros são DEVOLVIDOS (não lançados) para que a tentativa fique registrada.
-- ------------------------------------------------------------------------
create or replace function public.consume_device_authorization(
  _token text, _device_key text, _label text, _user_agent text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_auth public.device_authorizations%rowtype;
  v_fail int;
  v_active int;
  v_secret text;
  v_device_id uuid;
  v_key_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- Força bruta: no máximo 10 falhas em 15 minutos por usuário
  select count(*) into v_fail from public.device_auth_attempts
   where user_id = v_uid and not success and created_at > now() - interval '15 minutes';
  if v_fail >= 10 then
    insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'rate_limited');
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY_ATTEMPTS');
  end if;

  if not public.is_active_interviewer() then
    insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'not_approved');
    return jsonb_build_object('ok', false, 'error', 'INTERVIEWER_NOT_APPROVED');
  end if;

  if _token is null or _token !~ '^[0-9a-f]{64}$' or _device_key is null or char_length(_device_key) < 32 then
    insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'malformed');
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;

  perform public.lock_device_slots();

  select * into v_auth from public.device_authorizations
   where token_hash = public.sha256_hex(_token) for update;

  if not found or v_auth.interviewer_id <> v_uid then
    insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'invalid_token');
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;
  if v_auth.status = 'consumed' then
    insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'reused');
    perform public.write_audit('device_qr_reuse_blocked', 'device_authorizations', v_auth.id::text);
    return jsonb_build_object('ok', false, 'error', 'TOKEN_ALREADY_USED');
  end if;
  if v_auth.status <> 'pending' then
    insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'cancelled');
    return jsonb_build_object('ok', false, 'error', 'TOKEN_CANCELLED');
  end if;
  if v_auth.expires_at <= now() then
    update public.device_authorizations set status = 'expired' where id = v_auth.id;
    insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'expired');
    return jsonb_build_object('ok', false, 'error', 'TOKEN_EXPIRED');
  end if;

  v_key_hash := public.sha256_hex(_device_key);
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  -- Mesmo aparelho já ativo para este entrevistador: renova o segredo, sem ocupar nova vaga.
  select id into v_device_id from public.devices
   where interviewer_id = v_uid and device_key_hash = v_key_hash and status = 'active';

  if v_device_id is not null then
    update public.devices set secret_hash = public.sha256_hex(v_secret), last_seen_at = now(),
           authorization_id = v_auth.id, label = left(coalesce(_label, label), 120),
           user_agent = left(_user_agent, 400)
     where id = v_device_id;
  else
    select count(*) into v_active from public.devices where status = 'active';
    if v_active >= public.device_limit() then
      insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, false, 'limit');
      return jsonb_build_object('ok', false, 'error', 'DEVICE_LIMIT_REACHED');
    end if;
    insert into public.devices(interviewer_id, label, device_key_hash, secret_hash, user_agent, authorization_id, last_seen_at)
    values (v_uid, left(coalesce(nullif(trim(_label), ''), 'Dispositivo'), 120), v_key_hash,
            public.sha256_hex(v_secret), left(_user_agent, 400), v_auth.id, now())
    returning id into v_device_id;
  end if;

  update public.device_authorizations
     set status = 'consumed', consumed_at = now(), consumed_device_id = v_device_id
   where id = v_auth.id;
  insert into public.device_auth_attempts(user_id, success, reason) values (v_uid, true, 'ok');

  return jsonb_build_object('ok', true, 'device_id', v_device_id, 'device_secret', v_secret);
end $$;

-- ------------------------------------------------------------------------
-- 3) Validação de dispositivo para operações protegidas (uso interno)
--    Retorna: 'ok' | 'not_found' | 'revoked' | 'wrong_secret'
-- ------------------------------------------------------------------------
create or replace function public.check_device(_device uuid, _secret text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_dev public.devices%rowtype;
begin
  select * into v_dev from public.devices where id = _device and interviewer_id = auth.uid();
  if not found then return 'not_found'; end if;
  if v_dev.secret_hash <> public.sha256_hex(coalesce(_secret, '')) then return 'wrong_secret'; end if;
  if v_dev.status <> 'active' then return 'revoked'; end if;
  update public.devices set last_seen_at = now() where id = _device;
  return 'ok';
end $$;
revoke execute on function public.check_device(uuid, text) from public, anon, authenticated;

-- Consulta do próprio aparelho (tela do entrevistador)
create or replace function public.my_device_status(_device uuid, _secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'not_authenticated'); end if;
  v := public.check_device(_device, _secret);
  return jsonb_build_object('status', v);
end $$;

-- ------------------------------------------------------------------------
-- 4) Revogação imediata (administrador)
-- ------------------------------------------------------------------------
create or replace function public.admin_revoke_device(_device uuid, _reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.devices
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = left(_reason, 300)
   where id = _device and status = 'active';
  if not found then raise exception 'NOT_FOUND: dispositivo inexistente ou já revogado'; end if;
end $$;

revoke execute on function public.lock_device_slots() from public, anon, authenticated;
revoke execute on function public.enforce_device_limit() from public, anon, authenticated;
revoke execute on function public.device_slots() from public, anon;
revoke execute on function public.admin_create_device_authorization(uuid) from public, anon;
revoke execute on function public.admin_cancel_device_authorization(uuid) from public, anon;
revoke execute on function public.consume_device_authorization(text, text, text, text) from public, anon;
revoke execute on function public.my_device_status(uuid, text) from public, anon;
revoke execute on function public.admin_revoke_device(uuid, text) from public, anon;
grant execute on function public.device_slots() to authenticated;
grant execute on function public.admin_create_device_authorization(uuid) to authenticated;
grant execute on function public.admin_cancel_device_authorization(uuid) to authenticated;
grant execute on function public.consume_device_authorization(text, text, text, text) to authenticated;
grant execute on function public.my_device_status(uuid, text) to authenticated;
grant execute on function public.admin_revoke_device(uuid, text) to authenticated;
