# Manual de uso

## Administrador

| Menu | Para que serve |
|---|---|
| **Visão geral** | Indicadores e gráficos em tempo real (entrevistas, metas, entrevistadores, dispositivos). Alerta de cadastros pendentes. |
| **Pesquisas** | Cadastrar, editar, duplicar e mudar a situação (rascunho → revisão → publicada → em andamento → suspensa → concluída → arquivada). Na pesquisa: equipe e metas individuais, metas por área e versões do questionário. |
| **Questionário** (dentro da pesquisa) | Até 30 perguntas e 8 alternativas. Tipos: escolha única, múltipla, espontânea, numérica, observação e condicional (qualquer pergunta com condição de exibição). Visualizar como o entrevistador, publicar. Versão publicada fica travada; para alterar, “Criar nova versão”. |
| **Entrevistadores** | Link de cadastro (copiar/WhatsApp), aprovar, rejeitar, bloquear, inativar, reativar, metas, atribuições, histórico, revogar sessões. |
| **Dispositivos / QR Code** | As 5 posições globais. “Gerar QR Code” para um entrevistador aprovado (vale 5 minutos, uso único). Revogar libera a posição imediatamente. |
| **Monitoramento** | Lista e mapa das entrevistas, filtros, alertas de qualidade. Clique numa entrevista para analisar e aprovar / rejeitar / pedir revisão (justificativa obrigatória para rejeitar). |
| **Apuração e relatórios** | Frequências absolutas e relativas com denominadores, gráficos (barras, colunas, setores), filtros por situação/local/período e exportação PDF, Excel, CSV e microdados. |

### Relatório em PDF com gráficos
1. Em **Apuração e relatórios**, escolha a pesquisa, os filtros (situações, município, bairro, período) e a **base de cálculo**.
2. Em cada pergunta, escolha o gráfico (**barras**, **colunas** ou **setores**): o PDF usa a mesma escolha.
3. Clique em **Exportar PDF** e marque o que deve entrar:
   - tipo de gráfico (conforme a tela ou o mesmo para todas);
   - visão geral da coleta (evolução diária, municípios, bairros, produtividade);
   - tabelas de frequência;
   - respostas espontâneas e especificações de "Outro".
4. Clique em **Gerar PDF**.

O relatório traz capa com ficha técnica e nota metodológica, gráficos vetoriais (nítidos na impressão), denominadores de cada pergunta e numeração de páginas. Não inclui respostas individuais nem localização GPS. Exemplo: `docs/telas/24-relatorio-pdf.png`.

**Fluxo típico:** criar pesquisa → montar e publicar questionário → enviar link de cadastro → aprovar entrevistadores → atribuir pesquisa → publicar/iniciar coleta → autorizar celulares por QR → acompanhar no Monitoramento → analisar → apurar e exportar.

## Entrevistador (pelo celular)

1. Abra o link recebido, faça o cadastro e aguarde a aprovação.
2. Entre com e-mail e senha. Opcional: instale na tela inicial.
3. Toque em **Autorizar este celular** e leia o QR Code mostrado pelo administrador.
4. Em **Minhas pesquisas**, toque em **Iniciar entrevista**.
5. Informe município, bairro e setor; permita a localização quando o celular pedir.
6. Responda uma pergunta por tela, revise e toque em **Confirmar e enviar**.
7. Só considere enviada quando aparecer **ENVIADA** com o protocolo. Se a internet cair, a entrevista fica em “Entrevistas não enviadas” para retomar depois.

O entrevistador vê apenas as próprias entrevistas, metas e histórico — nunca os resultados.

## Perguntas frequentes

- **O QR expirou.** Gere outro; a posição reservada é liberada sozinha após 5 minutos.
- **Limite de 5 celulares atingido.** Revogue um dispositivo que não está em uso.
- **Troquei de celular.** Revogue o antigo e autorize o novo com um novo QR.
- **GPS negado.** Se a pesquisa exigir GPS, o envio é bloqueado; libere a localização nas configurações do navegador. Se for opcional, a entrevista é enviada com alerta “sem GPS”.
