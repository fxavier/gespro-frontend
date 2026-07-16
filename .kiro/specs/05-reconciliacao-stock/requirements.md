# Requisitos: Contagem e Reconciliação de Stock

## Introdução

A página `/inventario/reconciliacao` e o serviço `inventario-fisico.service.ts`
**existem mas cobrem apenas inventário de ATIVOS fixos** (localização/estado de
`Ativo`, via `MovimentacaoAtivo` de tipo `AJUSTE`). **Não existe reconciliação de
existências (stock de produtos):** nenhuma contagem confronta quantidade contada
vs quantidade em sistema, e `baixarStock`/`entradaStock` (contratos do WS A) nunca
são chamados a partir de uma contagem. Este spec cria a **contagem cíclica /
inventário físico de existências** com geração automática de ajustes de stock.

### Estado atual (verificado)

- `inventario-fisico.service.ts`: `registarContagem`, `justificarDiscrepancia`,
  `reconciliar` — operam sobre `Ativo` (ajustam `localizacaoId`, não quantidade).
- `inventario/reconciliacao/page.tsx`: lista inventários de ativos `CONCLUIDO`
  (read-only), `rowHref` → `/inventario/fisico/[id]`.
- Contratos de stock disponíveis (WS A): `entradaStock`, `baixarStock`,
  `reservarStock`, `confirmarConsumoStock`, `libertarStock`.

## Requisitos

### Requisito 1 — Sessão de contagem de stock

1. O sistema DEVE permitir abrir uma `ContagemStock` para uma `Localizacao`
   (ou todas), com âmbito por categoria/produto opcional e um responsável.
2. QUANDO uma contagem é aberta, ENTÃO o sistema DEVE fotografar (snapshot) o
   `saldoSistema` de cada produto/localização no âmbito, para congelar a base de
   comparação (evita drift durante a contagem).
3. NÃO DEVE haver duas contagens `EM_CONTAGEM` sobre a mesma localização+produto
   em simultâneo → `BusinessRuleError('CONTAGEM_EM_ABERTO')`.

### Requisito 2 — Registo de contagem física

1. O sistema DEVE permitir registar `quantidadeContada` por linha
   (`ItemContagemStock`), calculando `diferenca = quantidadeContada − saldoSistema`.
2. Linhas não contadas ficam explicitamente `PENDENTE`; concluir com pendências
   exige confirmação (contagem parcial) e mantém as pendentes sem ajuste.
3. Contagem cega (opcional): esconder `saldoSistema` do operador até fecho.

### Requisito 3 — Reconciliação e ajuste automático de stock

1. QUANDO uma contagem é reconciliada, ENTÃO para cada linha com `diferenca != 0`
   o sistema DEVE gerar um `MovimentoStock` de ajuste — `entradaStock` para
   diferenças positivas, `baixarStock` para negativas — via os contratos do WS A,
   dentro de uma única `$transaction`.
2. Cada ajuste DEVE registar o `movimentoStockId` gerado na linha
   (rastreabilidade) e, quando integrado, o lançamento contabilístico de
   regularização de existências (classe 3 PGC) via contrato do WS D
   (`registarLancamentoContabilistico`).
3. A reconciliação é atómica: ou todos os ajustes persistem, ou nenhum (rollback).

### Requisito 4 — Justificação e aprovação de discrepâncias

1. Discrepâncias acima de um limiar (valor ou %) DEVEM exigir justificação e
   aprovação (`aprovadoPorId`) antes de gerar ajuste → `BusinessRuleError` se
   ausente.
2. Toda a reconciliação e cada ajuste geram auditoria.

### Requisito 5 — Imutabilidade e histórico

1. Após `CONCLUIDA`, `ContagemStock` e itens são imutáveis; nova contagem para
   corrigir. Movimentos de stock são sempre append-only.
2. O sistema DEVE manter histórico de contagens por localização/produto para
   análise de acuracidade (*inventory accuracy*).

### Requisito 6 — UI sem modais

1. `/inventario/contagens` (lista), `/inventario/contagens/nova` (abertura),
   `/inventario/contagens/[id]` (registo + reconciliação). A rota existente
   `/inventario/reconciliacao` passa a apontar para esta árvore ou é consolidada.
2. Server Components; folhas `'use client'`; sem `Dialog` (excepto `AlertDialog`).
   Quantidades `Decimal`→`string`.

## Critérios de Aceitação

1. `pnpm check` verde; cobertura ≥ 80%.
2. Property test: soma dos ajustes gerados == soma das diferenças; após
   reconciliação, `saldoSistema` recomputado == `quantidadeContada` para as linhas
   ajustadas.
3. Integração real: reconciliação chama `entradaStock`/`baixarStock` do WS A na
   mesma transacção (teste contra Postgres, à imagem da Wave 3).
4. Isolamento multi-tenant em todas as leituras/escritas.

## Fontes

- Contratos de stock (WS A): `src/server/services/inventario/stock.service.ts` +
  interface. Modelos de existências: `prisma/schema/inventario.prisma`
  (`MovimentoStock`, `SaldoStock`, `Localizacao`).
- Convenções: `CLAUDE.md`, `.claude/skills/{prisma,api,ui}-conventions`.
