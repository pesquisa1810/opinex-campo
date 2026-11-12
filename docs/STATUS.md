# Situação do projeto — versão 1.0.0

Legenda: **Implementado** · **Testado** (teste automatizado passando) · **Homologado** (validado pelo proprietário em uso real) · **Publicado** (no ar em HTTPS) · **Pendente**

| # | Critério de conclusão | Situação |
|---|---|---|
| 1 | Administrador acessa o painel | Implementado · Testado · ✅ Validado em produção (12/11/2026) |
| 2 | Pesquisas podem ser criadas | Implementado · Testado |
| 3 | Questionários podem ser elaborados | Implementado · Testado |
| 4 | Entrevistadores se cadastram pelo link | Implementado · Testado |
| 5 | Administrador aprova cadastros | Implementado · Testado |
| 6 | Pesquisas podem ser atribuídas | Implementado · Testado |
| 7 | QR Code funciona | Implementado · Testado (navegador; celular físico pendente de homologação) |
| 8 | Limite global de 5 dispositivos | Implementado · Testado (inclusive concorrência) |
| 9 | Entrevistas pelo celular | Implementado · Testado (celular simulado) |
| 10 | GPS mediante permissão | Implementado · Testado (GPS simulado) |
| 11 | Entrevistas gravadas no Supabase | Implementado · Testado (Supabase local) |
| 12 | Monitoramento da coleta | Implementado · Testado |
| 13 | Relatórios com dados reais | Implementado · Testado (PDF, Excel, CSV, microdados) |
| 14 | Permissões impedem acesso indevido | Implementado · Testado |
| 15 | Versionado no GitHub | ✅ Publicado em github.com/pesquisa1810/opinex-campo |
| 16 | Publicado em HTTPS | ✅ Publicado em https://opinex-campo.vercel.app (Vercel) · banco Supabase em São Paulo |
| 17 | Testes essenciais documentados | Implementado · `docs/TESTES.md` |

## Produção
- Site: https://opinex-campo.vercel.app (publicação automática a cada envio ao GitHub)
- Banco: Supabase `opinex-campo` (São Paulo, sa-east-1), 8 migrações aplicadas e registradas
- Primeiro administrador provisionado e acesso ao painel confirmado
- Teste em produção: login, cadastro, PWA, cabeçalhos de segurança e bloqueio de acesso anônimo verificados

**Homologado:** pendente do checklist com celulares reais em `docs/PUBLICACAO.md`.
