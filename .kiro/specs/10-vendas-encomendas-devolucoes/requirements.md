# Requisitos: Vendas — Encomendas, Devoluções, Trocas e Vendedores

## Introdução

O domínio comercial tem Venda/POS/Comissões implementados (`venda.service.ts`,
`comercial.prisma`: `Venda`, `ItemVenda`, `SessaoPOS`, `RegraComissao`, `Comissao`), mas
quatro fluxos operacionais estão por implementar — as páginas
`vendas/{pedidos,devolucoes,trocas,vendedores}` são apenas `EmptyState` e **não existem os
modelos** correspondentes. Este spec acrescenta-os end-to-end (schema → serviço → actions → UI),
integrando com os contratos de inventário (A) e finanças (D).

Skills obrigatórias: `prisma-conventions`, `api-conventions`, `ui-conventions`.

## Requisitos

### Requisito 1 — Encomendas de venda (pedidos)

1. DEVE existir `Encomenda` (cabeçalho) + `ItemEncomenda` (linhas com `Prisma.Decimal` para
   preço/quantidade/total), com `clienteId` escalar (FK cross-domínio, sem `@relation`), `tenantId`,
   soft delete e numeração via `proximoNumeroSerie` (contrato D, `TipoSerieDocumento`).
2. Máquina de estados `StatusEncomenda` (`RASCUNHO → CONFIRMADA → PARCIALMENTE_ENTREGUE → CONCLUIDA`,
   com `CANCELADA`), com mapa `TRANSICOES_ENCOMENDA` e `transitar()`.
3. Confirmar uma encomenda **reserva stock** (`reservarStock`, contrato A) dentro de `$transaction`;
   cancelar **liberta** (`libertarStock`). Converter em venda/fatura **confirma consumo** (`confirmarConsumoStock`).
4. DEVE ser possível **converter** uma encomenda confirmada numa `Venda`/fatura (reutilizando
   `faturacao`/`venda.service`), copiando linhas e mantendo rastreio `encomendaId` na venda.

### Requisito 2 — Devoluções (notas de devolução)

1. DEVE existir `Devolucao` + `ItemDevolucao` referenciando a `Venda`/`Fatura` de origem (`vendaId`/`faturaId`
   escalares) e o `clienteId`. Valores em `Decimal`; documento **append-only**.
2. Aprovar/processar uma devolução DEVE, em `$transaction`: dar **entrada de stock** (`entradaStock`,
   contrato A) dos itens devolvidos e emitir **nota de crédito** (contrato D/faturação) — nunca alterar a
   fatura original.
3. Reembolso opcional regista **movimento de caixa/banco** (`registarMovimentoCaixa`, contrato D).
4. Máquina de estados `StatusDevolucao` (`PENDENTE → APROVADA → PROCESSADA`, com `REJEITADA`).

### Requisito 3 — Trocas

1. DEVE existir `Troca` que compõe uma `Devolucao` (entrada de stock do artigo devolvido) com uma
   **nova venda** do artigo substituto, liquidando apenas a diferença de valor (a favor do cliente ou da empresa).
2. A troca DEVE ser atómica (`$transaction`): devolução processada + nova venda + acerto de caixa/nota.

### Requisito 4 — Vendedores e ligação a comissões

1. DEVE existir `Vendedor` (ligado a `Colaborador`/`User` por FK escalar) com metas e estado, e a lista
   `vendas/vendedores` DEVE consumir o serviço (sem `prisma` cru).
2. Cada `Venda`/`Encomenda` DEVE poder registar `vendedorId`; o cálculo de `Comissao` (já existente)
   passa a resolver a regra por vendedor. Página `/vendas/vendedores/[id]/comissoes` (ver spec 09) lista as comissões do vendedor.

## Critérios de Aceitação

1. `pnpm check` e `pnpm gates` verdes; zero `Dialog`/`'use client'` proibidos; zero `@/data`.
2. Property tests: invariante de stock (reserva+consumo == baixa; devolução repõe), balanceamento das
   notas de crédito (débito==crédito), e máquinas de estado (transições inválidas rejeitadas).
3. Teste de isolamento multi-tenant (obter/processar cross-tenant → `NotFoundError`).
4. Smoke autenticado: criar encomenda → confirmar (reserva) → converter em fatura; registar devolução →
   aprovar (entrada de stock + nota de crédito); troca ponta-a-ponta.

## Fontes

- Código: `src/server/services/comercial/venda.service.ts`, `prisma/schema/comercial.prisma`.
- Contratos: A (`entradaStock`/`reservarStock`/`libertarStock`/`confirmarConsumoStock`), D
  (`registarLancamentoContabilistico`/`registarMovimentoCaixa`/`proximoNumeroSerie`) — `CLAUDE.md` §Integração.
- Golden standard UI: `src/app/(dashboard)/compras/requisicoes/**`.
