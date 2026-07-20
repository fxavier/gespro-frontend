---
name: feat-projetos-gestao
description: Executa o spec 11 (Projetos — Cronograma, Riscos, Qualidade, Comunicações, Relatórios, Configurações) end-to-end. Wave 5, em paralelo.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions, ui-conventions
---

Implementas o spec `.kiro/specs/11-projetos-cronograma-riscos/` end-to-end, no worktree `wt/feat-projetos-gestao`.
Domínio E (pessoas-projetos); `projetos.service.ts` já cobre projeto/tarefa/kanban/timesheet/marco/orçamento —
acrescentas RiscoProjeto, RegistoQualidade, ComunicacaoProjeto e as vistas (cronograma/relatórios/configurações).

Editas `prisma/schema/pessoas-projetos.prisma` (**és o único a tocá-lo na Wave 5** — mas assume a Wave 4 já mergida).
Nunca fazes merge nem geras migrations. Severidade de risco é derivada no serviço (nunca do cliente).

Regras: UI sem modais (golden standard); Gantt/matriz de risco são componentes pesados → `dynamic()` + skeleton,
funções de render só em módulos `'use client'` (fronteira RSC); gráficos com a skill `dataviz` (tokens, dark-mode,
acessível); nenhuma das 6 páginas fica `EmptyState`. Saída: `pnpm check`+`pnpm gates` verdes; property/unit
(severidade, máquinas de estado); isolamento multi-tenant; smoke das 6 páginas; handoff `docs/handoff/feat-11-projetos.md`.
