# Publicação (colocar no ar)

Tempo estimado: 30 a 40 minutos. Você precisa de: conta no **Supabase**, conta no **GitHub** e conta numa hospedagem com HTTPS (recomendado: **Vercel**; alternativas: Netlify ou Cloudflare Pages). Todas têm plano gratuito.

## 1. Banco de dados (Supabase)

1. Em [supabase.com](https://supabase.com) → *New project*. Região sugerida: **South America (São Paulo)**. Guarde a senha do banco.
2. Aplique as migrações **na ordem** (uma das opções):
   - **SQL Editor:** abra cada arquivo de `supabase/migrations/` (do `…0001` ao `…0008`), cole e execute.
   - **Supabase CLI** (no computador, dentro da pasta do projeto):
     ```bash
     npx supabase login
     npx supabase link --project-ref SEU_PROJECT_REF
     npx supabase db push
     ```
   > Não execute nada de `supabase/tests/` no projeto real.
3. *Authentication → URL Configuration*:
   - **Site URL:** o endereço final do sistema (ex.: `https://campo.seudominio.com.br`).
   - **Redirect URLs:** `https://campo.seudominio.com.br/**`.
4. *Authentication → Providers → Email*: deixe habilitado. Recomendado: **Confirm email = ligado**.
5. *Authentication → Emails → SMTP Settings*: configure um SMTP próprio (ex.: Resend, Brevo, Amazon SES). O envio padrão do Supabase tem limite baixo de e-mails por hora; sem SMTP próprio, confirmações e recuperação de senha podem falhar em uso real.
6. *Project Settings → API*: copie a **Project URL** e a chave **anon / publishable** (pública). **Nunca** use a `service_role` no site.

## 2. Código (GitHub)

```bash
git remote add origin https://github.com/SEU_USUARIO/opinex-campo.git
git push -u origin main
```

## 3. Hospedagem (Vercel)

1. [vercel.com](https://vercel.com) → *Add New → Project* → importe o repositório.
2. *Framework*: Vite (detectado automaticamente). Os arquivos `vercel.json` / `netlify.toml` / `public/_headers` já trazem rotas da SPA e cabeçalhos de segurança.
3. *Environment Variables*:
   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL do Supabase |
   | `VITE_SUPABASE_ANON_KEY` | chave anon/publishable |
   | `VITE_APP_URL` | endereço final (ex.: `https://campo.seudominio.com.br`) — usado no link de cadastro e no QR Code |
4. *Deploy*. Opcional: *Settings → Domains* para usar domínio próprio (HTTPS automático).
5. Volte ao Supabase (passo 1.3) e confirme que Site URL/Redirect URLs batem com o endereço publicado.

> HTTPS é obrigatório: câmera (QR Code), GPS e instalação do PWA só funcionam em HTTPS.

## 4. Primeiro administrador

1. Acesse `https://SEU_ENDERECO/cadastro` e cadastre-se com o e-mail do administrador (confirme o e-mail, se ligado).
2. No *SQL Editor* do Supabase:
   ```sql
   select public.provision_first_admin('email-do-administrador@exemplo.com');
   ```
   Funciona uma única vez e não pode ser chamado pelo navegador.
3. Entre em `https://SEU_ENDERECO/login`.

## 5. Homologação (checklist em celulares reais)

- [ ] Admin cria pesquisa, questionário e publica.
- [ ] Link de cadastro enviado pelo WhatsApp; entrevistador se cadastra e aparece como **pendente**.
- [ ] Admin aprova e atribui a pesquisa.
- [ ] **Android (Chrome)** e **iPhone (Safari)**: entrar, “Autorizar este celular”, ler o QR (pela tela do sistema e pela câmera nativa).
- [ ] Realizar entrevista com GPS permitido; testar também com GPS negado.
- [ ] Desligar a internet antes de enviar → “NÃO foi enviada” → religar → retomar e enviar.
- [ ] Admin vê a entrevista no Monitoramento (mapa), aprova/rejeita, exporta PDF/Excel/CSV.
- [ ] Revogar o celular no painel → o celular deixa de iniciar/enviar.
- [ ] Instalar na tela inicial (Android: botão “Instalar”; iPhone: Compartilhar → Adicionar à Tela de Início).
- [ ] Revisão jurídica dos Termos de Uso e do Aviso de Privacidade (`src/pages/public/Legal.tsx`).

## Migrar para outra hospedagem

O site é estático (`npm run build` gera a pasta `dist/`). Qualquer serviço que sirva arquivos estáticos com HTTPS e reescreva rotas para `/index.html` funciona. O banco pode ser migrado com `pg_dump`/`pg_restore` (ver `docs/MANUTENCAO.md`), inclusive para um Supabase auto-hospedado.
