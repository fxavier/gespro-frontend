# Handoff — grafo `dfc`, nó `export-v` (gate do ticket 9.1)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `export`
- **Depende de**: `fatia` (FEITO — [`dfc-fatia.md`](dfc-fatia.md), HEAD `1f6989e`)
- **Agente**: `verificador-fluxo-caixa`, na worktree `wt/feat-dfc-export` (ramo `ws-2-export`). Nenhum código de
  produção. Nenhuma escrita na base (o oráculo não toca na base: serviço dobrado).
- **Âmbito**: só o gate do 9.1. O botão 9.2 é do nó `pagina` (ajuste 1 do grafo).
- **Gate do nó**: 24/24 casos falham **só** por `Cannot find module '…/dfc/export/route'` ✅ · `tsc --noEmit` só com
  o `TS2307` desse import ✅ · `eslint` limpo ✅ · satisfazível por uma rota descartável (24/24 verde, apagada, não
  commitada) e discriminante contra 11 mutantes (ver abaixo) ✅.

## Entregue (ficheiros PROTEGIDOS a partir deste nó)

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/app/api/contabilidade/dfc/export/__tests__/export-dfc-handler.test.ts` | O oráculo da rota: 24 casos. |
| `apps/erp/src/app/api/contabilidade/dfc/export/__tests__/pdf-texto.ts` | Extractor de texto do PDF (auxiliar, não é recolhido pelo vitest), com calibração. |

Verificação do orquestrador depois do `export`:

```bash
git diff --stat <commit deste nó>..HEAD -- 'apps/erp/src/app/api/contabilidade/dfc/export/__tests__/*'
```

Qualquer linha é BLOCKER.

## O que o autor tem de cumprir

`apps/erp/src/app/api/contabilidade/dfc/export/route.ts`, com `export const GET` e `export const runtime = 'nodejs'`.

1. **`withApi`, `GET`, `{ permission: 'financas:exportar' }`.** Sem sessão ⇒ 401. Sem `financas:exportar` ⇒ 403,
   mesmo com `financas:fluxo-caixa:leitura`, e o serviço não é chamado. Em Leitura (`acesso: 'leitura'`) o GET
   passa e sai o PDF. Não declares `permiteEmLeitura`: um GET não precisa.
2. **A forma do pedido é a da página: `?dataInicio=aaaa-mm-dd&dataFim=aaaa-mm-dd`.** Resolve-a como a página:
   `listarPeriodos({}, ctx)` de `contabilidade.service` e `resolverIntervaloDFC(periodos, { dataInicio, dataFim }, new Date())`
   de `src/lib/dfc-intervalo.ts`. Depois `gerarDFC({ periodoInicioId: inicio.id, periodoFimId: fim.id }, ctx)` de
   `dfc.service`. O intervalo alarga a períodos completos, como na página (15/04–10/06 ⇒ 2026-04..2026-06).
   `resolverIntervaloDFC` com `ok: false` (data inválida, data sem período) ⇒ recusa em JSON (400, 404 ou 422;
   `ValidationError` dá 422), sem PDF e sem chamar `gerarDFC`.
3. **O tenant vem da sessão (`ctx`).** Um `tenantId` na query é ignorado. O `ctx` passado a `listarPeriodos` e a
   `gerarDFC` tem o `tenantId` da sessão.
4. **Impedimentos ⇒ 422, JSON, sem PDF.** O corpo tem de conter todas as frases de `impedimentos` e o código de
   todas as `contasNaoMapeadas`. O envelope é livre. Sugestão, para a página e o 9.2 lerem como os outros erros:
   `{ error: { code: 'DFC_COM_IMPEDIMENTOS', message, details: { impedimentos, contasNaoMapeadas, avisos } } }`.
5. **Recusas do serviço propagam pelo `withApi`, sem PDF.** `BusinessRuleError` (`DFC_NAO_ARTICULA`,
   `DFC_ENTRE_EXERCICIOS`, `DFC_INTERVALO_INVERTIDO`) ⇒ 409 com o código em `error.code`. `NotFoundError`
   (cross-tenant, I10) ⇒ 404. Não apanhes estes erros para os transformar em 500 nem em PDF.
6. **O PDF.** 200, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="….pdf"`, e o
   corpo começa por `%PDF-`. O texto do PDF tem de conter:
   - «Fluxos de Caixa» (o título);
   - «Mapeamento por validar» **se e só se** `versao.estado === 'PENDING'`;
   - «Provisório» **se e só se** `provisorio`;
   - o número da versão, como «Versão 37», «versão n.º 37» ou «Mapeamento v37». O teste aceita
     `/vers[aã]o[^0-9]{0,20}37(?!\d)/` ou `mapeamentov37`, sobre o texto sem espaços e em minúsculas;
   - a **coluna N**: caixa final, o valor da rubrica e o resultado líquido de `dfc.atual`;
   - a **coluna N-1**: os mesmos três valores de `dfc.homologo`;
   - com `homologo: null`: o PDF sai na mesma, sem valores N-1, e com «—» (E3).
   Os montantes procuram-se pelos **algarismos**, logo o formato de milhares é livre. Mas os **dois decimais têm
   de aparecer**: `4235981.20` tem de dar `…,20` ou `….20`, e um `Decimal.toString()` (`4235981.2`) falha, de
   propósito. Usa `formatMZN`, ou o `toFixed(2)` do Decimal.

