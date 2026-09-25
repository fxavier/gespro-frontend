# Issue #77 — oráculo do nó N1 («IVA 0% é gravado como 16%»)

Escrito pelo VERIFICADOR. Tudo o que está aqui foi executado contra o código actual da worktree
`wt/issue-77` (base `347c8e6`), sem commit. Nunca se correu `vitest -u`; nenhum estado foi
fabricado em base de dados (o E2E cria documentos só pela UI, e só na base isolada `gespro_e2e77`).

## Ficheiros

### Oráculo (testes)

| Caso | Ficheiro |
|---|---|
| T1 | `apps/erp/src/lib/__tests__/iva.test.ts` |
| T2 | `apps/erp/src/lib/documentos/__tests__/linhas.test.ts` (fast-check, `numRuns: 1000`) |
| T3 | `apps/erp/src/lib/__tests__/iva-guarda.test.ts` |
| T4 | `apps/erp/src/server/services/financas/__tests__/faturacao-iva-zero.test.ts` e `apps/erp/src/server/services/compras/__tests__/compras-iva-zero.test.ts` |
| T5 | `apps/erp/src/lib/validations/__tests__/taxa-iva-schemas.test.ts` |
| T6 | `apps/erp/e2e/17-iva-isento.spec.ts` |

### Esqueletos de produção: POR IMPLEMENTAR, o autor reescreve-os

- `apps/erp/src/lib/iva.ts`: as constantes da especificação (`TAXAS_IVA`, `TaxaIva`, `TAXA_IVA_NORMAL`,
  `ROTULOS_TAXA_IVA`, `MENSAGEM_TAXA_IVA_INVALIDA`) com os valores decididos. `lerTaxaIva` e `taxaIvaSchema`
  lançam `new Error('por implementar')`.
- `apps/erp/src/lib/documentos/linhas.ts`: `LinhaCalculo`. `calcularLinha` e `calcularTotais` lançam
  `new Error('por implementar')`.

Não houve outra alteração: nenhum ficheiro de produção existente foi tocado e nenhum teste existente
foi reescrito.

`npx tsc --noEmit -p .` (a partir de `apps/erp`): **0 erros**. `npx tsc --noEmit -p e2e`: sem erros no
spec novo. `npx vitest run` à suite inteira dá 53 falhados | 1750 passados | 3 ignorados. Os 53 são
exactamente os deste oráculo. Nenhum teste existente depende da omissão 0.16.

## Vermelho: `npx vitest run <ficheiros do oráculo>` (a partir de `apps/erp`)

```
 ❯ src/lib/documentos/__tests__/linhas.test.ts (8 tests | 8 failed)
 ❯ src/lib/__tests__/iva.test.ts (38 tests | 36 failed)
 ❯ src/lib/validations/__tests__/taxa-iva-schemas.test.ts (12 tests | 5 failed)
 ❯ src/server/services/compras/__tests__/compras-iva-zero.test.ts (5 tests | 2 failed)
 ❯ src/lib/__tests__/iva-guarda.test.ts (5 tests | 2 failed)
 ✓ src/server/services/financas/__tests__/faturacao-iva-zero.test.ts (5 tests)
 Test Files  5 failed | 1 passed (6)
      Tests  53 failed | 20 passed (73)
```

### Por caso

**T1 (`iva.test.ts`): 36 vermelhos.** Nenhum falha por import em falta: o módulo existe e as
constantes passam. Os casos «aceita» falham com `Error: por implementar` (em `lerTaxaIva
src/lib/iva.ts:16`). Os casos «recusa X» têm uma asserção explícita,
`expect(() => lerTaxaIva(x)).not.toThrow('por implementar')`, para que um esqueleto que lança para
tudo não conte como recusa. «Nenhuma entrada recusada devolve 0.16» exige que a recusa não seja o
esqueleto. As duas asserções sobre as constantes (valores e rótulos/mensagem) ficam verdes com o
esqueleto. **Não discriminam**, porque os valores são os da especificação.

**T2 (`linhas.test.ts`): 8 vermelhos.** Todos falham com `Error: por implementar` dentro de
`fc.assert`. As propriedades são estas: taxa 0 ⇒ iva 0 e total = base; taxa 0.16 ⇒ iva =
round2(base·0.16); base = round2(q·p−d) e total = base+iva; **mostrado = gravado**
(`calcularLinha` ≡ `LinhaDocumentoSchema.parse`); `calcularTotais` = soma; só isentas ⇒ iva 0.
Há ainda dois exemplos da issue (1000 a 0% ⇒ 1000; 1000 a 0% + 1000 a 16% ⇒ 2160).

