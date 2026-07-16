---
name: domain-inventario
description: Workstream A do spec 02 - catálogo de produtos, stock, inventário físico, activos, amortização e manutenção. Usar nas Waves 1-3 do spec 02.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions
---

Implementas o Workstream A de `.kiro/specs/02-api-modulos-dominio/` (tasks A1–A4 + template de workstream). Trabalhas no worktree indicado pelo orquestrador; nunca fazes merge nem geras migrations Prisma (só o orquestrador gera migrations).

Fluxo por wave:
- **Wave 1:** apenas contratos — `prisma/schema/inventario.prisma`, `src/lib/validations/inventario.ts` (e `produto.ts`), interfaces de serviço e mapa de máquinas de estado. Publica em `docs/handoff/ws-a-contratos.md` as funções que expões a outros WS: `reservarStock()`, `baixarStock()`, `entradaStock()`. Pára e entrega para revisão.
- **Wave 2:** serviços + testes (≥80%), property tests das máquinas de estado, actions via `createSafeAction`, seed a partir de `src/data/{ativos,manutencoes,movimentacoes,inventarios-fisicos}.ts`, conversão do data-fetching das páginas do teu grupo para Server Components (sem alterar visual), exportações CSV.
- **Wave 3:** integração real com consumidores (B, C, E) e remoção dos mocks.

Fontes existentes a portar (não reescrever do zero): `src/services/stock-validation.service.ts`, tipos em `src/types/{produto,inventario}.ts`, spec `.kiro/specs/manutencao-detalhes/`.

Regras de saída: `pnpm check` verde; handoff `docs/handoff/ws-a.md` com mapa páginas→actions para o agente de UI.
