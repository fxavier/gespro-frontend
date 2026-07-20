# Execução Paralela — Specs 04–09 (Wave 4)

Plano para executar os specs 04–09 com os 6 agentes `feat-*` em paralelo,
coordenados pelo `orchestrator`. Mantém as regras do programa: um worktree por
agente, migrations geradas **só** pelo orquestrador em ordem determinística, merge
só após parecer do `code-reviewer`.

## Agentes e worktrees

| Agente | Spec | Worktree | Modelo | Skills |
|---|---|---|---|---|
| `feat-reconciliacao-bancaria` | 04 | `wt/feat-reconciliacao-bancaria` | fable-5 | prisma, api, ui |
| `feat-reconciliacao-stock` | 05 | `wt/feat-reconciliacao-stock` | sonnet-4-6 | prisma, api, ui |
| `feat-payroll` | 06 | `wt/feat-payroll` | fable-5 | prisma, api, ui, fiscalidade-mz |
| `feat-recrutamento` | 07 | `wt/feat-recrutamento` | sonnet-4-6 | prisma, api, ui |
| `feat-beneficios` | 08 | `wt/feat-beneficios` | sonnet-4-6 | prisma, api, ui |
| `feat-correcoes-paginas` | 09 | `wt/feat-correcoes-paginas` | sonnet-4-6 | ui, api, prisma |

## Mapa de conflitos (ficheiros partilhados)

O paralelismo é real, mas há ficheiros tocados por mais do que um agente. O
orquestrador é o **único** a fazer merge e a resolver estes pontos:

- `prisma/schema/pessoas-projetos.prisma` — **06, 07, 08 e 09** (payroll, recrutamento,
  benefícios, e o rename do enum de avaliações). Cada agente acrescenta modelos/enums
  distintos; o único choque semântico é o rename do enum (09). Merge: 06→07→08→09.
- `prisma/schema/financas.prisma` — **04** (delta reconciliação) e **05** (acrescenta
  `CONTAGEM_STOCK` a `TipoSerieDocumento`). Sem sobreposição de linhas; merge 04→05.
- `src/lib/validations/rh.ts` e `prisma/seed/rbac.ts` — 06/07/08/09 acrescentam
  schemas/permissões. Aditivo; resolver por concatenação.
- `patterns/status-badge.tsx` — 04, 05, 07, 08, 09 acrescentam estados ao mapa único.
  Aditivo.
- `src/app/(dashboard)/rh/payroll/page.tsx` — 06 liga ao serviço; 09 pode refactorizar
  para o serviço. **09 corre depois de 06**.

## Ordem de merge (determinística) e dependências

```
04 ┐
05 ┼─ independentes entre si (financas vs inventario) → merge 04, 05
   │
06 ─ payroll (base para 08)
08 ─ beneficios (contrato p/ payroll; merge após 06)
07 ─ recrutamento (independente)
   │
09 ─ correcoes/paginas — POR ÚLTIMO (toca páginas de 06 e depende do resto mergido)
```

- 04, 05, 06, 07, 08 podem **desenvolver** todos em paralelo desde o início.
- 09 pode desenvolver a parte de bug/enum e páginas de domínios estáveis em paralelo,
  mas **integra por último** (páginas que tocam payroll/reconciliação e a limpeza de
  rotas duplicadas assumem o resto já mergido).
- Após cada merge, o orquestrador regenera migrations na ordem
  `financas → inventario → pessoas-projetos` e corre `pnpm check` na branch de integração.

## Gate por agente (antes do merge)

1. `pnpm check` verde no worktree.
2. `pnpm gates` verde (Dialog fora de AlertDialog = 0; `'use client'` em page.tsx de
   listagem/detalhe = 0; imports `@/data` = 0).
3. Cobertura de serviços ≥80% (payroll ≥90% no motor de cálculo).
4. Parecer do `code-reviewer` sem BLOCKERs (foco: isolamento multi-tenant, `Decimal`,
   partidas dobradas, máquinas de estado, sem modais).
5. `qa-e2e` corre os fluxos novos após a Wave 4 integrada.

## Arranque (a partir da raiz do repo)

```bash
claude
> Usa o agente orchestrator: lê docs/status.md e docs/handoff/execucao-paralela-04-09.md,
  cria os worktrees wt/feat-* e lança em paralelo os 6 agentes feat-* (Wave 4) com o
  excerto de tasks.md de cada spec 04–09. Gera migrations só tu, na ordem indicada,
  e pede revisão ao code-reviewer antes de cada merge.
```

O orquestrador delega com a Task tool, passando a cada agente: (1) o `tasks.md` do seu
spec, (2) este handoff (mapa de conflitos + ordem de merge), (3) o worktree.
