# ADR-0039 — Nota de débito em contabilidade e finanças

- **Estado**: Proposto
- **Data**: 2026-09-24
- **Contexto**: Fecho do ciclo da nota de débito — natureza do débito, ND de fornecedor, estorno no cancelamento
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (exercício e período), [ADR-0034](./ADR-0034-apuramento-iva.md) (IVA liquidado e dedutível), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (trilho)
- **Relacionados**: [ADR-0036](./ADR-0036-projecao-tesouraria.md) (a ND de fornecedor entra na projecção pela `ContaPagar`)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `domain-modeling`, `fiscalidade-mz`, `tdd`

## Contexto

A nota de débito **de cliente já existe e funciona**: modelo (`financas.prisma:740-792`), máquina de
estados `RASCUNHO → EMITIDA → LIQUIDADA | CANCELADA` (`faturacao.interface.ts:350-355`), serviço
completo (`faturacao.service.ts:757-891`), permissões próprias (`faturacao:nd:emitir|liquidar|cancelar`),
UI de lista e emissão, lançamento contabilístico na mesma transacção da emissão e integração no
apuramento de IVA (`apuramento-iva.service.ts:346, 664`).

Não é, portanto, uma funcionalidade a construir. São quatro buracos num ciclo quase fechado, e três
deles produzem números errados em silêncio.

**1. A ND credita sempre receita de vendas, qualquer que seja o motivo.**
`construirLancamentoNotaDebito` (`faturacao.service.ts:228-253`) faz invariavelmente
`D 411 Clientes / C 711 Vendas-Mercadorias (+ 44331 IVA liquidado)`. Uma ND de juros de mora vai
inflacionar o volume de negócios; uma ND que repercute portes pagos a um transportador regista como
venda o que é uma recuperação de gasto. Nos dois casos a DRE fica errada e ninguém recebe um aviso — o
lançamento está equilibrado, só está na conta errada.

**2. Cancelar uma ND não estorna o lançamento, e apaga a informação que lá estava.**
`cancelarNotaDebito` (`faturacao.service.ts:886-891`) muda o estado e escreve o motivo **por cima** de
`observacoes`. O lançamento fica no razão, o IVA fica liquidado e o cliente continua a dever no 411.
`cancelarNotaCredito` (`:746`) tem exactamente o mesmo defeito.

**3. A ND de fornecedor não existe.** Zero ocorrências em `compras.prisma` e em `services/compras`.
Quando um fornecedor debita portes, juros ou um acerto de preço sobre uma factura já registada, não há
onde o pôr: ou se falsifica uma segunda factura, ou se altera a conta a pagar original, ou fica fora do
sistema e do IVA dedutível.

**4. Não há documento nem detalhe.** Não existe `/vendas/notas-debito/[id]`, não existe modelo de PDF
para ND (`src/lib/documents/` só tem `fatura-model.ts`) e a ND não aparece em lado nenhum do módulo de
contabilidade — só em vendas.

Um quinto facto condiciona o âmbito: **não existe `ContaReceber` no sistema**. Há `ContaPagar` e
`Pagamento` (compras) e `PagamentoVenda` (comercial), mas nada que registe o que os clientes devem.
`liquidarNotaDebito` só muda o estado porque não há para onde liquidar. Isto fica **fora deste ADR**
— é uma entidade que afecta factura, proforma, projecção de tesouraria e antiguidade de saldos, e
merece decisão própria.

## Decisão

### 1. A natureza do débito escolhe a conta de crédito

Novo enum `NaturezaNotaDebito` e coluna `natureza` em `NotaDebito`, com mapeamento explícito para o
PGC-NIRF ao lado de `PGC_FATURACAO`:

| Natureza | Conta creditada | Porquê |
|---|---|---|
| `ACERTO_PRECO` | `711` Vendas | é receita: o preço facturado estava abaixo do acordado |
| `JUROS_MORA` | `78x` Juros obtidos | é rendimento financeiro, não volume de negócios |
| `DESPESAS_REPERCUTIDAS` | a conta de gasto original | recuperação de gasto, não venda — evita duplicar o custo |
| `PENALIZACAO` | `78x` Outros rendimentos | não é contrapartida de bem nem serviço |
| `OUTRO` | escolhida no acto, entre contas de rendimento | escotilha explícita, nunca silenciosa |

