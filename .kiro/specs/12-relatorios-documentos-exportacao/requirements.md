# Requisitos: Relatórios, Documentos & Exportação Unificada

## Introdução

O projecto exporta de forma dispersa (só a dep `xlsx`; specs 04/06 hand-rolam CSV/PDF por feature) e **não
tem motor de PDF**. Documentos fiscais (fatura em `/faturacao/[id]`) não têm impressão/PDF. Páginas de
relatório (`producao/relatorios`, `clientes/historico`, `clientes/relatorios`) são `EmptyState`. Este spec
cria **infraestrutura transversal** de documentos/relatórios/exportação e materializa os relatórios em falta.

Skills obrigatórias: `api-conventions`, `ui-conventions`, `fiscalidade-mz` (fatura MZ), `pdf`, `xlsx`, `dataviz`.

## Requisitos

### Requisito 1 — Serviço central de exportação

1. DEVE existir um serviço/abstração `src/server/services/plataforma/export.service.ts` (ou `src/lib/reporting/`)
   que gere **CSV e XLSX** a partir de datasets tipados (colunas + linhas), com `Decimal`→string, locale pt-PT,
   MZN e cabeçalhos em Português. Reutilizável por qualquer domínio.
2. DEVE ser exposto por **Route Handlers** (`withApi`, não Server Actions) com `permission` e streaming de ficheiro,
   substituindo exportações ad-hoc. Nomeação e content-type corretos (`text/csv`, `application/vnd.openxmlformats...`).

### Requisito 2 — Motor de documentos PDF

1. DEVE ser escolhido e integrado **um motor de PDF server-side** (recomendado `@react-pdf/renderer` por ser
   declarativo, sem headless browser; alternativa `pdfkit`). Decisão registada em ADR (skill `pdf`).
2. Um layout base reutilizável (cabeçalho com tenant/logo/NUIT, rodapé, tabelas `tabular-nums`, tokens de marca)
   serve faturas, recibos, notas e relatórios.

### Requisito 3 — Fatura fiscal (MZ) em PDF

1. `/faturacao/[id]` DEVE ter Route Handler `api/faturacao/[id]/pdf` que gera a fatura conforme os requisitos
   fiscais moçambicanos (skill `fiscalidade-mz`): NUIT emitente/cliente, número de série, data, IVA (fração 0.16),
   valores por linha e totais, menções legais. Append-only (reflecte o documento emitido, nunca recalcula).
2. Também nota de crédito/débito e proforma reutilizam o mesmo layout.

### Requisito 4 — Relatórios em falta

1. `/producao/relatorios`: KPIs de produção (ordens, custo, mão-de-obra, qualidade) via serviço de produção +
   `export.service` + gráficos `dataviz`. Sem mock.
2. `/clientes/historico`: histórico transaccional do cliente via `HistoricoTransacao` (modelo existente) + serviço.
3. `/clientes/relatorios`: KPIs comerciais por cliente (vendas, dívida, margem) via serviço + `dataviz`.

## Critérios de Aceitação

1. `pnpm check`/`pnpm gates` verdes; exportações via `withApi` (não via Server Action); zero mock nas 3 páginas.
2. PDF de fatura válido, determinístico e append-only; teste que verifica NUIT/série/IVA/total presentes.
3. Exportação CSV/XLSX testada (snapshot de cabeçalhos + tipos numéricos); Decimal preservado.
4. Isolamento multi-tenant (não exporta dados de outro tenant); smoke autenticado das 3 páginas + download de PDF/CSV.

## Fontes

- Código: `src/app/(dashboard)/faturacao/**`, `src/server/services/plataforma/analytics.service.ts`,
  `HistoricoTransacao` (`comercial.prisma`), `producao.service.ts`.
- Fiscalidade: skill `fiscalidade-mz` (IVA, NUIT, séries, plano PGC-NIRF).
- Skills de formato: `pdf`, `xlsx`, `dataviz`. `CLAUDE.md` §Fluxo de dados (exportação = Route Handler).
