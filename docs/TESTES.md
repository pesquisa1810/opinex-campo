# Relatório de testes

Executados em 12/11/2026. Todos os resultados abaixo foram obtidos de fato neste ambiente.

| Suíte | Como rodar | Resultado |
|---|---|---|
| Tipagem (TypeScript estrito) | `npm run typecheck` | ✅ sem erros |
| Unitários (Vitest) | `npm test` | ✅ 8/8 (lógica condicional, validações, marca) |
| Banco: segurança e fluxo | `npm run test:db` | ✅ 35 verificações (PostgreSQL 16 + shim do Supabase) |
| Banco: concorrência | incluído em `test:db` | ✅ 20 consumos simultâneos de QR → exatamente 5 aceitos (repetido 5×) |
| E2E Fase 3 (painel) | `node tests/e2e/fase3.cjs` | ✅ 15 verificações |
| E2E Fases 4–5 (QR + coleta) | `node tests/e2e/fase45.cjs` | ✅ 10 verificações |
| E2E Fase 6 (monitoramento + relatórios) | `node tests/e2e/fase6.cjs` | ✅ 7 verificações |
| Build de produção + PWA | `npm run build` | ✅ manifesto, 3 ícones, service worker ativo |
| Auditoria de dependências de produção | `npm audit --omit=dev` | ✅ 0 vulnerabilidades |

Os testes E2E rodaram com **Chromium real** contra um **Supabase completo local** (Auth, PostgreSQL, Realtime, PostgREST via Docker), na **versão de produção** (build + preview com service worker).

## Requisitos obrigatórios cobertos
- **Cadastro:** público → pendente; aprovação; rejeição (com justificativa); bloqueio (revoga celulares e sessões); recuperação de senha (tela implementada; envio depende do SMTP do projeto).
- **Pesquisas:** criar, editar, publicar, atribuir, suspender, concluir.
- **Questionários:** limite de 30 perguntas e 8 alternativas, condicionais (cliente e servidor), obrigatoriedade, versionamento imutável.
- **Dispositivos:** QR Code, validade de 5 min, uso único, revogação, bloqueio do 6º, autorizações simultâneas, bloqueio após revogação, força bruta.
- **Entrevistas:** início com horário do servidor, preenchimento, GPS, envio, gravação, prevenção de duplicidade, consulta administrativa, rascunho sem conexão.
- **Segurança:** entrevistador não acessa painel, resultados, microdados, localização ou entrevistas alheias; não altera permissões, questionários ou entrevistas enviadas; QR não reutilizável; envio por aparelho revogado bloqueado e auditado.

## Defeitos encontrados pelos testes e corrigidos
1. `DELETE` sem `WHERE` recusado pelo `pg_safeupdate` do Supabase (só aparece no Supabase real) — corrigido.
2. Consulta ambígua de condições deixava a lista de perguntas vazia — corrigido.
3. Redirecionamento após login antes do carregamento do perfil — corrigido.
4. Destino pós-login herdado de outro usuário no mesmo aparelho — corrigido.
5. Classes de cor geradas dinamicamente descartadas pelo Tailwind — corrigido.
6. Funções de apuração marcadas como somente leitura — corrigido.

## Não testado aqui (depende do ambiente real)
- Celulares físicos Android e iPhone (câmera real e GPS real) → checklist em `docs/PUBLICACAO.md`.
- Envio de e-mails (confirmação/recuperação) → depende do SMTP configurado no Supabase.
- Mapa com fundo de ruas (o ambiente de teste não acessa o servidor de mapas do OpenStreetMap; os pontos foram verificados).
