# Intent: Acções sobre notas de crédito, proformas e cotações (#148)

- **Issue**: [#148](https://github.com/fxavier/gespro-frontend/issues/148) — [faturação] Sem UI para liquidar/cancelar nota de crédito e cancelar proforma/cotação
- **Relacionada**: [#152](https://github.com/fxavier/gespro-frontend/issues/152) (ligações para `/faturacao/nota-credito/[id]` inexistentes), fechada por este trabalho.
- **Data**: 2026-09-27 · **Gravidade**: M · **Estado**: especificação fixada em entrevista; tickets em [`tickets.md`](tickets.md).

## Problem

Há quatro operações sobre documentos de faturação que a interface não oferece. Duas das que já existem
no servidor fazem menos do que o nome promete. Verificado no código em `1eb1314`:

| Operação | Serviço / action | Interface | Defeito de fundo |
|---|---|---|---|
| Liquidar NC | `liquidarNotaCredito` (`faturacao:nc:liquidar`) | Menu da lista liga a `/faturacao/nota-credito/[id]/liquidar` — **404** | Só muda o estado para `LIQUIDADA`: nem dinheiro nem compensação |
| Cancelar NC | `cancelarNotaCredito(motivo)` (`faturacao:nc:cancelar`) | Nenhuma | Só muda o estado. O **lançamento da NC fica de pé** (`lancamentoId`): os livros dizem que o crédito existe e o documento diz que não |
| Cancelar proforma | `cancelarProforma(motivo)` (`faturacao:proforma:cancelar`) | Detalhe existe, sem botão | Grava o motivo **por cima de `observacoes`** |
| Cancelar cotação | **Não existe** (só `rejeitarCotacaoComercial`) | Detalhe existe, sem botão | A máquina de estados permite `RASCUNHO → CANCELADA`, mas não há quem o escreva |

A NC não tem página de detalhe. A lista liga para duas rotas que dão 404 (#152).

## Proposed Outcomes

### Onde ficam as acções

- **Nova página** `/faturacao/nota-credito/[id]` (Server Component). Mostra o cabeçalho, as linhas, a
  factura original, o estado, o `motivoCancelamento` e a liquidação, e tem uma barra de acções. Fecha a #152.
- As acções aparecem na **barra de acções do detalhe** dos três documentos, ao lado das que já existem
  (Enviar, Aceitar, Converter).
- As acções aparecem também no **menu ⋯ de cada linha** das três listas, e levam às mesmas rotas.
- Nos dois sítios, uma acção só aparece quando `TRANSICOES_*` permite a transição e o utilizador tem a
  permissão. É uma só fonte de verdade.
- Não há modais. As acções com campos têm rota própria (`/[id]/liquidar`, `/[id]/cancelar`), no molde de
  `/faturacao/cotacoes/[id]/rejeitar`.

### Cancelar (NC, proforma, cotação)

- Rota `/[id]/cancelar` com **motivo obrigatório** (3–500 caracteres) e confirmação.
- O motivo vai para a coluna `motivoCancelamento`. `observacoes` nunca é sobrescrito (ADR-0039 §3). A NC já
  tem a coluna; proforma e cotação ganham-na numa migração aditiva.
- **NC**:
  - só se cancela no estado `EMITIDA`;
  - na **mesma transacção**, estorna o lançamento da NC (`lancamentoId`) com a data do cancelamento e
    guarda o id do estorno em `lancamentoEstornoId`, numa coluna nova;
  - com o período da data fechado, recusa com `PERIODO_FECHADO` e não escreve nada.
- **Proforma**: pode cancelar-se em `RASCUNHO`, `ENVIADA` ou `ACEITE`, conforme `TRANSICOES_PROFORMA`.
- **Cotação**: só em `RASCUNHO`, conforme `TRANSICOES_COTACAO_COMERCIAL`. Depois de enviada, o caminho é
  «Rejeitar», que já existe. O serviço novo é `cancelarCotacaoComercial(id, motivo, ctx)`.

### Liquidar NC

- Rota `/faturacao/nota-credito/[id]/liquidar`, só a partir de `EMITIDA`. A liquidação é **sempre total**
  (`EMITIDA → LIQUIDADA`), sem estado parcial.
- O utilizador escolhe a **Forma**, que é obrigatória:
  - **Devolução ao cliente**:
    - campos: forma de pagamento (`FORMAS_PAGAMENTO`), conta bancária quando a forma o exige, e data;
    - a conta resolve-se com `resolverContaMeioPagamento`, como no pagamento a fornecedor: numerário usa a
      conta 111 da sessão de caixa aberta, as outras formas uma conta bancária do tipo certo;
    - gera o lançamento **411 Clientes (débito) → conta do meio (crédito)** pelo total da NC e, em
      numerário, o movimento de saída na sessão de caixa;
    - o documento guarda o lançamento criado (`lancamentoLiquidacaoId`, coluna nova), porque quem emite
      guarda o lançamento;
    - requer, além de `faturacao:nc:liquidar`, `caixa:operar` para numerário ou `financas:banca:escrita`
      para as outras formas. Sem nenhuma delas, a opção não aparece e a action recusa.
  - **Compensação na factura original**:
    - só é oferecida quando o saldo em aberto da factura (`total − totalPago`) é ≥ total da NC e a factura
      está `EMITIDA`, `PARCIALMENTE_PAGA` ou `VENCIDA`;
    - abate o total da NC ao `totalPago` da factura e actualiza o estado dela como o `registarPagamento` faz;
    - **sem lançamento**: a 411 já foi creditada na emissão da NC;
    - com saldo insuficiente, recusa com `NC_COMPENSACAO_EXCEDE_SALDO`.
- Grava-se a forma (`formaLiquidacao`: `DEVOLUCAO` | `COMPENSACAO`) e a data (`dataLiquidacao`). As duas
  colunas são novas.

### Permissões (reutilizadas, sem permissão nova)

| Acção | Permissão |
|---|---|
| Liquidar NC — compensação | `faturacao:nc:liquidar` |
| Liquidar NC — devolução | `faturacao:nc:liquidar` + (`caixa:operar` para numerário, `financas:banca:escrita` para as restantes formas) |
| Cancelar NC | `faturacao:nc:cancelar` |
| Cancelar proforma | `faturacao:proforma:cancelar` |
| Cancelar cotação | `faturacao:cotacao:gerir` (a descrição já diz «editar, anular») |

Hoje têm estas permissões o ADMIN, o GESTOR e o FINANCEIRO (`faturacao:*`). OPERADOR e LEITURA não as têm.
Sem a permissão, o botão não aparece, a rota mostra «Sem permissão» e a action recusa.

## Affected Users

- **FINANCEIRO e ADMIN**:
  - devolvem dinheiro ao cliente ou compensam na factura;
  - anulam uma NC emitida por engano, com a contabilidade corrigida;
  - limpam proformas e cotações que já não vão avançar.
- **GESTOR**: cancela proformas e cotações comerciais.
- **Contabilista**: o balancete e a DFC deixam de ter NCs canceladas com lançamento vivo. Cada liquidação
  deixa rasto (lançamento ou abatimento na factura).

## Constraints

- **Append-only**: um documento emitido nunca muda valores; as correcções fazem-se por estorno
  (`CLAUDE.md`, «Dinheiro e documentos»).
- **Uma transacção por operação**: `estornarLancamento` abre hoje a sua própria `prismaBase.$transaction` e
  não se compõe. É preciso uma variante que receba a `tx`, dentro do `contabilidade.service`, porque o
  `gate-periodo` proíbe escrever lançamentos fora dele. Tem de trancar o período (`FOR SHARE`) como a
  actual.
- **Auditoria**: as escritas de estado dos documentos são singulares e passam pelo cliente estendido.
  `NotaCredito`, `Proforma` e `CotacaoComercial` têm de estar em `AUDIT_MODELS` (confirmar).
- **Estados**: antes de `transitar*`, garante-se que o estado-alvo é diferente e permitido; uma transição
  inválida chega ao utilizador como `BusinessRuleError` e não como 500.
- **Concorrência**: liquidar e cancelar a mesma NC ao mesmo tempo — só uma operação passa. A linha da NC
  fica trancada (`FOR UPDATE`) antes de se ler o estado. Na compensação tranca-se também a factura.
- **Migração aditiva** (orquestrador, `migrate diff` não-interactivo):
  - `NotaCredito`: `lancamentoEstornoId`, `lancamentoLiquidacaoId`, `formaLiquidacao` (enum novo
    `FormaLiquidacaoNC`) e `dataLiquidacao`;
  - `Proforma` e `CotacaoComercial`: `motivoCancelamento`.
- **Formulários**:
  - RHF com o **mesmo** schema Zod da action;
  - `startTransition` e `navegarDepoisDaAccao` no submit;
  - datas pelo dia de Maputo (`diaIsoMaputo`/`diaIsoParaData`);
  - UI em pt-PT, com tokens e tema escuro.
- As actions de leitura novas (`obterNotaCredito` já existe) declaram `permiteEmLeitura: true`.

## Open Questions

Nenhuma bloqueante. Ficam para quem implementa confirmar no código:

1. Se `NotaCredito`, `Proforma` e `CotacaoComercial` já estão em `AUDIT_MODELS`.
2. Se o `registarPagamento` da factura gera movimento de caixa ou lançamento. Se gerar, a compensação tem
   de o **evitar** (é neutra na contabilidade) e não reutilizar a função às cegas.
