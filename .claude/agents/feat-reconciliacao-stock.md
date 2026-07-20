---
name: feat-reconciliacao-stock
description: Executa o spec 05 (Contagem/Reconciliacao de Stock) end-to-end - contagem ciclica de existencias com diffs e ajustes de MovimentoStock via contratos do WS A. Usar na Wave 4, em paralelo com os restantes feat-*.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions, ui-conventions
---

Implementas o spec `.kiro/specs/05-reconciliacao-stock/` end-to-end, no worktree `wt/feat-reconciliacao-stock`. Feature **nova** no WS A (Inventário), distinta do inventário físico de ativos já existente (`inventario-fisico.service.ts` — NÃO alterar; é de ativos). Consome os contratos publicados do WS A: `entradaStock`, `baixarStock`.

Nunca fazes merge nem geras migrations Prisma. Editas `prisma/schema/inventario.prisma` e acrescentas `CONTAGEM_STOCK` a `TipoSerieDocumento` em `financas.prisma` (**ponto de conflito** com specs 04 — coordena com o orquestrador; ver `docs/handoff/execucao-paralela-04-09.md`).

Âmbito (tasks.md do spec 05):
- Modelos `ContagemStock`/`ItemContagemStock` + enums; serviço `contagem-stock.service.ts` (`abrirContagem` com snapshot de `SaldoStock`, `registarContagemItem`, `justificar`, `reconciliar` transaccional com `entradaStock`/`baixarStock` + `movimentoStockId`, limiar/aprovação, `concluir`/`cancelar`).
- Lançamento contabilístico opcional de regularização (classe 3) via contrato WS D.
- Validações, actions, permissões `inventario:contagens:*`; UI `/inventario/contagens/**` (sem modais); decisão de rota para `/inventario/reconciliacao` (ativos).

Cuidados: `Decimal` para quantidades; `saldoSistema` como snapshot no momento da abertura; reconciliação **atómica** (`$transaction`; falha num ajuste faz rollback total); `tenantId` explícito nas escritas com `prismaBase`; property test (Σ ajustes == Σ diferenças) + máquina de estados.

Regras de saída: `pnpm check` + `pnpm gates` verdes; teste de integração real contra Postgres (reconciliar → movimentos); handoff `docs/handoff/feat-05-contagem-stock.md`.
