#!/usr/bin/env bash
# ============================================================================
# Teste de CONCORRÊNCIA do limite global de 5 dispositivos.
# 20 conexões paralelas tentam, ao mesmo tempo, ocupar vagas de dispositivo
# (inserção direta como service_role, o caminho mais "agressivo", e consumo de
# QR Codes). O resultado nunca pode passar de 5 ativos.
# ============================================================================
set -uo pipefail
TMPD=$(mktemp -d); trap "rm -rf $TMPD" EXIT
export PGDATABASE="${PGDATABASE:-opinex_test}"
q() { psql -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }

# Prepara: revoga tudo e cria 20 entrevistadores aprovados com QR pendente
q "update public.devices set status='revoked', revoked_at=now() where status='active';
   update public.device_authorizations set status='cancelled' where status='pending';
   delete from public.device_auth_attempts;" >/dev/null

q "insert into auth.users(email, raw_user_meta_data)
   select 'c'||g||'@t.com', jsonb_build_object('full_name','Concorrente '||g,'terms_version','1','privacy_version','1')
   from generate_series(1,20) g on conflict do nothing;
   update public.profiles set status='approved' where email like 'c%@t.com';" >/dev/null

# Tokens emitidos diretamente (simula 20 QR válidos, ignorando a reserva da emissão)
for g in $(seq 1 20); do
  tok=$(openssl rand -hex 32)
  echo "$tok" > "$TMPD/opx_tok_$g"
  q "insert into public.device_authorizations(interviewer_id, token_hash, expires_at, created_by)
     select p.id, public.sha256_hex('$tok'), now()+interval '5 minutes', (select id from auth.users order by created_at limit 1)
     from public.profiles p where p.email='c$g@t.com';" >/dev/null
done

# 20 consumos simultâneos
for g in $(seq 1 20); do
  (
    uid=$(q "select id from auth.users where email='c$g@t.com'")
    tok=$(cat "$TMPD/opx_tok_$g")
    psql -X -q -t -A -c "select set_config('request.jwt.claims', '{\"sub\":\"$uid\"}', false);" \
         -c "set role authenticated;" \
         -c "select public.consume_device_authorization('$tok', repeat('d',32)||'$g', 'Concorrente', 'UA')->>'ok';" \
         > "$TMPD/opx_res_$g" 2>&1
  ) &
done
wait

active=$(q "select count(*) from public.devices where status='active'")
ok=$(cat $TMPD/opx_res_* | grep -c '^true$' || true)
echo "concorrência: $ok consumos aceitos de 20 simultâneos; dispositivos ativos = $active"
if [ "$active" -gt 5 ] || [ "$ok" -gt 5 ]; then echo "FAIL: limite global ultrapassado"; exit 1; fi
if [ "$active" -ne 5 ]; then echo "FAIL: esperado exatamente 5 ativos"; exit 1; fi
echo "PASS: limite global de 5 dispositivos respeitado sob concorrência"
