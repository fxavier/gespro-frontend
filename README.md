# GestPro — Pacote de Specs e Agentes

Copiar o conteúdo deste pacote para a raiz do repositório `gespro/`:
- `.kiro/specs/01-*`, `02-*`, `03-*` — specs (requirements/design/tasks) que se juntam aos existentes
- `.claude/agents/` — 19 agentes (orchestrator, code-reviewer, backend-foundation, 7× domain-*, ui-foundation, 7× ui-*, qa-e2e)
- `.claude/skills/` — 3 skills normativas
- `CLAUDE.md` — contexto do repositório para todos os agentes

## Diagnóstico que motivou o plano
- 195 páginas / 21 módulos, 191 `'use client'`, dados 100% mock (`src/data`), login simulado, 1 route handler de exemplo
- 66 ficheiros com `Dialog` (modais) — a eliminar
- Cliente PostgREST configurado mas não usado — substituído por Prisma
- Módulo `core-tenancy` e validações NUIT/BI já existentes — o schema nasce multi-tenant e moçambicano

## Plano de execução (waves)

```
Wave 0   backend-foundation (sequencial)          ── gate: code-reviewer aprova BLOCKING
Wave 1   7× domain-* — só contratos (paralelo)    ── gate: revisão inter-domínio + orchestrator gera migrations
Wave 2   7× domain-* — implementação (paralelo)   ── gate: pnpm check + cobertura ≥80% por WS
Wave 3   integrações cruzadas + WS G              ── gate: zero imports de src/data
Wave UI-0 ui-foundation: tokens+patterns+golden   ── gate: golden standard aprovado
Wave UI-1 7× ui-* — migração das páginas (paralelo)── gate: amostragem code-reviewer por grupo
Wave UI-2 ui-foundation + qa-e2e: a11y, perf, E2E ── gate: E2E verdes em CI, greps de modais/mocks
```

## Como arrancar

```bash
# na raiz do repo, com os ficheiros copiados
claude
> Usa o agente orchestrator: lê docs/status.md (cria se não existir), inicia a Wave 0 delegando ao backend-foundation, e no fim pede revisão ao code-reviewer.
```

Paralelismo: o orquestrador cria worktrees (`git worktree add wt/domain-inventario -b ws-a` etc.) e lança os subagentes por wave. Modelos: orchestrator e code-reviewer em `claude-fable-5`; agentes executores em `claude-sonnet-4-6` (custo/velocidade — podes subir para fable 5 nos workstreams críticos D — finanças — se quiseres margem extra de rigor).

## Estimativa de dimensão
- Spec 01: ~11 tasks (Wave 0)
- Spec 02: 7 workstreams × ~10 tasks (Waves 1–3)
- Spec 03: 16 tasks macro cobrindo as 195 páginas (Waves UI-0–UI-2)
