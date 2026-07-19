# Plano de Implementação: Vendas — Encomendas, Devoluções, Trocas e Vendedores

Depende de: WS A (inventário) e WS D (finanças) — implementados. Worktree `wt/feat-vendas-encomendas`.
Skills: `prisma-conventions`, `api-conventions`, `ui-conventions`. Migrations só o orquestrador.

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums `StatusEncomenda`, `StatusDevolucao`, `MotivoDevolucao`, `StatusVendedor`
  - [ ] 1.2 Modelos `Encomenda`/`ItemEncomenda`, `Devolucao`/`ItemDevolucao`, `Troca`, `Vendedor`; `vendedorId` em `Venda`
  - [ ] 1.3 Delta `TipoSerieDocumento` (`ENCOMENDA`, `NOTA_DEVOLUCAO`) — coordenar com o orquestrador
  - [ ] 1.4 Migração `11xx_vendas_encomendas` (gerada pelo orquestrador)

- [ ] 2. Máquinas de estado e validações
  - [ ] 2.1 `TRANSICOES_ENCOMENDA`/`TRANSICOES_DEVOLUCAO` em `src/lib/state-machines.ts` (client-safe)
  - [ ] 2.2 `src/lib/validations/vendas.ts` (Encomenda/Devolucao/Troca/Vendedor: Create/Update/Filter)

- [ ] 3. Serviços (`server-only`, `Ctx`, filtragem `tenantId`)
  - [ ] 3.1 `encomenda.service.ts` (criar/confirmar→reservarStock/converterEmVenda/cancelar→libertarStock/listar/obter)
  - [ ] 3.2 `devolucao.service.ts` (criar/aprovar→entradaStock+nota de crédito/reembolsar→movimento caixa)
  - [ ] 3.3 `troca.service.ts` (devolução processada + nova venda + acerto, atómico)
  - [ ] 3.4 `vendedor.service.ts` (CRUD + listarComissoes)

- [ ] 4. Testes (≥80%)
  - [ ] 4.1 Property: invariante de stock (reserva+consumo == baixa; devolução repõe) e nota de crédito débito==crédito
  - [ ] 4.2 Property: máquinas de estado (transições inválidas → `BusinessRuleError`)
  - [ ] 4.3 Isolamento multi-tenant (cross-tenant → `NotFoundError`)

- [ ] 5. Actions e permissões
  - [ ] 5.1 `vendas.actions.ts` via `createSafeAction` (encomenda/devolucao/troca/vendedor)
  - [ ] 5.2 Permissões `vendas:{encomendas,devolucoes,trocas,vendedores}:*` no RBAC (aditivo)

- [ ] 6. UI (golden standard, sem modais)
  - [ ] 6.1 `/vendas/pedidos` (+`novo`,`[id]`,`[id]/editar`) — Server Components + folhas client
  - [ ] 6.2 `/vendas/devolucoes` (+`novo`,`[id]`), `/vendas/trocas` (+`novo`,`[id]`)
  - [ ] 6.3 `/vendas/vendedores` (+`[id]`) via serviço; estados no `status-badge.tsx`

- [ ] 7. Verificação
  - [ ] 7.1 `pnpm check` + `pnpm gates` verdes
  - [ ] 7.2 Smoke autenticado: encomenda→confirmar→fatura; devolução→aprovar; troca ponta-a-ponta
  - [ ] 7.3 Handoff `docs/handoff/feat-10-vendas.md` (ficheiros tocados, decisões, gaps)
