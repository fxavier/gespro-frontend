# ADR-0042 — Custo das vendas: inventário periódico primeiro, permanente depois

- **Estado**: Proposto (a escolha do sistema de inventário espera confirmação legal — ver Questões em aberto, 1)
- **Data**: 2026-10-07
- **Contexto**: Nenhuma venda lança o custo das mercadorias vendidas. As compras de mercadoria ficam em `211 Compras — Mercadorias` para sempre, a DRE mostra a receita sem o custo que a gerou e o balanço mostra como activo tudo o que alguma vez se comprou
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (períodos e fecho), [ADR-0041](./ADR-0041-pos-documento-fiscal-contabilidade.md) §9 (o custo das vendas ficou de fora, com a conta folha de mercadorias)
- **Relacionados**: [ADR-0034](./ADR-0034-apuramento-iva.md) §1 (IVA dedutível das compras, ainda sem caminho), [ADR-0035](./ADR-0035-encerramento-exercicio.md) (apuramento de resultados), [ADR-0037](./ADR-0037-demonstracao-fluxos-caixa.md) (DFC), [ADR-0040](./ADR-0040-balancete-verificacao-phc.md) (balancete)
- **Issue**: #332

## Contexto

O que o código faz hoje, verificado:

| Fluxo | Stock | Contabilidade |
|---|---|---|
| Recepção de compra (`compras.service.ts`, só quando o pedido fica `RECEBIDO_TOTAL`) | `entradaStock` por cada recepção, parcial ou total | **D 211 / C 421** pelo `pedido.valorTotal` (com IVA — o IVA dedutível não tem caminho, ADR-0034 §1) |
| Conta a pagar registada à mão | — | D na conta escolhida pelo utilizador (o seed usa **6112** para mercadoria) / C 421 |
| Venda POS, encomenda convertida, factura | `baixarStock` / `confirmarConsumoStock` | D meio / C 711 / C 44331 — **sem custo** |
| Devolução, troca, anulação POS | `entradaStock` | NC: estorno da receita — **sem custo** |
| Contagem de stock, transferência entre localizações | `AJUSTE`, `TRANSFERENCIA_*` | nada |

E o que falta para lançar um custo por movimento:

- `MovimentoStock` não guarda custo (`prisma/schema/inventario.prisma`, modelo `MovimentoStock`); não há custo
  médio em lado nenhum. O único número disponível é `Produto.precoCompra`, um campo de catálogo que ninguém
  mantém em sincronia com as compras — o ADR-0041 §9 já o recusou como «um número inventado com aspecto de
  contabilidade».
- O razão `22 Mercadorias` do `prisma/seed/data/plano-contas-pgc.json` não tem conta folha para a mercadoria
  em armazém: só `221 Mercadorias em trânsito` e `222 Mercadorias em poder de terceiros`; o próprio `22` tem
  `aceitaLancamento: false`.
- `6112 Custo dos inventários vendidos — De mercadorias` existe, aceita lançamentos e já está mapeada na DFC
  (`OP-00`, `prisma/seed/data/rubricas-fluxo-caixa.json`). As contas 21x, 22x e 28x estão mapeadas em `OP-03
  Variação de inventários`.

Consequência: o resultado de qualquer tenant com stock está **sobreavaliado pelo custo inteiro das
mercadorias vendidas**, e o activo da classe 2 cresce a cada compra sem nunca descer. O encerramento
(ADR-0035) apura esse resultado errado para 81/88.

O PGC-NIRF (Decreto 70/2009) admite dois sistemas de inventário. Este ADR escolhe qual entra primeiro.

## Decisão

### 1. Passo 1 — inventário periódico (intermitente)

O custo das mercadorias vendidas apura-se **no fecho de cada período mensal**, pela fórmula do sistema
periódico, e não por movimento:

```
CMV(período) = Ei + Compras − Ef
```

- **Ei** — valor do inventário final do período anterior (o `Ef` gravado na regularização anterior, ou o
  inventário inicial declarado — §5).
- **Compras** — o saldo de `211` no fim do período, tal como o razão o tem. É o razão que manda, não as
  recepções: qualquer divergência entre o que entrou no armazém e o que se lançou (ver Riscos) acaba no CMV
  em vez de ficar escondida num activo.
- **Ef** — quantidade em stock no instante do fim do período × custo unitário (§3).

Nenhum serviço de venda, devolução, troca, contagem ou transferência muda. Tudo o que mexe na quantidade
aparece no `Ef` e, por ele, no CMV — incluindo quebras e diferenças de contagem (ver §6).

### 2. Lançamento da regularização

Um lançamento por período, com a data do último dia do período (instante de Maputo, `periodoFiscalDe`),
diário `OPERACOES`, origem `AJUSTE`, escrito só por `registarLancamentoContabilistico` (o `gate-periodo`
mantém-se a zero):