`ACERTO_PRECO` é o valor por omissão, que é o comportamento actual — as ND já emitidas continuam
correctas sem intervenção.

A conta concreta de cada natureza fica **configurável por tenant**, não fixada em código: o
`PGC_FATURACAO` actual são constantes e serviu enquanto havia um só caminho. Com cinco naturezas e
`DESPESAS_REPERCUTIDAS` a apontar para uma conta que varia consoante a despesa, o código deixa de
conseguir decidir sozinho.

### 2. A ND de fornecedor é uma `ContaPagar`, não um modelo novo

Neste sistema **`ContaPagar` já é a factura de fornecedor**: carrega `numeroDocumento`,
`dataDocumento`, `nuitFornecedor`, `baseIva`, `taxaIva`, `valorIva` e `tipoAquisicao`
(`compras.prisma:736-782`), e o apuramento de IVA dedutível lê `ContaPagar` agrupada por
`tipoAquisicao` (`apuramento-iva.service.ts:679-694`).

Uma ND de fornecedor é uma obrigação de pagamento com um documento fiscal por trás — que é exactamente
o que `ContaPagar` modela. Registá-la como uma **nova `ContaPagar` ligada à original** faz com que
entre no IVA dedutível, na antiguidade de saldos, nos pagamentos e na projecção de tesouraria **sem
uma linha de código nesses módulos**. Um modelo `NotaDebitoFornecedor` paralelo obrigaria a replicar
tudo isso e a manter dois caminhos em sincronia para sempre.

Acrescentam-se a `ContaPagar`:

```prisma
tipoDocumento      TipoDocumentoContaPagar @default(FACTURA)  // FACTURA | NOTA_DEBITO | NOTA_CREDITO
contaPagarOrigemId String?                                    // FK escalar para a original
motivo             String?                                    // obrigatório quando não é FACTURA
```

A conta a pagar original **não é tocada**: `valorOriginal` e `valorRestante` continuam a dizer o que a
factura pedia. É a mesma regra de imutabilidade que governa facturas e lançamentos neste repositório,
e é o que permite responder mais tarde a «quanto é que este fornecedor cobrou a mais, e sobre o quê».

A ND de fornecedor **não consome série de documento**: o número é do fornecedor, vai para
`numeroDocumento`, como em qualquer factura recebida. O `numero` interno continua a vir da série
`CONTA_PAGAR` que já existe.

O IVA dedutível herda `tipoAquisicao` da conta a pagar original por omissão, e é editável — uma ND de
portes sobre uma aquisição de mercadorias pode ter enquadramento diferente.

### 3. Cancelar um documento fiscal estorna o lançamento

`cancelarNotaDebito` e `cancelarNotaCredito` passam a correr em `$transaction` e a gerar o lançamento
de estorno através do caminho de estorno que a contabilidade já expõe, antes de mudar o estado. O
motivo passa a ter coluna própria (`motivoCancelamento`), e `observacoes` deixa de ser sobrescrita.

O cancelamento é recusado se o período contabilístico do lançamento original estiver fechado — a
regra do ADR-0033 aplica-se aqui como em qualquer lançamento.

A NC entra neste ADR apesar de não ter sido pedida porque é o **mesmo defeito na função ao lado**, com
a mesma correcção de cinco linhas. Corrigir uma e deixar a outra é deixar uma armadilha com o nome
trocado.

### 4. A ND autónoma usa o modelo de linha existente

Uma ND de juros ou penalização não tem quantidade nem preço unitário, mas não justifica um segundo
modelo de linha: regista-se com `quantidade = 1` e `precoUnitario = valor`, e é a **natureza** que
decide a conta. O que falta de verdade é a UI, que hoje impõe a grelha de produto, e o IVA: as
validações aceitam `0.16` ou `0` (`validations/faturacao.ts:62-79`) mas **não há campo para o motivo
de não sujeição**, que a factura moçambicana exige quando a taxa é zero.

