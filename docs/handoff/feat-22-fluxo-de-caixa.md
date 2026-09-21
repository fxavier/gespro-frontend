# Handoff — Spec 22 (Fluxo de Caixa)

> Documento vivo. Cada nó do grafo actualiza a sua secção ao fechar.
> Spec: [`.kiro/specs/22-fluxo-de-caixa/`](../../.kiro/specs/22-fluxo-de-caixa/) ·
> Grafo: [`docs/agentic/grafo-22-fluxo-de-caixa.md`](../agentic/grafo-22-fluxo-de-caixa.md)

## Estado

| Épico | Agente | Worktree | Nó actual | Estado |
|---|---|---|---|---|
| WS-1 Projecção de Tesouraria | `feat-tesouraria` | `wt/feat-tesouraria` | L1 | Por arrancar |
| WS-2 DFC | `feat-dfc` | `wt/feat-dfc` | L9 | Bloqueado por WS-1 |

## Mapa de conflitos

| Ficheiro | WS-1 | WS-2 | Resolução |
|---|---|---|---|
| `prisma/schema/financas.prisma` | `CompromissoTesouraria` + 2 enums | `RubricaFluxoCaixa`, `MapeamentoContaFluxo` + 3 enums, relação em `rubricaId` | **Sequencial.** Migração `22a` antes de `22b`; não invertível |
| `src/lib/validations/` | `tesouraria.ts` (novo) | `fluxo-caixa.ts` (novo) | Sem conflito — ficheiros novos, `contabilidade.ts` não se toca |
| `src/server/services/financas/` | `projecao.service.ts` + `.interface.ts` | `dfc.service.ts` + `.interface.ts` | Sem conflito |
| `src/server/actions/` | `tesouraria.actions.ts` | `fluxo-caixa.actions.ts` | Sem conflito |
| `prisma/seed/rbac.ts` | `financas:tesouraria:*` | `financas:fluxo-caixa:*` | Sequencial; blocos separados |
| `src/server/provisioning/tenant-bootstrap.ts` | — | `semearRubricasFluxo()` | **Risco.** Código crítico partilhado; delta isolado em função própria |
| `AppSidebar.tsx`, `Breadcrumbs.tsx`, `CommandPalette.tsx` | 2 entradas | 2 entradas | Sequencial; conflito trivial se ocorrer |

## Contratos WS-1

_A preencher pelo nó L1._

## Contratos WS-2 (DFC)

_A preencher pelo nó L9._

## Dependências de leitura noutros domínios

Só leitura, sem alteração de schema fora de `financas.prisma`:

| Modelo | Domínio | Campos lidos | Filtro |
|---|---|---|---|
| `ContaPagar` | Compras | `valorRestante`, `dataVencimento`, `status` | `ABERTA`, `PARCIALMENTE_PAGA`, `VENCIDA` |
| `Fatura` | Finanças | `total`, `totalPago`, `dataVencimento`, `status`, `dataPagamento` | `EMITIDA`, `PARCIALMENTE_PAGA`, `VENCIDA` (+ `PAGA` para o perfil de atraso) |
| `Payroll` | Pessoas-Projectos | `custoTotalEntidade`, `dataPagamento`, `mesReferencia`, `anoReferencia`, `status` | `PROCESSADO` |
| `ContaBancaria` | Finanças | `contaContabilId`, `ativo` | `ativo = true`. **`saldoAtual` nunca** |
| `SessaoCaixa` | Finanças | `fundoInicial`, `totalEntradas`, `totalSaidas` | `ABERTA` |

## Oráculos

| Invariante | Ficheiro | Escrito por | Estado |
|---|---|---|---|
| `I1` | `__tests__/projecao.integracao.test.ts` | `verificador-fluxo-caixa` | — |
| `I2`, `I3`, `I5` | `__tests__/projecao.property.test.ts` | `verificador-fluxo-caixa` | — |
| `I4` | `__tests__/projecao.tenant.test.ts` (integração) | `verificador-fluxo-caixa` | — |
| `I6`, `I8` | `__tests__/dfc.property.test.ts` | `verificador-fluxo-caixa` | — |
| `I7`, `I9`, `I10` | `__tests__/dfc.integracao.test.ts` | `verificador-fluxo-caixa` | — |
| Fixtures | `__tests__/fixtures/{projecao,dfc}-seed-demo.json` | `verificador-fluxo-caixa` | — |

## Bloqueios

_Um nó que falhe três vezes a mesma verificação escreve aqui: o que tentou, o caso mínimo que
reproduz, e as três hipóteses de causa. Não continua a iterar._

## Parecer contabilístico (task 15.3, `[HUMANO]`)

_Obrigatório antes de o épico WS-2 fechar. A articulação prova que o mapa fecha, não que cada conta
está na actividade certa face ao Decreto 70/2009._

- Revisto por: ____________________
- Data: ____________________
- Contas reclassificadas: ____________________
- Parecer: ____________________