### Restrição do motor (decisão deste nó)

O texto lê-se do PDF real, renderizado por `@react-pdf/renderer`. Ver `pdf-texto.ts`: incha os streams
`FlateDecode`, apanha os operandos de `Tj`/`TJ` e descodifica em WinAnsi. Isto exige as **fontes-padrão** do motor
do ADR-0005 (`Helvetica`/`Helvetica-Bold`, as de `src/lib/documents/pdf/base.tsx`). Com `Font.register` de uma
fonte embebida (Inter, por exemplo), o texto passa a ids de glifo e os casos de texto falham. Se o autor
precisar de outra fonte, isso é uma decisão a escalar, não uma alteração ao teste.

Porque não testar o documento React antes do render: o PDF é o artefacto que o utilizador recebe. Uma marca que
existe na árvore e se perde no render (um `render={…}` condicional, um `fixed` fora da página) passaria. A
extracção é fiável com as fontes-padrão, e `garantirExtractor()` calibra-a em cada corrida contra um PDF de
controlo feito pelo mesmo motor. O PDF de controlo tem as armadilhas conhecidas: frase partida em linhas,
`textTransform: 'uppercase'`, acentos WinAnsi, milhares com NBSP e um falso positivo. Se uma actualização do
react-pdf partir a extracção, o vermelho diz «Extractor … descalibrado (auxiliar do oráculo, não a rota)».

### Duplos

- `@/lib/auth` (sessão), `@/server/services/financas/dfc.service` (`gerarDFC`, `contasNaoMapeadas` e
  `dfcService`), e `listarPeriodos` de `contabilidade.service`: mock parcial, o resto do módulo é o real. O
  serviço já é verificado pelos seus oráculos (`dfc.golden`, `dfc.property`, `dfc.impedimentos-isolamento`).
- `exportLimiter` de `@/server/security/rate-limiter` fica neutralizado: 10 pedidos por minuto e por utilizador
  esgotavam-se dentro da suite. Podes usá-lo; ele não é objecto deste oráculo.
- Se a rota precisar de outro serviço com I/O (o nome do emitente no cabeçalho, por exemplo), esse serviço não
  está dobrado e vai à base. Mantém a rota em `listarPeriodos` + `gerarDFC`. Se precisares de mais, escala: não
  acrescentes mocks ao ficheiro protegido.

## Satisfazível e discriminante

Escrevi uma rota descartável em `route.ts` (withApi, `resolverIntervaloDFC`, react-pdf com `Helvetica` e
`formatMZN`). Passou 24/24 e **foi apagada sem commit**. Depois apliquei 11 mutantes; todos morreram:

| Mutante | Casos vermelhos |
|---|---|
| «Mapeamento por validar» sempre | 1 |
| «Provisório» sempre | 1 |
| sem a coluna N-1 | 1 |
| sem o número da versão | 1 |
| impedimentos ⇒ 200 | 1 |
| permissão `financas:fluxo-caixa:leitura` em vez de `:exportar` | 2 |
| `Decimal.toString()` em vez de dois decimais | 2 |
| sem `runtime = 'nodejs'` | 1 |
| `tenantId` lido da query | 1 |
| ids de período na query em vez das datas da página | 2 |
| erros do serviço apanhados e transformados em 500 | 6 |

## Saída vermelha (sem a rota)

