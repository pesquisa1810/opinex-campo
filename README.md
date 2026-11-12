# OPINEX CAMPO

**Inteligência na coleta. Precisão na informação.**

Plataforma de gerenciamento e coleta presencial de pesquisas de opinião pública.
Aplicação web responsiva + PWA, com backend Supabase (PostgreSQL) do próprio proprietário.

- **Ambiente administrativo:** pesquisas, questionários, entrevistadores, aprovação de cadastros, QR Code de dispositivos, monitoramento, qualidade, resultados e relatórios.
- **Ambiente do entrevistador:** cadastro pelo link (WhatsApp), autorização do celular por QR Code, coleta com GPS e acompanhamento da própria produtividade.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Supabase (Auth, PostgreSQL, RLS, Realtime) |
| PWA | vite-plugin-pwa (manifest + service worker) |
| Testes | Vitest (frontend) e suíte SQL + teste de concorrência (banco) |

## Requisitos

- Node.js 20+
- Um projeto Supabase (o seu)
- PostgreSQL 15+ local **apenas** para rodar a suíte de testes do banco (opcional)

## Executar localmente

```bash
npm install
cp .env.example .env.local   # preencha URL e chave anon do seu Supabase
npm run dev
```

## Banco de dados

As migrações ficam em `supabase/migrations/` e devem ser aplicadas **em ordem**.
Passo a passo completo (incluindo o primeiro administrador): [`docs/IMPLANTACAO.md`](docs/IMPLANTACAO.md).

## Testes

```bash
npm test          # testes de frontend (Vitest)
npm run test:db   # aplica as migrações num banco descartável e roda os testes de segurança/fluxo/concorrência
```

`test:db` usa `PGHOST`, `PGPORT`, `PGUSER` (padrão `localhost:54322`, `postgres`).

Teste de ponta a ponta (navegador real + Supabase local via Docker):

```bash
npx supabase start          # sobe Auth, PostgreSQL, Realtime e aplica as migrações
npm run dev
node tests/e2e/fase3.cjs    # requer Playwright/Chromium instalados
```

## Estrutura

```
src/            componentes, páginas, layouts, hooks, serviços, tipos
supabase/
  migrations/   esquema, RLS e funções de servidor (versionados)
  tests/        shim local do Supabase + testes SQL + teste de concorrência
docs/           arquitetura, banco, implantação e situação do projeto
public/         ícones e manifest do PWA
tests/          testes de frontend e2e/unitários
```

## Segurança

- Somente a chave **anon** vai para o navegador. A `service_role` nunca é usada no frontend.
- Toda autorização é aplicada no banco (RLS + funções `SECURITY DEFINER`).
- Nunca versione arquivos `.env` reais.

Situação atual das fases: [`docs/STATUS.md`](docs/STATUS.md).
