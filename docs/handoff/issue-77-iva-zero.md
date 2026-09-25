# Issue #77 — IVA 0% gravado como 16%: fonte única de taxas

Grafo segundo `docs/agentic/00-doutrina-loop-e-grafo.md`. Os nós:
- N0 inspect;
- N1 oráculo (verificador): [`issue-77-oraculo.md`](issue-77-oraculo.md);
- N2 implementação (autor);
- N3 revisão em dois eixos (dois revisores novos);
- N4 verify;
- N5 docs, issues e PR.

## O defeito

`0` é falsy: `Number(l.taxaIva) || 0.16` transformava «0% (isento)» em 16%, tanto no total mostrado como no
valor submetido. O servidor aceitava 0.16 como válido e gravava-o. Eram 13 ocorrências em 5 formulários:

| Formulário (`apps/erp/src/app/(dashboard)/…`) | Linhas em `main` |
|---|---|
| `faturacao/nova/_components/nova-fatura-form.tsx` | 111, 135, 241 |
| `faturacao/cotacoes/nova/_components/nova-cotacao-form.tsx` | 89, 114, 211 |
| `faturacao/proforma/nova/_components/nova-proforma-form.tsx` | 87, 111, 208 |
| `faturacao/nota-credito/nova/_components/nova-nota-credito-form.tsx` | 82, 106, 203 |
| `compras/pedidos/novo/_components/novo-pedido-form.tsx` | 116, e `\|\| 0` em 87 e 250 |

Os mesmos formulários tinham `taxaIva: z.coerce.number().default(0.16)`, que converte `''` em 0 (isento sem
aviso). O `editar-produto-form.tsx:31` tinha o mesmo coerce. A adjudicação de cotação
(`compras.service.ts`) criava o pedido com `taxaIva: 0.16` fixo, e o item de pedido aceitava qualquer valor
entre 0 e 1.

A vertente comercial (`/vendas/faturas/nova`) já estava certa (`parseFloat('0')` dá 0, e submete pelo
schema do servidor). Não foi alterada; o E2E cobre-a.

## A correcção

- **Fonte única** `apps/erp/src/lib/iva.ts` (client-safe, sem `server-only`):
  - `TAXAS_IVA = [0, 0.16]` e `TAXA_IVA_NORMAL`;
  - `ROTULOS_TAXA_IVA`: «0% (isento)» e «16%»;
  - `ehTaxaIva`;
  - `lerTaxaIva(v)`: devolve a taxa ou falha, **nunca** um valor por omissão;
  - `taxaIvaSchema(mensagem?)`: `''` recusado antes de converter, sem `.default`.
- **Aritmética** `apps/erp/src/lib/documentos/linhas.ts`:
  - `calcularLinha` e `calcularTotais`, com o mesmo arredondamento do transform de `LinhaDocumentoSchema`,
    que não foi alterado;
  - são usadas pelos 5 formulários para o total ao vivo e para o payload;
  - «mostrado = gravado» está trancado por uma propriedade fast-check com 1000 casos.
- **Formulários:**
  - Os 5 de documento e o `editar-produto-form` passam a ter um Select de IVA controlado, com o rótulo como
    filho do `SelectValue` e o erro visível.
  - Uma linha nova começa em 16%, visível no Select.
  - Uma linha com taxa inválida não entra no total ao vivo e mostra erro; não há recurso a 16%.
  - O `editar-produto-form` abre com o Select vazio (em vez de rebentar) se o produto tiver uma taxa gravada
    fora de `TAXAS_IVA`.
- **Schemas:** faturação, produtos e item de pedido de compra passam a usar `taxaIvaSchema`. Cada um mantém a
  sua mensagem actual (o manual cita as duas), e **a taxa passa a obrigatória** (sai o `.default(0.16)`,
  decisão C2). Todos os chamadores de UI já a enviavam; nenhum seed nem rota passa por estes schemas.
- **Adjudicação:**
  - Um item com produto usa `Produto.taxaIva`, numa só leitura com `tenantId` explícito (`select` de id e
    taxa).
  - Um item sem produto, ou com produto de outro tenant, fica a 16%.
  - Um produto com taxa fora de `TAXAS_IVA` dá `TAXA_IVA_PRODUTO_INVALIDA`.

## Decisões

- **D1** Fonte única em `src/lib/iva.ts`. A regra já tinha divergido em dois ficheiros.
- **D2** A taxa reduzida de 5% **não** foi acrescentada: a lei prevê-a (ADR-0034), mas precisa de ADR
  próprio e de pro rata. Acrescentá-la será mudar `TAXAS_IVA` e `ROTULOS_TAXA_IVA`; os formulários já não
  têm literais de taxa.