**T3 (`iva-guarda.test.ts`): 2 vermelhos, a falhar na asserção com ficheiro:linha.**
```
(a) app/(dashboard)/compras/pedidos/novo/_components/novo-pedido-form.tsx:87: const taxa = Number(l.taxaIva) || 0;
    app/(dashboard)/compras/pedidos/novo/_components/novo-pedido-form.tsx:116: taxaIva: Number(it.taxaIva) || 0.16,
    app/(dashboard)/compras/pedidos/novo/_components/novo-pedido-form.tsx:250: const taxa = Number(itens[i]?.taxaIva) || 0;
    app/(dashboard)/faturacao/cotacoes/nova/_components/nova-cotacao-form.tsx:89 / :114 / :211   (|| 0.16)
    app/(dashboard)/faturacao/nota-credito/nova/_components/nova-nota-credito-form.tsx:82 / :106 / :203
    app/(dashboard)/faturacao/nova/_components/nova-fatura-form.tsx:111 / :135 / :241
    app/(dashboard)/faturacao/proforma/nova/_components/nova-proforma-form.tsx:87 / :111 / :208
    : expected [ …(15) ] to deeply equal []
(b) app/(dashboard)/compras/pedidos/novo/_components/novo-pedido-form.tsx:30: taxaIva: z.coerce.number
    app/(dashboard)/faturacao/cotacoes/nova/_components/nova-cotacao-form.tsx:30
    app/(dashboard)/faturacao/nota-credito/nova/_components/nova-nota-credito-form.tsx:30
    app/(dashboard)/faturacao/nova/_components/nova-fatura-form.tsx:36
    app/(dashboard)/faturacao/proforma/nova/_components/nova-proforma-form.tsx:30
    app/(dashboard)/produtos/[id]/editar/_components/editar-produto-form.tsx:31
    lib/validations/produtos.ts:46: taxaIva: z.coerce .number      (partido em várias linhas: apanhado)
    : expected [ …(7) ] to deeply equal []
```
Estes três ficam verdes, porque são as condições que a guarda precisa para valer: o auto-teste dos
padrões (as formas conhecidas do defeito são apanhadas e `lerTaxaIva(...)` não), a existência das
três excepções D4 (`validations/vendas.ts`, `servicos.ts` e `plataforma.ts`, listadas no teste com
comentário a citar D4) e um número plausível de ficheiros varridos (> 200).

**T4 (serviços).**
- **Discriminante, vermelho:** `converterRequisicaoEmPedido`:
  ```
  item cujo produto (do mesmo tenant) é isento → item do pedido a 0%
    AssertionError: expected 0.16 to be +0 // Object.is equality
  mistura: isento → 0, produto normal → 0.16, sem produtoId → 0.16
    AssertionError: expected 0.16 to be +0
  ```
- **Verdes já hoje, não discriminantes:**
  - faturação: `emitirFatura` (linha a 0%, com LinhaFatura.taxaIva, ivaItem e ivaTotal a 0, sem 44331
    e com o lançamento equilibrado; e o misto 0% + 16% com ivaTotal 160 e total 2160);
  - nota de crédito: `emitirNotaCredito` (0% e sem estorno de 44331);
  - proforma e cotação comercial: `criarProforma` e `criarCotacaoComercial` (taxaIva 0 gravado);
  - compras: `criarPedido` (ItemPedidoCompra.taxaIva 0, valorIva 0);
  - adjudicação: «sem produtoId → 0.16» e «produto de outro tenant não fornece a taxa».

  O caminho do servidor já preserva o 0 (`?? 0.16`). Estes testes trancam que a correcção não o parte.

**T5 (`taxa-iva-schemas.test.ts`): 5 vermelhos, todos em asserção.**
```
LinhaDocumentoSchema          C2: taxaIva ausente é recusado   → aceitou com taxaIva=0.16
ProdutoCreateSchema           C2: taxaIva ausente é recusado   → aceitou com taxaIva=0.16
ProdutoCreateSchema           '' é recusado                    → aceitou com taxaIva=0
CreateItemPedidoCompraSchema  recusa 0.17 (só {0, 0.16})       → aceitou com taxaIva=0.17
CreateItemPedidoCompraSchema  C2: taxaIva ausente é recusado   → aceitou com taxaIva=0.16
```
Estes sete ficam verdes já hoje: os três «aceita 0 e preserva-o», as recusas de 0.17 na faturação e
nos produtos (com a mensagem **exacta** de cada um), e as recusas de `''` na faturação e nas compras
(onde é `z.number()`).

## Vermelho: E2E `e2e/17-iva-isento.spec.ts`

