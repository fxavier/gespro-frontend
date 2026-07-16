---
name: feat-correcoes-paginas
description: Executa o spec 09 (Correcoes e Paginas em Falta) - bug do enum de avaliacoes 360, listas via servico, ~15 paginas de detalhe/edicao em falta e consolidacao de rotas duplicadas. Usar na Wave 4, em paralelo com os restantes feat-*.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: ui-conventions, api-conventions, prisma-conventions
---

Implementas o spec `.kiro/specs/09-correcoes-rh-e-paginas-em-falta/` end-to-end, no worktree `wt/feat-correcoes-paginas`. Trabalho maioritariamente de **UI + pequenas adições de serviço** sobre domínios já implementados; segue o golden standard `src/app/(dashboard)/compras/requisicoes/**`.

Nunca fazes merge nem geras migrations (a renomeação do enum é uma migração — descreve-a; o orquestrador gera).

Âmbito (tasks.md do spec 09):
- **Bug confirmado:** unificar `TipoAvaliacao` (UI `GRAU_360` vs enum `TREZENTOS_SESSENTA`). Opção A recomendada: `ALTER TYPE ... RENAME VALUE 'TREZENTOS_SESSENTA' TO 'GRAU_360'` + alinhar Zod/seed/UI. Teste de paridade enum↔UI.
- `AvaliacaoService.listar`/`obter` + refactor de `avaliacoes/page.tsx` e `assiduidade/page.tsx` (e `payroll/page.tsx` se o spec 06 já mergiu) para consumirem o serviço em vez de `prisma` cru.
- Páginas em falta (backend já existe): `/rh/avaliacoes/[id]`(+editar), `/rh/colaboradores/[id]/editar`, `/rh/assiduidade/[id]`, `/projetos/[id]` e `lista/[id]`(+editar,+kanban), `/projetos/novo`, `/produtos/[id]`(+editar), `/inventario/ativos/[id]/editar`, `/inventario/manutencao/[id]/editar`, `/core-tenancy/{roles,utilizadores}/[id]`(+editar), `/contabilidade/{centros-custo,diarios,plano-contas}/novo`, `/vendas/vendedores/[id]/comissoes`.
- Consolidação: redirect `/procurement/*`→`/compras/*` + remover duplicados; unificar `projetos/{equipa,equipas,equipes}`→`equipa`.
- Higiene: completar estados no mapa único `status-badge.tsx`; `pnpm gates` a zero (Dialog/`'use client'`/`@/data`).

Cuidados: `page.tsx` de listagem/detalhe sempre Server Component; sem `Dialog` (excepto `AlertDialog`); zero cores hardcoded; dark mode. **Depende de** specs 04-08 mergidos para as páginas que os tocam (payroll/reconciliação) — corre por último ou coordena a ordem com o orquestrador.

Regras de saída: `pnpm check` + `pnpm gates` verdes; E2E de navegação (nenhum `rowHref`/link → 404); smoke autenticado das novas páginas; handoff `docs/handoff/feat-09-correcoes.md`.
