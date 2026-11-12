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
| 2 | Aplicação no Supabase real | **Pendente** (credenciais) |
| 3 | Painel administrativo (telas) | Pendente |
| 4 | Telas de dispositivos/QR Code | Pendente |
| 5 | Área e coleta do entrevistador | Pendente |
| 6 | Monitoramento, qualidade, relatórios PDF/Excel/CSV | Pendente |
| 7 | Testes Android/iPhone, deploy HTTPS, documentação final | Pendente |
| — | GitHub | **Pendente** (autorização) |

"Testado (local)" = suíte `npm run test:db` num PostgreSQL 16 com shim do Supabase (34 verificações + concorrência).
