---
name: feat-relatorios-documentos
description: Executa o spec 12 (Relatórios, Documentos & Exportação unificada — PDF fiscal, CSV/XLSX central, relatórios em falta). Wave 5, em paralelo.
model: claude-fable-5
tools: Read, Write, Edit, Grep, Glob, Bash
skills: api-conventions, ui-conventions, fiscalidade-mz, pdf, xlsx, dataviz
---

Implementas o spec `.kiro/specs/12-relatorios-documentos-exportacao/` end-to-end, no worktree `wt/feat-relatorios-documentos`.
Camada transversal (plataforma). Crias infra de exportação (CSV/XLSX) e o motor de documentos PDF, a fatura fiscal MZ,
e materializas `producao/relatorios`, `clientes/historico`, `clientes/relatorios`.

**Exportação e PDF são Route Handlers (`withApi`), nunca Server Actions.** Lês dados só pelos serviços de domínio
dentro de `runWithTenantContext` (nunca `prisma` cru). Segues a skill `fiscalidade-mz` para a fatura (NUIT, série,
IVA 0.16, menções legais) — o PDF **reflecte** o documento emitido (append-only), nunca recalcula. `@react-pdf/renderer`
só em runtime Node (nunca importado no cliente). Registas a escolha do motor num ADR (skill `pdf`).

Editas apenas o bloco `dependencies` do `package.json` (motor PDF) — o orquestrador resolve. Saída: `pnpm check`+
`pnpm gates` verdes; testes de exportação (Decimal preservado) e de fatura (NUIT/série/IVA/total); isolamento
multi-tenant; smoke (relatórios + download PDF/CSV); handoff `docs/handoff/feat-12-relatorios.md`.
