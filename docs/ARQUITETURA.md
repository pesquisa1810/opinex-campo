# Arquitetura

## Princípios
1. **O banco é a fronteira de segurança.** O frontend nunca decide permissões; ele apenas exibe. RLS em todas as tabelas e operações sensíveis em funções `SECURITY DEFINER` que revalidam papel, status e dispositivo.
2. **Escrita sensível só por RPC.** Dispositivos, entrevistas, aprovações e publicação de questionários não têm política de INSERT/UPDATE direta para usuários comuns.
3. **Dados reais.** Indicadores e relatórios são calculados no banco a partir dos registros gravados.

## Papéis
| Papel | Origem | Acesso |
|---|---|---|
| `admin` | `provision_first_admin` (SQL, uma vez) | tudo |
| `interviewer` | cadastro público → `pending` → aprovado pelo admin | próprio perfil, pesquisas atribuídas, próprias entrevistas |

`has_role()` exige status `approved`: bloquear/rejeitar um usuário corta o acesso imediatamente, mesmo com token ainda válido.

## Dispositivos (limite global de 5)
- Admin chama `admin_create_device_authorization` → token aleatório de 256 bits, validade de 5 min, uso único; o banco guarda só o hash SHA-256. Um QR pendente **reserva** vaga.
- Entrevistador logado lê o QR → `consume_device_authorization` → cria o dispositivo e devolve um **segredo do aparelho** (mostrado uma vez, guardado no celular; no banco só o hash).
- Toda operação de coleta envia `device_id + segredo`; o servidor confere hash, dono e status `active`.
- **Concorrência:** emissão, consumo e o trigger `enforce_device_limit` usam o mesmo `pg_advisory_xact_lock`, serializando a ocupação de vagas. Testado com 20 consumos simultâneos → exatamente 5 aceitos.
- Força bruta: 10 falhas em 15 min bloqueiam novas tentativas do usuário.

## Entrevistas
1. `begin_interview` valida usuário, aprovação, dispositivo, atribuição, status da pesquisa e abre uma **sessão** com horário do servidor (duração não depende do relógio do celular).
2. `submit_interview` revalida tudo, avalia as **condições** do questionário no servidor, valida obrigatoriedade/alternativas/intervalos, grava respostas e GPS e calcula alertas de qualidade.
3. O id da sessão é o id da entrevista: reenvios devolvem a gravação existente (**idempotência**).
4. A entrevista guarda a versão do questionário usada; versões publicadas são imutáveis (`snapshot`).

## Qualidade
Alertas automáticos (`quality_flags`): sem GPS, baixa precisão, duração curta, fora do período, respostas opcionais em branco, respostas para perguntas que não se aplicavam, padrão repetitivo, duplicidade, horários sobrepostos. **Nunca rejeitam automaticamente**: a decisão é do administrador, com justificativa e auditoria.

## Tipos de pergunta
`single_choice`, `multiple_choice`, `open_text` (espontânea), `numeric`, `observation`. A **pergunta condicional** é qualquer pergunta com regras em `question_conditions` (exibir se a resposta de uma pergunta anterior for igual/diferente/incluir/maior/menor/respondida).
