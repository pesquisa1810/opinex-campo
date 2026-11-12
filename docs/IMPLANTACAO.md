# Implantação do banco (Supabase)

## 1. Aplicar as migrações

**Opção A — SQL Editor (mais simples):** no painel do Supabase, abra *SQL Editor* e execute, **nesta ordem**, o conteúdo de cada arquivo de `supabase/migrations/`:

1. `20261112000001_core_schema.sql`
2. `20261112000002_security_rls.sql`
3. `20261112000003_devices.sql`
4. `20261112000004_admin_operations.sql`
5. `20261112000005_interviews.sql`
6. `20261112000006_reports_realtime.sql`

**Opção B — Supabase CLI:**

```bash
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

> Não execute `supabase/tests/00_supabase_shim.sql` no projeto real: ele só existe para testes locais.

## 2. Configurar a autenticação

Em *Authentication → URL Configuration*:
- **Site URL:** a URL pública do sistema (ex.: `https://campo.seudominio.com.br`).
- **Redirect URLs:** a mesma URL + `/**`.

Em *Authentication → Providers → Email*: mantenha e-mail/senha habilitado. A confirmação de e-mail é opcional; o acesso à coleta depende da **aprovação do administrador** de qualquer forma.

## 3. Provisionar o primeiro administrador

1. Acesse `/cadastro` no sistema e cadastre-se com o e-mail do administrador.
2. No SQL Editor do Supabase, execute:

```sql
select public.provision_first_admin('email-do-administrador@exemplo.com');
```

A função só funciona uma vez (recusa se já existir administrador) e não pode ser chamada pelo navegador.

## 4. Backups

- Planos pagos do Supabase têm backup diário automático (*Database → Backups*).
- Backup manual a qualquer momento:

```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --format=custom -f opinex-$(date +%F).dump
```

- Restauração: `pg_restore --no-owner -d "$DESTINO_DB_URL" opinex-AAAA-MM-DD.dump`.