```
$ npx vitest run src/app/api/contabilidade/dfc/export/__tests__/
 FAIL  … > GET /api/contabilidade/dfc/export — forma da rota > declara runtime Node (o motor de PDF do ADR-0005 não corre em Edge)
 FAIL  … > GET /api/contabilidade/dfc/export — forma da rota > resolve as datas da página para os períodos que as contêm e chama gerarDFC com o tenant da sessão
 FAIL  … > GET /api/contabilidade/dfc/export — forma da rota > alarga a períodos completos como a página (15/04 a 10/06 ⇒ 2026-04 a 2026-06)
 FAIL  … > GET /api/contabilidade/dfc/export — forma da rota > TEM DE RECUSAR uma data inválida (30/02) sem chamar o serviço e sem PDF
 FAIL  … > GET /api/contabilidade/dfc/export — forma da rota > TEM DE RECUSAR uma data sem período contabilístico, sem chamar o serviço e sem PDF
 FAIL  … > GET — PDF da DFC > 200, application/pdf, anexo .pdf, corpo começa por %PDF
 FAIL  … > GET — PDF da DFC > versão PENDING ⇒ o PDF diz «Mapeamento por validar»
 FAIL  … > GET — PDF da DFC > versão VALIDATED ⇒ o PDF NÃO diz «Mapeamento por validar»
 FAIL  … > GET — PDF da DFC > provisório ⇒ o PDF diz «Provisório»
 FAIL  … > GET — PDF da DFC > não provisório ⇒ o PDF NÃO diz «Provisório»
 FAIL  … > GET — PDF da DFC > leva o número da versão do mapeamento (E1), em PENDING e em VALIDATED
 FAIL  … > GET — PDF da DFC > é a Demonstração de Fluxos de Caixa
 FAIL  … > GET — PDF da DFC > leva a coluna N: caixa final, uma rubrica e o resultado líquido do intervalo
 FAIL  … > GET — PDF da DFC > leva a coluna N-1 (homólogo, E3): caixa final, uma rubrica e o resultado líquido
 FAIL  … > GET — PDF da DFC > sem exercício anterior (homologo null) ⇒ PDF na mesma, sem valores N-1 inventados
 FAIL  … > GET — impedimentos e recusas do serviço: nunca PDF > TEM DE RESPONDER 422 com a lista completa de impedimentos em JSON, e sem PDF
 FAIL  … > GET — impedimentos e recusas do serviço: nunca PDF > TEM DE PROPAGAR DFC_NAO_ARTICULA do serviço (409, código no envelope) e não sair PDF
 FAIL  … > GET — impedimentos e recusas do serviço: nunca PDF > TEM DE PROPAGAR DFC_ENTRE_EXERCICIOS do serviço (409, código no envelope) e não sair PDF
 FAIL  … > GET — impedimentos e recusas do serviço: nunca PDF > TEM DE PROPAGAR DFC_INTERVALO_INVERTIDO do serviço (409, código no envelope) e não sair PDF
 FAIL  … > GET — acesso > TEM DE RECUSAR sem sessão (401), sem chamar o serviço
 FAIL  … > GET — acesso > TEM DE RECUSAR sem financas:exportar (403), mesmo com a leitura da DFC
 FAIL  … > GET — acesso > modo Leitura (ADR-0032): o GET passa e sai o PDF — exportar nunca se trava
 FAIL  … > GET — acesso > o tenant vem da sessão, nunca da query: um tenantId na URL é ignorado
 FAIL  … > GET — acesso > cross-tenant ⇒ 404 (nunca 403, nunca 500): NotFoundError do serviço propaga, sem PDF

Error: Cannot find module '/src/app/api/contabilidade/dfc/export/route' imported from /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc-export/apps/erp/src/app/api/contabilidade/dfc/export/__tests__/export-dfc-handler.test.ts

 Test Files  1 failed (1)
      Tests  24 failed (24)
```

(Os 24 casos falham todos com o mesmo erro. O vitest só imprime 22 blocos de erro porque agrupa as stacks
idênticas do `it.each`.)

```
$ npx tsc --noEmit
src/app/api/contabilidade/dfc/export/__tests__/export-dfc-handler.test.ts(84,27): error TS2307: Cannot find module '../route' or its corresponding type declarations.

$ npx eslint src/app/api/contabilidade/dfc/export/
(limpo)
```

## Critério de saída do `export`

O oráculo tem de ficar verde **sem alterações**, e `pnpm check` também, com o vermelho aceite do
`projecao.golden`. O `git diff` acima tem de sair vazio.
