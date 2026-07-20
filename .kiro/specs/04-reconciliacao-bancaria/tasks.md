# Plano de Implementação: Reconciliação Bancária

Depende de: WS D (Finanças) — já implementado. Sem dependências cross-WS novas.

- [ ] 1. Schema e migração
  - [ ] 1.1 Delta `ItemReconciliacaoBancaria` (`itemParId`, `@@unique` de importação) em `prisma/schema/financas.prisma`
  - [ ] 1.2 Migração `05xx_reconciliacao_bancaria` (gerada pelo orquestrador, ordem determinística)

- [ ] 2. Validações (`src/lib/validations/contabilidade.ts`)
  - [ ] 2.1 `ContaBancariaSchema` (Create/Update/Filter)
  - [ ] 2.2 `ImportarExtratoSchema`, `MarcarItemSchema` (`conciliado: boolean`), `AutoMatchSchema`
  - [ ] 2.3 Estender `IniciarReconciliacaoSchema` com validação `dataInicio <= dataFim`

- [ ] 3. Serviço (`src/server/services/financas/contabilidade.service.ts`)
  - [ ] 3.1 `saldoContabilAte()` (agregação de partidas, conta devedora classe 1)
  - [ ] 3.2 Reescrever `iniciarReconciliacao` para calcular saldos reais + bloquear 2ª reconciliação `EM_ANDAMENTO`
  - [ ] 3.3 `gerarItensRazao()` idempotente (itens `LANCAMENTO_CONTABIL` do intervalo)
  - [ ] 3.4 `importarExtrato()` com `createMany`/`skipDuplicates`
  - [ ] 3.5 `sugerirMatches()` (valor + tipoMovimento + janela de datas)
  - [ ] 3.6 Reescrever `marcarItemReconciliado` (aceita `conciliado: boolean`, recalcula diferença em `$transaction`, filtra `tenantId`)
  - [ ] 3.7 Reescrever `concluirReconciliacao` (recálculo + validação de balanceamento) e `cancelarReconciliacao`
  - [ ] 3.8 `obterReconciliacao()` (detalhe razão vs extracto + saldos)

- [ ] 4. Testes
  - [ ] 4.1 Unit ≥80% dos serviços
  - [ ] 4.2 Property test do invariante de balanceamento e da máquina de estados (fast-check)
  - [ ] 4.3 Teste de isolamento multi-tenant (marcar/obter cross-tenant → `NotFoundError`)

- [ ] 5. Actions (`src/server/actions/contabilidade.actions.ts`)
  - [ ] 5.1 `criarContaBancariaAction` + permissões `financas:banca:contas:*` no catálogo RBAC
  - [ ] 5.2 `importarExtratoAction`, `sugerirMatchesAction`, `cancelarReconciliacaoAction`
  - [ ] 5.3 Ajustar `marcarItemReconciliadoAction`/`concluirReconciliacaoAction` aos novos schemas

- [ ] 6. UI (Server Components + folhas 'use client', sem modais)
  - [ ] 6.1 `/contabilidade/reconciliacao/nova` (form de abertura por conta bancária)
  - [ ] 6.2 `/contabilidade/reconciliacao/[id]` workspace de matching (2 colunas + saldos)
  - [ ] 6.3 `/contabilidade/reconciliacao/[id]/importar` (upload CSV)
  - [ ] 6.4 Gestão de contas bancárias (`/contabilidade/contas-bancarias`)
  - [ ] 6.5 Estados de `StatusReconciliacao` no mapa único `status-badge.tsx`

- [ ] 7. Exportação e verificação
  - [ ] 7.1 Route Handler `api/contabilidade/reconciliacao/[id]/export` (CSV/PDF) via `withApi`
  - [ ] 7.2 `pnpm check` verde + `pnpm gates` verde
  - [ ] 7.3 Smoke autenticado: abrir → gerar → importar → auto-match → concluir
