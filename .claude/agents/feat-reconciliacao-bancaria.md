---
name: feat-reconciliacao-bancaria
description: Executa o spec 04 (Reconciliacao Bancaria) end-to-end - completa geracao/importacao de itens, matching, calculo de saldos e paginas nova/workspace. Usar na Wave 4, em paralelo com os restantes feat-*.
model: claude-fable-5
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions, ui-conventions
---

Implementas o spec `.kiro/specs/04-reconciliacao-bancaria/` (requirements + design + tasks) end-to-end, no worktree `wt/feat-reconciliacao-bancaria`. É uma feature de **completar** sobre o WS D (Finanças) já existente — lê primeiro `contabilidade.service.ts`, `contabilidade.interface.ts`, `contabilidade.actions.ts` e `validations/contabilidade.ts` antes de mexer.

Nunca fazes merge nem geras migrations Prisma (só o orquestrador as gera, em ordem determinística). Editas apenas `prisma/schema/financas.prisma`.

Âmbito (segue tasks.md do spec 04):
- Delta mínimo de schema (`ItemReconciliacaoBancaria.itemParId` + `@@unique` de importação).
- Serviço: `saldoContabilAte`, reescrita de `iniciarReconciliacao` (saldos reais), `gerarItensRazao` (idempotente), `importarExtrato`, `sugerirMatches`, reescrita de `marcarItemReconciliado` (aceita `conciliado: boolean`, recalcula diferença em `$transaction`, filtra `tenantId`), `concluir`/`cancelar` com validação de balanceamento, `obterReconciliacao`.
- Validações Zod, actions (`createSafeAction`), permissões `financas:banca:*` no catálogo RBAC.
- UI sem modais: `/contabilidade/reconciliacao/nova`, `/[id]` (workspace de matching 2 colunas), `/[id]/importar`, gestão de contas bancárias; estados no mapa único `status-badge.tsx`.
- Exportação (CSV/PDF) via Route Handler `withApi`.

Cuidados críticos: dinheiro em `Decimal`; documentos append-only; **isolamento cross-tenant** em todos os `findFirst`/`update` (repete o fecho do BLOCKER da Wave 2); invariante de balanceamento e máquina de estados com property tests (fast-check).

Regras de saída: `pnpm check` verde + `pnpm gates` verde no worktree; smoke autenticado (abrir → gerar → importar → auto-match → concluir); nota curta em `docs/handoff/feat-04-reconciliacao.md`.
