# Manutenção, backup e privacidade

## Backup
- **Automático:** planos pagos do Supabase mantêm backups diários (*Database → Backups*). No plano gratuito, faça backups manuais.
- **Manual** (recomendado semanalmente e antes de qualquer atualização):
  ```bash
  pg_dump "postgresql://postgres:SENHA@db.SEU_PROJECT_REF.supabase.co:5432/postgres" --no-owner --format=custom -f opinex-$(date +%F).dump
  ```
- **Restauração** (num banco novo/vazio):
  ```bash
  pg_restore --no-owner --clean --if-exists -d "postgresql://...destino..." opinex-AAAA-MM-DD.dump
  ```
Guarde os arquivos de backup em local seguro e criptografado: eles contêm respostas de pesquisa.

## Atualizações do sistema
1. Faça backup.
2. Novas migrações entram em `supabase/migrations/` com número maior; aplique com `npx supabase db push` (ou SQL Editor, na ordem).
3. Envie o código ao GitHub; a hospedagem publica automaticamente.
4. Rode a suíte de testes antes de publicar: `npm run test:all` (e `npm run test:e2e` com Supabase local).

## Rotina recomendada
- Diário: revisar entrevistas com alertas no Monitoramento.
- Semanal: backup; revogar celulares que não estão mais em uso; revisar cadastros pendentes.
- Ao final de cada pesquisa: concluir/arquivar, exportar relatórios, revogar dispositivos e inativar entrevistadores temporários.

## Privacidade (LGPD)
- O sistema **não coleta identificação dos entrevistados**. Evite criar perguntas que identifiquem pessoas (nome, CPF, endereço completo, telefone).
- Opiniões políticas podem ser **dados pessoais sensíveis**: o acesso a respostas individuais, microdados e localização é restrito a administradores e as exportações de microdados ficam registradas em `audit_logs`.
- GPS é capturado uma vez por entrevista, com permissão; não há rastreamento contínuo.
- **Retenção:** defina com o responsável jurídico por quanto tempo manter as respostas. Para excluir uma pesquisa encerrada e seus dados após o prazo (no SQL Editor, com backup prévio):
  ```sql
  begin;
  delete from public.interview_answers where interview_id in (select id from public.interviews where survey_id = 'ID_DA_PESQUISA');
  delete from public.interview_locations where interview_id in (select id from public.interviews where survey_id = 'ID_DA_PESQUISA');
  delete from public.quality_flags where interview_id in (select id from public.interviews where survey_id = 'ID_DA_PESQUISA');
  delete from public.interviews where survey_id = 'ID_DA_PESQUISA';
  delete from public.interview_sessions where survey_id = 'ID_DA_PESQUISA';
  commit;
  ```
- **Pesquisas eleitorais:** exigem registro e regras próprias (Lei nº 9.504/1997 e Resolução TSE nº 23.600/2019, com alterações vigentes). O sistema **não** declara conformidade jurídica automaticamente; faça revisão jurídica específica.

## Segurança operacional
- Nunca compartilhe a chave `service_role` nem a senha do banco; elas não são usadas pelo site.
- Mantenha poucos administradores. Novos administradores só podem ser criados via SQL (`insert into public.user_roles(user_id, role) ...`) por quem tem acesso ao banco.
- Ative MFA na sua conta do Supabase, do GitHub e da hospedagem.