Acrescenta-se `motivoIsencao String?` à linha, obrigatório quando `taxaIva = 0`. Aplica-se a ND, NC e
factura — é a mesma lacuna nas três.

## Consequências

**Positivas.** A DRE deixa de absorver juros e recuperações de gastos como volume de negócios. O
cancelamento passa a ser reversível e auditável em vez de deixar lixo no razão. A ND de fornecedor
entra no IVA dedutível e na tesouraria sem código novo nesses módulos. A factura ganha o motivo de
isenção que lhe faltava.

**Negativas.** `ContaPagar` deixa de significar exactamente «factura de fornecedor» e passa a ser
«documento de dívida a fornecedor», o que obriga a rever todas as listagens e agregações que a contam
— uma listagem de facturas de fornecedor passa a precisar de `tipoDocumento = FACTURA`. O mapeamento
natureza → conta, sendo configurável por tenant, é estado novo que precisa de escritor e de valor por
omissão no provisionamento (skill `estado-com-escritor`).

**Riscos.** (a) ND já emitidas ficam todas com `natureza = ACERTO_PRECO`, o que é a suposição certa na
ausência de informação mas não é necessariamente verdade para cada documento histórico; não há
backfill possível e não se inventa um. (b) O estorno no cancelamento muda o comportamento de um
documento fiscal já em uso — exige teste de que o par emissão+estorno soma zero no razão e no
apuramento. (c) A conta de `DESPESAS_REPERCUTIDAS` é escolhida pelo utilizador no acto de emissão; uma
escolha errada é um erro contabilístico que o sistema não consegue detectar.

## Grafo de execução

```
        Modelo ──┬── Contabilizacao ──┐
                 ├── Fornecedor ──────┼── Documento ── UI
                 └────────────────────┘
```

| Nó | Entrega | Depende de |
|---|---|---|
| **Modelo** | `NaturezaNotaDebito`, `natureza` em `NotaDebito`, `motivoCancelamento`, `motivoIsencao` nas linhas, `tipoDocumento`/`contaPagarOrigemId`/`motivo` em `ContaPagar`, mapeamento natureza→conta por tenant | — |
| **Contabilizacao** | `construirLancamentoNotaDebito` por natureza, estorno no cancelamento de ND e NC, validação do período fechado, IVA zero com motivo | Modelo |
| **Fornecedor** | registo da ND de fornecedor como `ContaPagar` ligada, herança e edição de `tipoAquisicao`, lançamento, listagens de compras filtradas por `tipoDocumento` | Modelo |
| **Documento** | modelo de PDF da ND (cliente e fornecedor), exportação CSV/PDF, trilho de auditoria das transições | Contabilizacao, Fornecedor |
| **UI** | `/vendas/notas-debito/[id]`, emissão com natureza e valor único, `/compras/notas-debito`, vista da ND no módulo de contabilidade | Documento |

## Questões em aberto

1. **`ContaReceber`** — fora deste ADR por decisão explícita. Enquanto não existir, `LIQUIDADA` é uma
   transição de estado sem contrapartida financeira, e o sistema não sabe dizer o que os clientes
   devem. Merece ADR próprio.
2. **Conta de juros obtidos** — `78x` é o enquadramento habitual no PGC-NIRF; o código exacto fica por
   confirmar contra o plano semeado em `prisma/seed/` antes do nó Contabilizacao.
3. **ND de fornecedor sobre conta a pagar já paga** — permitir, e com que estado inicial? A proposta é
   permitir (o fornecedor pode debitar depois de liquidada a factura) e a ND nascer `ABERTA` como
   qualquer outra conta a pagar.
4. **Nota de crédito de fornecedor** — o `tipoDocumento` já a prevê, mas o âmbito e o sinal do
   lançamento ficam para depois. Não implementar por simetria sem a decisão estar tomada.