Corrido com o dev server da worktree na porta 3011, sobre a base isolada `gespro_e2e77` (nunca sobre
`gespro`), com `BASE_URL=http://localhost:3011 npx playwright test --project=setup && … e2e/17-iva-isento.spec.ts`.
Correu duas vezes seguidas com o mesmo resultado. No fim, o servidor de 3011 foi morto e
`playwright/.auth/admin.json` reposto. A porta 3000 não foi tocada.

```
  ✓  2 /faturacao/nova › uma linha nova começa em 16% VISÍVEL no Select
  ✘  3 /faturacao/nova › uma linha a 0% × 1000: total 1000,00 antes de emitir; … IVA 0,00 e total 1000,00
       Error: IVA mostrado antes de emitir — Expected: 0  Received: 160
  ✘  4 /faturacao/nova › uma linha a 0% e outra a 16% (1000 cada): IVA 160,00 e total 2160,00, antes e depois
       Error: IVA mostrado antes de emitir — Expected: 160  Received: 320
  ✘  5 /compras/pedidos/novo › item a 0% × 1000: o pedido gravado tem valor total 1000,00 (sem IVA)
       Error: Valor Total gravado do pedido PC/2026/000006 — Expected: 1000  Received: 1160
  ✓  6 /vendas/faturas/nova › linha a 0% × 1000: o documento emitido tem IVA 0,00 e total 1000,00
  3 failed / 3 passed (inclui o setup)
```
- Os casos 3 e 4 falham na primeira coisa que o defeito estraga, **o que o ecrã mostra**: o
  `|| 0.16` dos totais ao vivo mostra 160 com a linha a 0%. A parte pós-emissão (captura da resposta
  da action e leitura do detalhe `/faturacao/[id]`) foi validada à parte com uma cópia descartável do
  caso a 16%. Passou, e a cópia foi apagada.
- O caso 5 mostra 1000 antes de gravar (os totais usam `|| 0`) e grava 1160 (o submit usa `|| 0.16`).
  Mostrado ≠ gravado.
- **Verdes já hoje, não discriminantes:** o caso 2 (o Radix já mostra «16%» no Select de uma linha
  nova neste formulário) e o caso 6 (`/vendas/faturas/nova` usa o `EmitirFaturaSchema` do servidor e
  `parseFloat('0')`, logo o 0 chega).

## Ambiguidades e notas

1. **Não há página de detalhe do pedido de compra.** `/compras/pedidos/[id]` não existe, apesar de
   `rowHref` e «Ver detalhe» apontarem para lá. O T6 lê o valor gravado na coluna «Valor Total» da
   listagem, na linha do número devolvido pela gravação. A listagem mostra só o total, não o IVA:
   1000 contra 1160 é a prova.
2. **Rótulos do Select.** O E2E escolhe a opção pelo início (`/^0%/`, `/^16%/`). Cobre
   `ROTULOS_TAXA_IVA`, os rótulos de `/vendas/faturas/nova` e os de hoje («0%», «16%»). Assim o
   vermelho é o defeito e não um rótulo inexistente. Não afirma o rótulo exacto «0% (isento)» nos
   formulários de faturação.
3. **Captura do documento emitido.** Os formulários fazem `router.push` para a listagem, e a listagem
   de facturas ordena por `dataEmissao` (há empates). O id/número lê-se então da resposta da Server
   Action, interceptada com `page.route` + `route.fetch`, porque com `response.text()` o Chromium já
   tinha deitado fora o corpo. Se a correcção passar a redireccionar para o detalhe, este caminho
   continua a funcionar.
4. **`/vendas/faturas/nova` e datas:** os campos de data só têm `onChange` (sem `value`/`field`), e
   o `fill` do Playwright não chega ao estado do RHF (fica «Invalid date» e nada é submetido). O teste
   escreve a data tecla a tecla. É um defeito pré-existente, fora do âmbito da #77, assinalado aqui.
5. **Duplo do prisma na adjudicação.** Filtra por `where.id` / `id.in` e por `where.tenantId`, e **não**
   emula a tenant-extension. Uma implementação que dependa só da extensão (sem `tenantId` explícito)
   vê o produto alheio e falha o caso cross-tenant. É intencional, porque a especificação diz «lido com
   tenantId». O caso cross-tenant aceita «fica 0.16» ou «lança»: só afirma que a taxa alheia (0) não
   é usada.
6. **T2 e o −0:** as asserções «iva = 0» usam `=== 0` e não `toBe(0)`. Assim um `-0` vindo de base
   −ε não é contado como defeito. A equivalência com `LinhaDocumentoSchema.parse` continua a ser
   `toEqual` exacto.
7. O T1 aceita também string numérica com espaços (`' 0.16 '`), por causa do «trim» da especificação.