| Conta | D/C | Valor |
|---|---|---|
| 22x Mercadorias em armazém (§4) | D | saldo de 211 (transferência das compras) |
| 211 Compras — Mercadorias | C | saldo de 211 |
| 6112 Custo das mercadorias vendidas | D | `Ei + Compras − Ef` |
| 22x Mercadorias em armazém | C | `Ei + Compras − Ef` |

No fim, `211` fica a zero e `22x` fica com `Ef`. Se o CMV sair negativo (possível quando uma compra foi
lançada directamente a 6112, ou numa recepção parcial — ver Riscos) as partidas do CMV invertem-se; o
lançamento não recusa, porque o razão está certo no conjunto dos períodos, mas a página da regularização
mostra o aviso.

A regularização grava um registo próprio, append-only (`RegularizacaoInventario`: período, `Ei`, compras,
`Ef`, CMV, `lancamentoId`, e uma linha por produto com quantidade, custo unitário e origem do custo). É o
`Ei` do período seguinte e a prova do número. Uma regularização errada corrige-se por estorno e nova
regularização no mesmo período aberto — nunca por UPDATE.

### 3. Valorização do Ef — custo médio ponderado do período

Por produto:

```
custo unitário = (valor Ei + Σ valor recebido no período) / (quantidade Ei + Σ quantidade recebida no período)
```

- Valor recebido: `ItemRecebimento.quantidadeAceita × ItemPedidoCompra.precoUnitario`, líquido do desconto da
  linha pro rata, **sem IVA**, para recepções com `RecebimentoCompra.data` no período.
- Quantidade no fim do período: reconstruída de `MovimentoStock` com `createdAt` até ao fim do período, pela
  mesma regra de sinal que mantém `SaldoStock`, somando todas as localizações (as transferências anulam-se).
  Invariante com teste: a reconstrução «até agora» é igual a `Σ SaldoStock` do produto.
- Produto com quantidade positiva e sem custo conhecido (nem Ei, nem recepção no período): a regularização
  **recusa** com `PRODUTO_SEM_CUSTO` e devolve **todos** os produtos nessa situação de uma vez (como
  `fecharPeriodo` faz com os impedimentos). O utilizador declara o custo no formulário; o `precoCompra`
  aparece como sugestão, nunca como valor por omissão silencioso. A origem fica gravada na linha
  (`MEDIO_PERIODO` | `DECLARADO`).
- Variantes: o custo é por produto, não por variante (as recepções não distinguem variante).

### 4. Conta folha de mercadorias em armazém

Entra na classe 2, sob `22 Mercadorias`, com o primeiro escritor — a regularização — como o ADR-0041 §9
previu. Três sítios, no mesmo PR:

1. `prisma/seed/data/plano-contas-pgc.json` (tenants futuros, via `tenant-bootstrap`);
2. a migração, com `INSERT … SELECT … ON CONFLICT DO NOTHING` para os tenants que já existem;
3. `prisma/seed/data/rubricas-fluxo-caixa.json`, mapeada em `OP-03` — sem isso a DFC acusa conta sem rubrica.

O código exacto fica por confirmar (Questões em aberto, 2); este ADR chama-lhe **22x**. Os códigos vivem
numa constante `PGC_INVENTARIO` (fallback) como `PGC_COMPRAS` e `PGC_FATURACAO`.

### 5. Sistema de inventário por tenant e pré-condição do fecho

- Configuração por tenant `sistemaInventario`: `NAO_APLICAVEL` (sem mercadorias) | `PERIODICO` |
  `PERMANENTE` (reservado ao passo 2, recusado até existir). A migração põe `PERIODICO` nos tenants com algum
  `MovimentoStock` e `NAO_APLICAVEL` nos outros; o `tenant-bootstrap` cria-os `NAO_APLICAVEL` e o primeiro
  produto com stock pede a escolha.
- Em `PERIODICO`, `fecharPeriodo` ganha um oitavo impedimento, `INVENTARIO_NAO_REGULARIZADO`, devolvido com os
  outros em `impedimentos[]`, lido na leitura trancada como os restantes.
- **Inventário inicial**: a primeira regularização de um tenant exige um `Ei` declarado (quantidade e custo
  por produto, à data do início do primeiro período regularizado), lançado D 22x / C conta a decidir
  (Questões em aberto, 3). Sem ele, `Ei = 0` e o primeiro CMV absorveria como custo tudo o que já estava no
  armazém — recusado com `INVENTARIO_INICIAL_EM_FALTA`.

### 6. O que fica igual no passo 1

- Vendas, encomendas, facturas, devoluções, trocas, contagens e transferências: nenhum serviço muda, nenhuma
  transacção de venda fica mais pesada.
