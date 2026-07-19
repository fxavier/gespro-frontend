# Design: Relatórios, Documentos & Exportação Unificada

## Arquitectura

Camada transversal (domínio G/plataforma) reutilizável por todos os domínios. **Exportação e documentos são
Route Handlers** (`withApi`), nunca Server Actions (não são mutações). Leitura de dados sempre pelos serviços de
domínio dentro de `runWithTenantContext` — os handlers não acedem a `prisma` cru.

## Componentes

- `src/lib/reporting/dataset.ts` — tipo `Dataset<T>` (colunas tipadas + linhas), formatação pt-PT/MZN, `Decimal`→string.
- `src/lib/reporting/csv.ts` e `src/lib/reporting/xlsx.ts` (usa a dep `xlsx` existente) — geradores puros e testáveis.
- `src/lib/documents/pdf/base.tsx` — layout base (`@react-pdf/renderer`): cabeçalho (tenant, NUIT, logo via tokens),
  rodapé, componentes de tabela/totais. Decisão do motor em `docs/decisions/ADR-00xx-motor-pdf.md`.
- `src/lib/documents/fatura.tsx`, `recibo.tsx`, `nota.tsx` — documentos fiscais compostos sobre o layout base.

## Route Handlers (`src/app/api/...`, `withApi`)

- `api/export/[modulo]/route.ts?formato=csv|xlsx` — genérico, resolve o dataset pelo serviço do módulo + `permission`.
- `api/faturacao/[id]/pdf/route.ts` — gera a fatura fiscal (append-only). Idem nota de crédito/proforma.
- `api/producao/relatorios/route.ts`, `api/clientes/[id]/historico/route.ts` — export dos relatórios.

Cada handler: sessão → permissão → `runWithTenantContext` → serviço → gerador → `Response` com content-type e
`Content-Disposition`. Sem estado; streaming quando o dataset for grande.

## Serviços de agregação

- Estender `analytics.service.ts`/domínios com métodos de relatório (produção, cliente) devolvendo `Dataset`/DTOs
  serializáveis (SC→CC com `Decimal`→string). `unstable_cache` + `ANALYTICS_TAGS` para KPIs.

## UI

- `/producao/relatorios`, `/clientes/historico`, `/clientes/relatorios`: Server Components a consumir os serviços;
  gráficos com `dataviz` (paleta por tokens, dark-mode, acessível); botões de exportação que apontam para os
  Route Handlers (download nativo, sem fetch manual). Skeletons por secção.

## Fiscalidade (MZ)

Seguir a skill `fiscalidade-mz`: IVA 0.16 (fração `Prisma.Decimal`), NUIT emitente/cliente, numeração de série
(`proximoNumeroSerie`, contrato D), menções legais e plano PGC-NIRF. O PDF **reflecte** o documento emitido
(valores persistidos), nunca recalcula — coerente com a regra append-only do `CLAUDE.md`.

## Riscos

- `@react-pdf/renderer` aumenta o bundle server — isolar em Route Handlers (runtime Node), nunca importar no cliente.
- Números/moeda: `Intl.NumberFormat('pt-PT', {currency:'MZN'})`; `tabular-nums`; evitar `Float`.
