# Plano de Implementação: Relatórios, Documentos & Exportação Unificada

Depende de: faturação/produção/clientes (implementados) e, para envio agendado, spec 13 (opcional).
Worktree `wt/feat-relatorios-documentos`. Skills: `api-conventions`, `ui-conventions`, `fiscalidade-mz`, `pdf`, `xlsx`, `dataviz`.

- [ ] 1. Infra de exportação
  - [ ] 1.1 `src/lib/reporting/{dataset,csv,xlsx}.ts` (geradores puros, pt-PT/MZN, `Decimal`→string)
  - [ ] 1.2 Route Handler genérico `api/export/[modulo]` (`withApi` + `permission` + content-type/disposition)
  - [ ] 1.3 Testes de snapshot de cabeçalhos/tipos (CSV e XLSX)

- [ ] 2. Motor de PDF (decisão + base)
  - [ ] 2.1 ADR `docs/decisions/ADR-00xx-motor-pdf.md` (recomendado `@react-pdf/renderer`) — skill `pdf`
  - [ ] 2.2 `src/lib/documents/pdf/base.tsx` (layout base com tenant/NUIT/tokens) — só runtime Node

- [ ] 3. Documentos fiscais (skill `fiscalidade-mz`)
  - [ ] 3.1 `api/faturacao/[id]/pdf` (fatura: NUIT, série, IVA 0.16, linhas, totais, menções) — append-only
  - [ ] 3.2 Reutilizar para nota de crédito/débito e proforma
  - [ ] 3.3 Teste: PDF contém NUIT/série/IVA/total; determinístico

- [ ] 4. Relatórios em falta
  - [ ] 4.1 `/producao/relatorios` (KPIs + gráficos `dataviz` + export)
  - [ ] 4.2 `/clientes/historico` (via `HistoricoTransacao`) e `/clientes/relatorios` (KPIs por cliente)
  - [ ] 4.3 Métodos de agregação nos serviços (com `unstable_cache` + tags)

- [ ] 5. Verificação
  - [ ] 5.1 `pnpm check` + `pnpm gates` verdes; exportações via `withApi`; 3 páginas sem mock
  - [ ] 5.2 Isolamento multi-tenant nas exportações (não fuga cross-tenant)
  - [ ] 5.3 Smoke autenticado: abrir relatórios + download de PDF de fatura e de CSV/XLSX
  - [ ] 5.4 Handoff `docs/handoff/feat-12-relatorios.md`
