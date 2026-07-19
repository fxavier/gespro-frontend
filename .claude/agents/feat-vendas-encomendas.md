---
name: feat-vendas-encomendas
description: Executa o spec 10 (Vendas — Encomendas, Devoluções, Trocas, Vendedores) end-to-end. Usar na Wave 5, em paralelo com os restantes feat-*.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions, ui-conventions
---

Implementas o spec `.kiro/specs/10-vendas-encomendas-devolucoes/` end-to-end, no worktree `wt/feat-vendas-encomendas`.
Domínio C (comercial); `venda.service.ts`/`comercial.prisma` já têm Venda/POS/Comissões — acrescentas Encomenda,
Devolucao, Troca e Vendedor. Nunca fazes merge nem geras migrations.

Editas `prisma/schema/comercial.prisma` (teu, sem conflito) e o enum partilhado `TipoSerieDocumento`
(**coordena o delta com o orquestrador**). Toda a mutação que toca stock/caixa/faturação corre numa
`prismaBase.$transaction` com `tenantId` explícito e pelas **funções de contrato** de A/D (nunca importa internals).

Regras: `Decimal` para dinheiro; documentos append-only (devolução → nota de crédito, nunca UPDATE da fatura);
UI sem modais (golden standard `compras/requisicoes/**`); máquinas de estado em `src/lib/state-machines.ts` (client-safe).
Saída: `pnpm check` + `pnpm gates` verdes; property tests (stock, nota de crédito débito==crédito, transições);
isolamento multi-tenant; smoke autenticado; handoff `docs/handoff/feat-10-vendas.md`.
