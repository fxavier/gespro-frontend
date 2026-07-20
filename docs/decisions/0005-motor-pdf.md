# ADR-0005 — Motor de documentos PDF e formato de exportação

- **Estado**: Aceite
- **Data**: 2026-07-20
- **Contexto**: Spec 12 (Relatórios, Documentos & Exportação Unificada)
- **Skills**: `pdf`, `xlsx`, `fiscalidade-mz`, `api-conventions`

## Contexto

O projecto exportava de forma dispersa (só a dep `xlsx`; specs 04/06 hand-rolam
CSV/PDF por feature) e **não tinha motor de PDF** unificado. Documentos fiscais
(factura em `/faturacao/[id]`) não tinham impressão/PDF. Havia já um primitivo
mínimo sem dependências (`src/lib/pdf/simple-pdf.ts`) usado pelo recibo de
vencimento (Spec 06), suficiente para texto tabular simples mas sem tabelas
ricas, quebra de página automática ou composição declarativa.

Este spec cria infraestrutura transversal de documentos/relatórios/exportação.

## Decisão

### Motor de PDF: `@react-pdf/renderer`

Escolhido `@react-pdf/renderer` (`^4.3.0`) como motor de documentos PDF
server-side.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **`@react-pdf/renderer`** ✅ | Declarativo (JSX/flexbox), sem headless browser, `renderToBuffer` puro Node, layout base reutilizável, determinístico | Adiciona dependência + reconciliador React no runtime do servidor |
| `pdfkit` | Leve, maduro | API imperativa (posicionamento manual), tabelas/paginação à mão |
| Puppeteer/headless Chrome | HTML/CSS completo | Binário pesado, arranque lento, frágil em serverless — descartado |
| Extender `simple-pdf.ts` (zero-dep) | Sem dependências | Sem tabelas ricas/paginação automática; manutenção cara para documentos fiscais |

`@react-pdf/renderer` ganha por ser **declarativo e sem browser**: o layout base
(`src/lib/documents/pdf/base.tsx`) é composto uma vez e reutilizado por factura,
recibo, nota e relatórios, com `tabular-nums` e tokens de marca.

**Contenção de risco (bundle/runtime):**
- Importado **apenas** em Route Handlers com `export const runtime = 'nodejs'`.
- Todos os módulos de rendering (`src/lib/documents/pdf/*.tsx`) têm
  `import 'server-only'` — **nunca** entram no bundle do cliente (CLAUDE.md §RSC).
- O modelo de documento (`src/lib/documents/fatura-model.ts`) é **puro** (sem
  react-pdf) e testável isoladamente — o `.tsx` só o renderiza.

### Formato de exportação de dados: CSV + XLSX

- **CSV**: separador `;` (Excel pt-PT), BOM UTF-8, escape RFC-4180.
- **XLSX**: via a dependência `xlsx` já existente (SheetJS), sem nova dependência.
- **Precisão de dinheiro (inegociável)**: valores `Decimal`/`currency` são
  serializados como **texto lossless** (`Decimal.toString()`), nunca como
  vírgula flutuante — em CSV e em XLSX. Colunas `integer` como número (para
  ordenação/soma nativas). Prova por teste com valor > `Number.MAX_SAFE_INTEGER`.

## Consequências

- Nova dependência de runtime: `@react-pdf/renderer` (bloco `dependencies` do
  `package.json`). O `simple-pdf.ts` mantém-se para o recibo Spec 06 (não há
  regressão); pode ser migrado para o novo motor numa iteração futura.
- Documentos fiscais **reflectem** os valores emitidos (append-only) — o PDF
  nunca recalcula IVA/totais (coerente com CLAUDE.md §Dinheiro e documentos e
  skill `fiscalidade-mz`).
- Exportação e PDF são sempre **Route Handlers** (`withApi`), nunca Server
  Actions — leitura só por serviços de domínio dentro de `runWithTenantContext`.
