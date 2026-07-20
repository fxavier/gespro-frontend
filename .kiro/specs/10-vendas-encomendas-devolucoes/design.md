# Design: Vendas — Encomendas, Devoluções, Trocas e Vendedores

## Arquitectura

Domínio C (comercial), monólito modular. Toda a comunicação com inventário (A) e finanças (D) é por
**funções de contrato publicadas**, dentro da mesma `$transaction`. Sem `@relation` cross-domínio.

## Schema (`prisma/schema/comercial.prisma`) — deltas

Enums (SCREAMING_SNAKE): `StatusEncomenda`, `StatusDevolucao`, `MotivoDevolucao`, `StatusVendedor`.

Modelos novos (todos com `tenantId`, `createdAt/updatedAt`, `deletedAt` onde aplicável, índices em FKs):
- `Encomenda { id, numero, clienteId, vendedorId?, status StatusEncomenda, dataPrevista, subtotal Decimal, iva Decimal, total Decimal, notas?, ... }`
- `ItemEncomenda { id, encomendaId, produtoId, quantidade Decimal, precoUnitario Decimal, total Decimal, quantidadeEntregue Decimal @default(0) }`
- `Devolucao { id, numero, clienteId, vendaId?, faturaId?, motivo MotivoDevolucao, status StatusDevolucao, valorTotal Decimal, notaCreditoId? }`
- `ItemDevolucao { id, devolucaoId, produtoId, quantidade Decimal, valorUnitario Decimal }`
- `Troca { id, numero, devolucaoId, vendaSubstituicaoId, diferenca Decimal, ... }`
- `Vendedor { id, colaboradorId?, userId?, nome, metaMensal Decimal?, status StatusVendedor }`

`Venda`/`Encomenda` ganham `vendedorId String?` (índice). Numeração: novos valores em
`TipoSerieDocumento` (`ENCOMENDA`, `NOTA_DEVOLUCAO`) — **delta coordenado com o orquestrador** (é enum
partilhado). Documentos transaccionais são append-only.

## Serviços (`src/server/services/comercial/`)

- `encomenda.service.ts`: `criar`, `confirmar` (→ `reservarStock` em tx), `converterEmVenda`
  (→ `confirmarConsumoStock` + `faturacao`), `cancelar` (→ `libertarStock`), `listar`, `obter`, `transitar`.
- `devolucao.service.ts`: `criar`, `aprovar`/`processar` (→ `entradaStock` + nota de crédito D em tx),
  `reembolsar` (→ `registarMovimentoCaixa`), `listar`, `obter`.
- `troca.service.ts`: `criar` (compõe devolução processada + nova venda + acerto, tudo em `$transaction`).
- `vendedor.service.ts`: CRUD + `listarComissoes` (delega no serviço de comissões existente).

Todos recebem `Ctx {tenantId,userId}`, `import 'server-only'`, lançam `BusinessRuleError` (código estável),
filtram `tenantId` explicitamente em `findUnique/update/delete`. Máquinas de estado em mapas `TRANSICOES_*`
(client-safe em `src/lib/state-machines.ts`).

## Validações e Actions

- `src/lib/validations/vendas.ts`: `EncomendaSchema` (Create/Update/Filter), `ItemEncomendaSchema`,
  `DevolucaoSchema`, `TrocaSchema`, `VendedorSchema`.
- `src/server/actions/vendas.actions.ts`: uma action por mutação via `createSafeAction`, cada com
  `permission` do catálogo RBAC e `revalidate`. Novas permissões `vendas:encomendas:*`,
  `vendas:devolucoes:*`, `vendas:trocas:*`, `vendas:vendedores:*` em `prisma/seed/rbac.ts`.

## UI (Server Components; folhas `'use client'`; sem modais)

Replicar o golden standard `compras/requisicoes/**`:
- `/vendas/pedidos` (lista SC + filtros em `searchParams`), `/vendas/pedidos/novo`, `/vendas/pedidos/[id]`
  (DetailShell: linhas, reserva, timeline de estados), `/vendas/pedidos/[id]/editar`.
- `/vendas/devolucoes` (+ `novo`, `[id]`), `/vendas/trocas` (+ `novo`, `[id]`), `/vendas/vendedores` (+ `[id]`).
- Estados de `StatusEncomenda`/`StatusDevolucao`/`StatusVendedor` no mapa único `patterns/status-badge.tsx`.

## Integração e riscos

- **Consistência transaccional**: toda a mutação que toca stock/caixa/faturação corre numa única
  `prismaBase.$transaction` com `tenantId` explícito. Risco: reserva/consumo em duplicado → idempotência
  por `@@unique` (ex.: `encomendaId`+item) e verificação de estado antes de transitar.
- **Enum partilhado** `TipoSerieDocumento`: coordenar o delta com o orquestrador (não gerar migration).