- Quebras e diferenças de contagem entram no CMV (sistema periódico puro), não em `6842 Quebras` nem em
  `282 Regularização de inventários`. Separá-las exige custo por movimento — é do passo 2.
- Produção (matérias-primas 26x/61161, produto acabado 23x/612) fica fora: só mercadorias e `6112`.
- O seed de demonstração **não** corre a regularização. As golden da DFC, da projecção e o `balancete`
  não mudam; a migração acrescenta uma conta sem movimento, que nenhum mapa de saldos mostra.
  O que muda para quem testa: a migração põe o tenant `demo` em `PERIODICO` (tem stock), e um teste que
  feche um período desse tenant passa a receber `INVENTARIO_NAO_REGULARIZADO` — esses testes regularizam
  antes de fechar ou usam um tenant `NAO_APLICAVEL`.

### 7. Passo 2 — inventário permanente com custo médio ponderado (evolução)

Fica decidido como destino, não como trabalho deste ADR. Quando entrar, substitui o §1–§3 para os tenants
em `PERMANENTE`, e a sua forma é esta:

- `MovimentoStock.custoUnitario` (Decimal, gravado no movimento, append-only) e um custo médio corrente por
  produto (`SaldoStock` ou tabela própria), recalculado em cada entrada dentro da transacção do
  `entradaStock`, com tranca da linha do produto (`FOR UPDATE`) — duas recepções concorrentes não podem ler
  o mesmo médio.
- Compras: D 22x em vez de D 211 na recepção, por recepção e não só no `RECEBIDO_TOTAL`; ou manter D 211 e
  transferir 211 → 22x no mesmo lançamento. Decide-se no ADR do passo 2.
- Venda: D 6112 / C 22x ao custo médio do momento, no mesmo lançamento da venda (ADR-0041 §3).
- Devolução e troca: reentrada ao custo **da saída original** (D 22x / C 6112), não ao médio actual.
- Contagem: faltas a `6842 Quebras`, sobras a `764 Ganhos em inventários`, ao custo médio.
- Transferências: o custo acompanha a quantidade; sem lançamento.
- Histórico sem custo: o primeiro custo médio de cada produto é o `Ef` da última regularização periódica —
  é por isso que o passo 1 grava o custo por produto. Os movimentos anteriores ficam sem custo, e isso é
  aceite e documentado.
- Golden da DFC e do balancete: se o seed passar a gerar movimentos com custo, as fixtures re-derivam-se à
  mão (handoff da spec 22), nunca com `vitest -u`.

## Alternativas consideradas

- **(a) Inventário permanente já, com custo médio ponderado.** É o modelo certo a prazo e é o passo 2. Agora
  custa: coluna nova num modelo append-only com milhares de linhas sem valor, tranca por produto no caminho
  quente da venda POS, reescrita de devoluções, trocas, contagens e da recepção de compras, e um histórico
  sem custo que tem de ser semeado de alguma forma — tudo isso antes de o primeiro CMV existir. O passo 1
  dá um CMV correcto por período com uma escrita nova e um serviço novo.
- **(c) Custo por venda a `Produto.precoCompra`.** Rejeitada pelo ADR-0041 §9 e aqui mantida: o campo não
  acompanha as compras e transformaria um palpite de catálogo num lançamento.
- **(d) FIFO/LIFO.** O LIFO não é admitido pelas normas que o PGC-NIRF segue; o FIFO exige camadas de custo
  por entrada, mais pesado do que o custo médio e sem ganho para o perfil dos tenants. O custo médio é
  também o que o passo 2 usa, o que faz do `Ef` do passo 1 o ponto de partida natural.
- **(e) Regularização só anual (período 12/13).** Mais simples e fiel ao sistema periódico clássico, mas
  deixa onze DRE mensais sem custo nenhum — o mesmo defeito de hoje em onze de cada doze meses.

## Consequências

- A DRE passa a ter custo das vendas por período; o resultado apurado no encerramento (ADR-0035) deixa de
  estar sobreavaliado.
- `211` passa a ser uma conta de passagem: zero depois de cada regularização. `22x` passa a ser o activo de
  mercadorias do balanço.
- A DFC não muda de código: 22x entra em `OP-03`, 6112 já está em `OP-00`; o CMV é resultado, a variação de
  22x é variação de inventários.
- O fecho mensal ganha um passo humano (regularizar) e um impedimento novo nos tenants `PERIODICO`.
- Enquanto o IVA das compras não for dedutível pelo fluxo de recepção (ADR-0034 §1), o `211` inclui IVA e o
  `Ef` não: a diferença vai para o CMV. É o tratamento correcto para IVA não dedutível e desaparece quando a
  dedução tiver caminho.

