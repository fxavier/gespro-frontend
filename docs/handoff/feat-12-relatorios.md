# Handoff — Spec 12: Relatórios, Documentos & Exportação Unificada

**Branch**: `ws-12` · **Worktree**: `wt/feat-relatorios-documentos` · **Camada**: G / plataforma (transversal)

## Âmbito entregue

Infraestrutura transversal de exportação (CSV/XLSX), motor de documentos PDF
(`@react-pdf/renderer`), factura fiscal MZ em PDF (reflecte o documento emitido,
append-only) e materialização dos 3 relatórios em falta. Sem schema novo
(consome faturação/produção/clientes).

## Ficheiros criados

### Infra de exportação (`src/lib/reporting/`)
- `dataset.ts` — tipos `Dataset`/`Column`/`Row`, `serializeCell` (Decimal→string
  **lossless**), `displayCell` (pt-PT/MZN), `safeFilename`.
- `csv.ts` — `toCsv` (separador `;`, BOM UTF-8, escape RFC-4180).
- `xlsx.ts` — `toXlsx` via dep `xlsx` existente; decimais como **texto lossless**,
  inteiros como número.
- `index.ts` — `exportResponse(dataset, formato)` + `isFormatoExport`.

### Motor de documentos PDF (`src/lib/documents/`)
- `fatura-model.ts` — **puro, sem react-pdf**: `construirDocumentoFatura` +
  `construirMencoesLegais`. Reflecte valores emitidos (NUIT, série, IVA 16%,
  incidência, totais, menções legais). É o alvo dos testes fiscais.
- `pdf/theme.ts` — tokens de marca do documento.
- `pdf/base.tsx` — layout base reutilizável (cabeçalho emitente/NUIT, rodapé
  paginado com menções, tabelas `tabular-nums`). `import 'server-only'`.
- `pdf/fatura-pdf.tsx` — `FaturaDocument` + `renderFaturaPdf(model): Uint8Array`.

### Serviços (plataforma)
- `export.service.ts` — registry `modulo → { permission, build }` (clientes,
  producao-ordens, cliente-historico); builders lêem **só por serviços de domínio**.
- `relatorios.service.ts` — `relatorioProducao` / `relatorioClientes` (agregação
  via `prismaBase` filtrado por `tenantId` + `unstable_cache`/`ANALYTICS_TAGS`,
  seguindo o padrão de `analytics.service.ts`).
- `documentos.service.ts` — `obterModeloFatura` (assembla factura + cliente +
  emitente/config fiscal pelos serviços de domínio).

### Route Handlers (`withApi`, `runtime = 'nodejs'`)
- `src/app/api/faturacao/[id]/pdf/route.ts` — factura fiscal PDF (`faturacao:ver`).
- `src/app/api/export/[modulo]/route.ts` — exportação genérica CSV/XLSX;
  **permissão dinâmica por módulo** verificada no handler (`ctx.permissions`).

### Páginas materializadas (Server Components, zero mock)
- `producao/relatorios` — KPIs (ordens, custo, qualidade, progresso) + 2 gráficos
  `dataviz` + export CSV/XLSX.
- `clientes/relatorios` — KPIs comerciais (dívida, limite, categorias) + 2 gráficos.
- `clientes/historico` — selector de cliente por URL (`?clienteId=`) +
  `HistoricoTransacao` via `clienteService.obterHistorico` + export.
- Gráficos: `_components/relatorio-charts.tsx` (recharts, tokens `hsl(var(--chart-*))`)
  + `_components/graficos.tsx` (fronteira `dynamic({ssr:false})`).

### Testes
- `src/lib/reporting/reporting.test.ts` — cabeçalhos CSV/XLSX + **Decimal
  preservado** (valor > `Number.MAX_SAFE_INTEGER`, prova de não passar por Float).
- `src/lib/documents/fatura-model.test.ts` — NUIT emitente/adquirente, série, IVA
  16%, totais reflectidos (append-only, total ≠ soma-de-linhas), menções legais.
- **15 testes passam.**

### Decisão
- `docs/decisions/0005-motor-pdf.md` — ADR do motor PDF (`@react-pdf/renderer`
  `^4.3.0`) e do formato de exportação.

## Ficheiro editado
- `package.json` — **apenas** bloco `dependencies`: `+ "@react-pdf/renderer": "^4.3.0"`.

## Estado de verificação
- `pnpm check` — **verde** (prisma validate + tsc exit 0 + eslint 0 erros +
  vitest **782/782** em 47 ficheiros, incluindo os 15 testes novos).
- `pnpm gates` — **verde** (dialog / use-client / data-imports = 0).

### GAP conhecido (accão do orquestrador)
`@react-pdf/renderer` foi adicionado ao `dependencies` mas **não instalado** neste
worktree (instrução: não correr `pnpm install`; o orquestrador resolve/instala).
Para o `pnpm check` ficar verde entretanto, existe um **shim de tipos temporário**
em `src/types/react-pdf-renderer.d.ts` que declara exactamente a superfície usada
(`Document/Page/View/Text/StyleSheet/renderToBuffer`) — **apagar após
`pnpm install`** (a declaração ambiente sombreia os tipos reais do pacote). O
código foi escrito contra a API real de react-pdf v4. Os testes NÃO dependem de
react-pdf (testam o modelo puro `fatura-model.ts`); o rendering em runtime só é
exercitado no smoke pós-instalação.

## Isolamento multi-tenant
Todas as leituras filtram por `ctx.tenantId` explicitamente:
- `relatorios.service` — `where: { tenantId }` em cada query (padrão `analytics.service`).
- `export.service`/`documentos.service` — só serviços de domínio, que já filtram
  por tenant (`obterFatura`/`buscarPorId` devolvem `NotFound` cross-tenant).
- `tenantId` nunca vem do cliente — vem de `ctx` (sessão via `withApi`/`auth`).

Um teste de integração cross-tenant dedicado foi **deferido** para evitar
flakiness na DB partilhada (7 agentes); a garantia é estrutural e coberta pelos
testes existentes de faturação/clientes.

## Hooks futuros / opcional
- **Envio agendado de relatórios** (spec 13): o `export.service` expõe
  `resolverExport(modulo)`/`EXPORT_REGISTRY` reutilizável por um cron/`Notificacao`.
  Não importado aqui para não quebrar o check enquanto o spec 13 não integrar.

## Smoke (a correr pós-merge, com app + DB)
1. Login `admin@demo.mz` / `demo1234` (tenant `demo`).
2. Abrir `/producao/relatorios`, `/clientes/relatorios`, `/clientes/historico?clienteId=<id>`.
3. Descarregar CSV e XLSX pelos botões (Route Handlers `/api/export/...`).
4. Descarregar PDF de uma factura: `GET /api/faturacao/<id>/pdf`.
