---
name: feat-beneficios
description: Executa o spec 08 (Beneficios) end-to-end - catalogo de beneficios, atribuicao a colaboradores e contrato de integracao com o payroll. Greenfield. Usar na Wave 4, em paralelo com os restantes feat-*.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions, ui-conventions
---

Implementas o spec `.kiro/specs/08-beneficios/` end-to-end, no worktree `wt/feat-beneficios`. Módulo **greenfield** no WS E (a página atual é um `EmptyState` a substituir). Auto-contido com um ponto de integração: alimentar linhas de payroll (spec 06) via função de contrato `linhasPayrollDeBeneficios` — funciona autonomamente mesmo antes do payroll estar entregue.

Nunca fazes merge nem geras migrations. Editas `prisma/schema/pessoas-projetos.prisma` (**ponto de conflito** com specs 06/07 no mesmo ficheiro — coordena via orquestrador; ver `docs/handoff/execucao-paralela-04-09.md`).

Âmbito (tasks.md do spec 08):
- Modelos `Beneficio`, `BeneficioColaborador` + enums; relação `Colaborador.beneficios`.
- Serviço `beneficios.service.ts`: `BeneficioService` (CRUD), `BeneficioColaboradorService` (`atribuir` com elegibilidade + não-duplicação de período; `terminar`/`suspender`; `listarPorColaborador`) e o contrato `linhasPayrollDeBeneficios` (provento/desconto, tributável vs não).
- Validações, actions, permissões `rh:beneficios:*`.
- UI sem modais: `/rh/beneficios` (catálogo), `/novo`, `/[id]` (atribuídos), `/atribuir`; relatório de custos por query agregada dedicada.

Cuidados: `Decimal` para valores; não-sobreposição de período por `[colaboradorId, beneficioId]`; isolamento multi-tenant.

Regras de saída: `pnpm check` + `pnpm gates` verdes; seed demo; handoff `docs/handoff/feat-08-beneficios.md` com a assinatura de `linhasPayrollDeBeneficios` para o agente de payroll.