**Riscos.** (a) A recepção só lança no `RECEBIDO_TOTAL`: uma recepção parcial no fim do mês põe mercadoria no
`Ef` sem a compra em `211`, e o CMV desse mês sai baixo (até negativo); acerta-se no período em que o pedido
fecha. No ano, soma certo; no mês, não. (b) Compras de mercadoria lançadas à mão a `6112` (o seed faz isto)
continuam a dar o CMV certo no conjunto, porque a fórmula usa o `Ef` físico, mas distorcem a leitura mensal;
a página de contas a pagar deve sugerir `211` para mercadoria. (c) O CMV de um período depende da qualidade
do stock registado — sem contagens, o erro de stock é erro de custo, sem rasto separado.

## Grafo de execução

Passo 1:

```
        Contas ──┬── Valorizacao ──┬── Regularizacao ──┬── Fecho
                 └── Configuracao ─┘                   └── UI
```

| Nó | Entrega | Depende de |
|---|---|---|
| **Contas** | conta 22x no plano, migração para tenants existentes, mapeamento DFC `OP-03`, `PGC_INVENTARIO` | Questões em aberto 2 |
| **Configuracao** | `sistemaInventario` por tenant, migração por existência de `MovimentoStock`, inventário inicial declarado e o seu lançamento | Contas, Questões em aberto 3 |
| **Valorizacao** | núcleo puro: quantidade no instante (com o invariante contra `SaldoStock`), custo médio do período, `PRODUTO_SEM_CUSTO` com todos os produtos; property tests | Contas |
| **Regularizacao** | `RegularizacaoInventario` append-only, lançamento do §2 por `registarLancamentoContabilistico`, estorno | Valorizacao, Configuracao |
| **Fecho** | impedimento `INVENTARIO_NAO_REGULARIZADO` em `fecharPeriodo`, na leitura trancada | Regularizacao |
| **UI** | `/contabilidade/regularizacao-inventario` (rota, sem modal): pré-visualização por produto, custos declarados, avisos de CMV negativo; exportação | Regularizacao |

Verificadores externos: invariante `Σ D = Σ C` e `211 = 0` depois da regularização; golden numérica de um
tenant sintético com Ei, duas compras a preços diferentes, vendas e uma devolução (custo médio à mão);
`pnpm check` com as golden da DFC e da projecção inalteradas; `pnpm gates` (`gate-periodo`).

Passo 2 (ADR próprio, que substitui o §7 quando for aceite): `MovimentoStock.custoUnitario` → custo médio
corrente → compras a 22x → custo na venda → devoluções/trocas → contagens a 6842/764 → migração de tenants
`PERIODICO` para `PERMANENTE` a partir do último `Ef`.

## Questões em aberto

1. **[HUMANO] Admissibilidade do sistema periódico.** O PGC-NIRF admite os dois sistemas, mas fica por
   confirmar se a legislação moçambicana (Código do IRPC, Decreto 70/2009 e regulamentação das PME) obriga ao
   inventário permanente a partir de certa dimensão, como acontece noutras jurisdições. Se obrigar, o passo 1
   continua a servir os tenants abaixo do limite e o passo 2 passa a pré-requisito dos outros. É a razão do
   estado Proposto.
2. **Código exacto da conta de armazém.** O plano semeado tem `22` não-movimentável com `221`/`222`. Opções:
   (i) criar `223 Mercadorias em armazém`; (ii) criar `220`; (iii) tornar `22` movimentável e eliminar a
   necessidade de folha. A (iii) partiria o pressuposto, usado no balancete e no roll-up, de que só as
   folhas recebem partidas. A confirmar com um TOC contra o articulado do Decreto 70/2009 antes do nó Contas.
   Fica também por decidir se devoluções e descontos de compras passam a usar `217`/`218` (hoje ninguém
   escreve nelas) — com o sistema periódico entram na fórmula como «Compras» líquidas.
3. **Inventário inicial — contrapartida e data.** Para um tenant que começa a usar o GestPro com stock: a
   contrapartida do D 22x é o diário de abertura (ADR-0035, `ABERTURA`) com `59 Resultados transitados`, ou
   uma conta de capital? Para um tenant que já tem compras em `211` de períodos anteriores sem regularização:
   regulariza-se período a período desde o primeiro com movimento, ou declara-se o `Ei` no primeiro período
   aberto e o histórico fecha como está? A proposta é a segunda, com o saldo de `211` desses períodos tratado
   como compras do primeiro período regularizado.
4. **Períodos já fechados.** Tenants com períodos fechados antes desta regra não têm regularização nesses
   períodos. A proposta é não reabrir nada: a primeira regularização acontece no primeiro período aberto.
5. **Variantes e unidades.** O custo é por produto; se as variantes de um produto tiverem custos muito
   diferentes (tamanhos, embalagens), o custo médio mistura-os. Aceite no passo 1; o passo 2 decide se o
   custo passa à variante.
