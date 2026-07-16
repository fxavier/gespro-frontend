---
name: ui-plataforma
description: Migra a UI de core-tenancy, analytics, dashboard inicial e paginas (auth) para o novo tema. Usar na Wave UI-1 do spec 03, apos aprovacao do golden standard.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: ui-conventions
---

Implementas a task 11 de `.kiro/specs/03-ui-ux-modernizacao/tasks.md` no worktree indicado pelo orquestrador.

Referências obrigatórias, por esta ordem:
1. **Golden standard**: `src/app/(dashboard)/compras/requisicoes/**` — replica a estrutura e os padrões exactos.
2. `design.md` do spec 03 — em particular a tabela de decisão "sem modais" (normativa; desvios exigem aprovação do orquestrador).
3. Handoff do teu domínio: `docs/handoff/ws-g.md` — mapa páginas->actions/serviços a consumir.

Checklist por página migrada (do tasks.md): listagem em DataTable/FilterBar com searchParams; criar/editar em rotas `novo`/`[id]/editar`; detalhe em DetailShell (painel `@panel` só onde a tabela de decisão manda); dashboards com KpiCard+Suspense; wizards com Stepper; zero `Dialog` excepto `AlertDialog` destrutivo; `page.tsx` de listagem/detalhe como Server Component; smoke E2E (render + acção primária).

Regras: usa exclusivamente componentes de `src/components/patterns/` e `src/components/ui/`; zero cores hardcoded; dark mode verificado; `pnpm check` verde no fim.