- **D3** Um valor vazio ou inválido dá erro visível, nunca omissão. Os 5 formulários não escolhem produto,
  por isso o ramo «taxa do produto» só se aplica na adjudicação (D5).
- **D4** Entram faturação, produtos (incluindo o formulário de edição, C3) e item de pedido. Ficam de fora
  `validations/vendas.ts` e `servicos.ts`, que aceitam qualquer 0..1 → issue [#207](https://github.com/fxavier/gespro-frontend/issues/207).
- **D5** Adjudicação pela taxa do produto.
- **D6a** Documentos já emitidos a 16% por engano **não se alteram** (append-only, fiscal). A correcção é do
  utilizador: nota de crédito e documento novo.
- **D6b** Ver o aviso abaixo.

> **Aviso D6b.** A verificação `PRORATA_NAO_SUPORTADO` (`apuramento-iva.service.ts:379-409`) só recusa
> taxas **fora** de {0, 0.16}. As operações isentas passam sem limitar a dedução, ao contrário do que o
> ADR-0034 §4 pede. Até aqui não se via, porque as isentas saíam a 16%. Com esta correcção passam a entrar a
> 0%, e o apuramento aceita-as sem pro rata. O apuramento não foi alterado aqui → issue
> [#208](https://github.com/fxavier/gespro-frontend/issues/208), gravidade A. Relacionada com #144.

## Alterações a oráculos existentes

**Nenhuma.** Os testes existentes passam todos a taxa explícita. Os únicos ficheiros de teste do diff são os
do N1. Depois do commit do N1, o autor não tocou em `__tests__`, `*.test.ts`, `fixtures` nem `e2e`.

## Verificação (N4)

| Verificador | Resultado |
|---|---|
| Oráculo (6 ficheiros) | 73/73 verde. Antes: 53 vermelhos, todos por asserção ou pelo esqueleto «por implementar» |
| `pnpm check` | tsc e eslint limpos. vitest: 1803 verdes e 1 vermelho, o golden da spec 22, parado na sentinela por resíduos da base local alheios a este PR: um compromisso manual criado a 24/09 e a carteira M-Pesa que o seed do PR #205 acrescentou. `totalFaturas` continua 106: nenhum documento deste trabalho entrou na base principal |
| `pnpm gates` | 5/5 |
| `pnpm build` | verde |
| E2E `17-iva-isento`, `05-faturacao`, `99-iva-smoke` | 20/20, contra uma base isolada (`gespro_e2e77`, migrate deploy + seed) num dev server na porta 3011 |
| Base (factura) | 0% → `LinhaFatura.taxaIva = 0`, `ivaTotal = 0`, sem partida 44331. Mista → IVA 160, uma partida 44331 |
| Smoke manual | Cotação, proforma e nota de crédito a 0%, 16% e mista gravam totais 1000 / 1160 / 2160, com IVA 0 / 160 / 160. `editar-produto` grava a taxa 0 |

## Fora de âmbito (visto, não tocado)

- `validations/vendas.ts` (73, 322, 380) e `servicos.ts` (94, 223) aceitam qualquer 0..1 → #207.
- A taxa de 5% (D2).
- `ConfiguracaoFiscal.taxaIvaDefault` do tenant como taxa por omissão de uma linha nova (D3).
- A aritmética em `Number`/`Math.round` no schema de faturação, e a de `calcularTotaisPedido` (IVA sobre o
  líquido, sem arredondamento por linha; o `subtotal` do item inclui IVA). No pedido, «mostrado = gravado»
  pode diferir 0,01 em casos-limite. Passar a Decimal é outro trabalho.
- Apuramento e pro rata (D6b, #208).
- Formulários que pedem id interno (#26): cotação e nota de crédito pedem o CUID do cliente ou da factura.
- `novo-produto-form.tsx` usa rótulos locais e `<SelectValue />` sem filho.
- **Defeito que já existe em `main`, visto no smoke:** editar um produto com «Stock Máximo» vazio falha sempre.
  - O formulário converte `''` em 0, e `ProdutoUpdateSchema` exige `positive()`.
  - O servidor responde 422 com o erro na chave `data`, que nenhum campo mostra.
  - O utilizador clica Guardar e nada acontece.
  - Reproduzido também com o schema de `origin/main`. Ainda não tem issue.
- **Defeito visto pelo verificador:** `/vendas/faturas/nova` tem campos de data só com `onChange`, e o `fill`
  do Playwright deixa «Invalid date».
- `/compras/pedidos/[id]` não existe, apesar de a tabela ligar para lá. O E2E lê o total na listagem.
