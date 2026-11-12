# Situação do projeto

Legenda: **Implementado** (código pronto) · **Testado** (teste automatizado passando) · **Homologado** (validado por você) · **Publicado** (no ar em HTTPS) · **Pendente**

| Fase | Item | Situação |
|---|---|---|
| 1 | Estrutura, dependências, Tailwind, PWA (manifest/ícones/SW), identidade visual, `.env.example`, docs | Implementado · build OK |
| 2 | Esquema PostgreSQL (21 tabelas), migrações versionadas | Implementado · Testado (local) |
| 2 | RLS em todas as tabelas | Implementado · Testado (local) |
| 2 | Cadastro público → PENDENTE; nunca cria admin | Implementado · Testado (local) |
| 2 | Provisionamento seguro do 1º administrador | Implementado · Testado (local) |
| 2 | QR Code: token único, 5 min, uso único, hash, força bruta | Implementado · Testado (local) |
| 2 | Limite global de 5 dispositivos (atômico) + teste concorrente | Implementado · Testado (local, 20 conexões simultâneas) |
| 2 | Revogação imediata; bloqueio de envio por aparelho revogado | Implementado · Testado (local) |
| 2 | Início/envio de entrevista, validação condicional, idempotência | Implementado · Testado (local) |
| 2 | Versionamento de questionário (imutável após publicação) | Implementado · Testado (local) |
| 2 | Alertas de qualidade, revisão com justificativa, auditoria | Implementado · Testado (local) |
| 2 | Painel e resultados com dados reais (RPC) | Implementado · Testado (local) |
| 2 | Migrações aplicadas num Supabase completo (local, Docker) | Implementado · Testado |
| 2 | Aplicação no Supabase do proprietário | **Pendente** (credenciais) |
| 3 | Layout do painel conforme o modelo de telas (menu lateral, cards, painéis, selos, barras) | Implementado · Testado (e2e) |
| 3 | Login, cadastro público (link WhatsApp), recuperação de senha, termos e privacidade | Implementado · Testado (e2e) |
| 3 | Visão geral com dados reais + atualização em tempo real (Realtime) | Implementado · Testado (e2e) |
| 3 | Pesquisas: criar, editar, duplicar, transições de status, equipe/metas, metas por área | Implementado · Testado (e2e: criar, publicar, atribuir) |
| 3 | Construtor de questionários (6 formatos, condicionais, limites, reordenar, duplicar, pré-visualizar, publicar, versionar) | Implementado · Testado (e2e + unitários) |
| 3 | Entrevistadores: aprovar, rejeitar, bloquear, inativar, reativar, metas, atribuições, histórico, revogar sessões | Implementado · Testado (e2e: aprovar) |
| 4 | Telas de dispositivos/QR Code | Pendente |
| 5 | Área e coleta do entrevistador | Pendente |
| 6 | Monitoramento, qualidade, relatórios PDF/Excel/CSV | Pendente |
| 7 | Testes Android/iPhone, deploy HTTPS, documentação final | Pendente |
| — | GitHub | **Pendente** (autorização) |

"Testado (local)" = suíte `npm run test:db` num PostgreSQL 16 com shim do Supabase (35 verificações + concorrência).
"Testado (e2e)" = `tests/e2e/fase3.cjs`: navegador real contra Supabase local completo (15 verificações).
