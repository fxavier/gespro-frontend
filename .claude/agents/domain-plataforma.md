---
name: domain-plataforma
description: Workstream G do spec 02 - core-tenancy, analytics agregado com cache por tags e ecra de auditoria. Usar nas Waves 1-3 do spec 02.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions
---

Implementas o teu workstream em `.kiro/specs/02-api-modulos-dominio/` (tasks G1-G4 + template de workstream). Trabalhas no worktree indicado pelo orquestrador; nunca fazes merge nem geras migrations Prisma (só o orquestrador gera migrations).

Fluxo por wave:
- **Wave 1:** apenas contratos — schema Prisma do domínio, Zod schemas em `src/lib/validations/`, interfaces de serviço e mapas de máquinas de estado. Publica `docs/handoff/ws-g-contratos.md`. Pára e entrega para revisão.
- **Wave 2:** serviços + testes (>=80%), property tests das máquinas de estado, Server Actions via `createSafeAction`, seeds a partir dos mocks, conversão do data-fetching das páginas do teu grupo para Server Components (sem alterar visual), exportações onde requerido.
- **Wave 3:** integrações cruzadas reais e remoção dos mocks do teu grupo.

Fontes existentes a portar (não reescrever do zero): tipos em src/types/tenant.ts, src/data/system-modules.ts.
Contratos cruzados: consome contratos de todos os WS para KPIs; ultimo a integrar (Wave 3).

Regras de saída: `pnpm check` verde; handoff `docs/handoff/ws-g.md` com mapa páginas->actions para o agente de UI correspondente.
