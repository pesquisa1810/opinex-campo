#!/usr/bin/env bash
# Testes do banco: cria um banco descartável, aplica o shim do Supabase,
# todas as migrações e executa os testes SQL + teste de concorrência.
# Uso: PGHOST=localhost PGPORT=54322 PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-54322}" PGUSER="${PGUSER:-postgres}"
DB="${TEST_DB:-opinex_test}"
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
export PGDATABASE=$DB
run() { psql -q -v ON_ERROR_STOP=1 -X -f "$1" >/dev/null; }
run supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do echo "migração: $(basename "$f")"; run "$f"; done
for f in supabase/tests/[1-9]*.sql; do
  echo "teste: $(basename "$f")"
  out=$(mktemp)
  if psql -q -v ON_ERROR_STOP=1 -X -f "$f" >"$out" 2>&1; then status=0; else status=1; fi
  grep -E 'PASS|ERROR|FAIL|CONTEXT' "$out" | sed 's/^psql:[^ ]* //; s/^NOTICE:  //' || true
  rm -f "$out"
  [ "$status" -eq 0 ] || { echo "FALHOU: $f"; exit 1; }
done
bash supabase/tests/concurrency.sh
echo "TODOS OS TESTES DO BANCO PASSARAM"
