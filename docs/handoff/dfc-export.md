# Handoff — grafo `dfc`, nó `export` (ticket 9.1)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md)
- **Depende de**: `export-v` (oráculo, HEAD `f45795c` — [`dfc-export-v.md`](dfc-export-v.md))
- **Worktree**: `wt/feat-dfc-export`, ramo `ws-2-export`. O orquestrador faz merge em `feat-dfc`.
- **Fora de âmbito**: o botão «Exportar PDF» (9.2) é do nó `pagina` (ajuste 1 do grafo).
- **Sem** migração, sem schema, sem escrita na base, sem permissões novas (`financas:exportar` já existe).

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/app/api/contabilidade/dfc/export/route.ts` | `GET` via `withApi`, `financas:exportar`, `runtime = 'nodejs'`. |
| `apps/erp/src/lib/documents/pdf/dfc-pdf.tsx` | `DfcDocument` + `renderDfcPdf(dfc, geradoEm)`, sobre `base.tsx`. |

### A rota

1. `exportLimiter` (10/min por utilizador), como as outras exportações.
2. Faz o que a página faz: `listarPeriodos({}, ctx)` e depois
   `resolverIntervaloDFC(periodos, { dataInicio, dataFim }, new Date())`. Query vazia ⇒ os mesmos
   valores por omissão da página. `ok: false` ⇒ `ValidationError(motivo)` ⇒ 422 JSON, sem chamar
   `gerarDFC`.
3. `gerarDFC({ periodoInicioId, periodoFimId }, ctx)`. O `ctx` vem só da sessão.
4. Impedimentos ⇒ 422, corpo
   `{ error: { code: 'DFC_COM_IMPEDIMENTOS', message, details: { impedimentos, contasNaoMapeadas, avisos } } }`,
   com os montantes das contas em `toFixed(2)`. A `message` junta todas as frases: quem mostrar só
   a mensagem mostra também a lista inteira.
5. `BusinessRuleError`/`NotFoundError` do serviço não são apanhados: o `withApi` dá 409 ou 404 com o
   código.
6. Mapa ⇒ 200 `application/pdf`, `attachment; filename="dfc-<inicio>-a-<fim>.pdf"`, `no-store`.

A rota depende só de `listarPeriodos` e `gerarDFC`. Não há nome do emitente no cabeçalho, porque
isso exigiria outro serviço com I/O, que o oráculo não dobra (ver `dfc-export-v.md` §Duplos). Se o
produto o quiser, é uma decisão a escalar.

### O documento

- Fontes-padrão `Helvetica`/`Helvetica-Bold`, as de `base.tsx`. Não há `Font.register`: com uma
  fonte embebida o texto passa a ids de glifo e o oráculo deixa de o conseguir ler.
- Colunas **N** (`atual`) e **N-1** (`homologo`). As linhas são o resultado líquido, as rubricas de
  cada secção (a união das rubricas de N e N-1, ordenadas por `ordem` e `codigo`), o total de cada
  secção, a soma das actividades e a articulação: caixa inicial, fluxo e caixa final.
- `homologo === null` ⇒ «—» em todas as células N-1, e o cabeçalho diz «sem exercício anterior (—)».
  Quando há N-1 mas uma rubrica não teve movimento numa das colunas, a célula mostra `0,00 MT` e não
  «—». O «—» fica reservado à falta de exercício anterior.
- «Provisório» aparece só com `provisorio`. «Mapeamento por validar · versão N» aparece só em
  `PENDING`. Fora dessas faixas o documento não usa estas palavras (o metadado diz «por validar» e
  «validada», sem «Mapeamento» à frente). O número da versão está sempre no cabeçalho («Versão do
  mapeamento: 37») e no rodapé («Mapeamento v37»).
- Dinheiro: `Decimal.toFixed(2)` → `formatMZN`, a mesma função `mzn` do `MapaDFC`. Datas:
  `formatarData`/`formatarDataHora`. `geradoEm` entra por parâmetro, o documento não lê o relógio.
- O documento não recalcula nada: reflecte o `DFC` do serviço, que já verificou a articulação.

## Verificação

```
$ cd apps/erp && npx vitest run src/app/api/contabilidade/dfc/export/__tests__/
 Test Files  1 passed (1)
      Tests  24 passed (24)

$ npx tsc --noEmit -p .          → exit 0
$ npx eslint <os dois ficheiros> → exit 0

$ pnpm check   (raiz da worktree)
 Test Files  1 failed | 143 passed (144)
      Tests  1974 passed | 3 skipped (1977)
 único vermelho: projecao.golden.test.ts — «a base tem resíduos», compromissosManuais 1 vs 0 (aceite)

$ pnpm gates   → dialog, use-client, data-imports, leitura, periodo: todos OK (gate-periodo a zero)
```

`git diff f45795c -- 'apps/erp/src/app/api/contabilidade/dfc/export/__tests__/*'` está vazio. Nenhum
oráculo anterior foi tocado.

## Dívida e notas para o `pagina` (9.2) e o `fecho`

- **9.2**: o botão pode reutilizar a query string da página tal como está:
  `/api/contabilidade/dfc/export?dataInicio=…&dataFim=…`. O 422 traz `error.details.impedimentos`.
  Mesmo assim a página só deve mostrar o botão quando há mapa, e o botão requer `financas:exportar`.
- O `formatMZN` passa por `parseFloat`: perde precisão acima de ~9×10¹³ MT. É a convenção da casa
  (o `MapaDFC` faz o mesmo) e não é deste nó.
- Não houve smoke do PDF num browser com a base real. O E2E 10.1 (passo 6, «exportar o PDF») fecha
  isso.

## Decisões do orquestrador depois da revisão (code-reviewer: APROVAR COM NITS; PV: LIMPO)

- **MINOR (linha «Diferença»)**: fica de fora do PDF de propósito. O PDF mostra os valores que saem do
  `gerarDFC` sem recalcular nada: caixa inicial, caixa final e soma das actividades. A articulação já é
  garantida pelo serviço, que recusa com `DFC_NAO_ARTICULA`.
- **MINOR (emitente, nome e NUIT)**: está escalado ao humano. Se entrar, é num nó seguinte, e é o verificador
  que acrescenta o duplo ao oráculo.
- **NITs** (`message` longa no 422; «validada» para qualquer estado diferente de `PENDING`): ficam para quem
  voltar a tocar nestes ficheiros.
