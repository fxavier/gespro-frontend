# ADR-0046 — Fundos recebidos, câmbio FIFO por tranche e tesouraria por financiamento

- **Estado**: Proposto
- **Data**: 2026-10-12
- **Contexto**: Spec 24 (Contabilidade Orçamental) · Épico WS-4
- **Depende de**: [ADR-0043](./ADR-0043-dominio-orcamental-financiamentos.md), [ADR-0044](./ADR-0044-imputacao-analitica-multipla.md), [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (fecho do período)
- **Relacionados**: [ADR-0045](./ADR-0045-ciclo-despesa-controlo-disponibilidade.md), [ADR-0036](./ADR-0036-projecao-tesouraria.md), [ADR-0038](./ADR-0038-reconciliacao-bancaria-automatica.md), [ADR-0047](./ADR-0047-reconhecimento-financiamentos.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `fluxo-de-caixa-conventions`, `tdd`

## Contexto

**O GestPro não tem multi-moeda.** Os campos `currency String @default("MZN")` de compras e
`ContaBancaria.moeda` são etiquetas: nenhuma taxa, nenhuma conversão, e os lançamentos são todos em
MZN. Os financiamentos de doadores vêm em USD ou EUR, a despesa faz-se em MZN e o financiador mede o
cumprimento **na moeda do acordo**.

O alinhamento de 2026-10-12 escolheu o método **«taxa da tranche, FIFO»**: cada despesa é convertida
à taxa efectiva do dinheiro que efectivamente a financiou. É o método que reconcilia com o dinheiro
recebido: o saldo do fundo na moeda do acordo bate com o que o financiador transferiu menos o que foi
reportado.

Também ficou fixado que a tesouraria é **mista**: alguns acordos exigem conta dedicada e outros usam
conta comum.

## Decisão

### 1. Tranche = recebimento com taxa efectiva

```
RecebimentoFundos {
  id, tenantId, financiamentoId, data, contaBancariaId,
  valorMoeda Decimal(18,2), valorMzn Decimal(18,2), taxaEfectiva Decimal(18,6),  // = valorMzn / valorMoeda
  lancamentoId, referenciaBancaria, estado REGISTADO | ANULADO, criadoPorId, createdAt
}
```

`valorMzn` é o que entrou no banco em MZN, ou, numa conta em moeda estrangeira, o contravalor à taxa
do dia do recebimento (§5). A taxa é **derivada e gravada**, e nunca é introduzida à mão
independentemente dos dois valores.

### 2. Alocação FIFO gravada, não recalculada

```
AlocacaoTranche { id, tenantId, movimentoId (EXECUCAO), recebimentoId?, valorMzn, valorMoeda, taxa, provisoria, anulaId?, createdAt }   // valores com sinal
```

- Cada `EXECUCAO` positiva consome as tranches com saldo por ordem `(data, id)`. Se atravessar duas
  tranches, gera duas alocações.
- **Sem saldo de tranche** (a organização pré-financia): a alocação fica com `recebimentoId = null`,
  `provisoria = true` e a taxa de referência do dia (`TaxaCambio` do tenant; na falta dela, a
  execução é recusada com `TAXA_CAMBIO_EM_FALTA`). Quando chega uma tranche, um passo na mesma
  transacção do recebimento **realoca** as provisórias por ordem FIFO: anula a provisória
  (alocação simétrica com `anulaId`) e cria a definitiva. Nunca há `UPDATE`. Como a taxa muda, grava
  também um `MovimentoOrcamental` `EXECUCAO` **correctivo** (0 MZN, ± diferença na moeda do acordo),
  ligado à execução original, e isso mantém o `F3`. Se o período da execução já foi reportado, a
  diferença sai como ajustamento no relatório seguinte (ADR-0048 §1).
- **Estorno** de uma execução: anula **exactamente as suas alocações** (movimentos simétricos sobre as
  mesmas tranches). Não se re-corre o FIFO sobre o passado. Re-correr reavaliaria execuções já
  reportadas ao financiador.

Invariantes:
- **`F1`**: por tranche, Σ `AlocacaoTranche.valorMzn` ≤ `RecebimentoFundos.valorMzn`.
- **`F2`**: o `valorMoeda` de uma execução é a soma das suas alocações, e é reprodutível
  independentemente da ordem de leitura.
- **`F3`**: por execução, Σ `valorMoeda` do movimento e dos seus correctivos = Σ das suas alocações
  (com sinal). É gravado na mesma transacção.

A concorrência na alocação resolve-se trancando as tranches do financiamento com `FOR UPDATE` por
ordem FIFO, **depois** do financiamento e das linhas de controlo. É a ordem global do ADR-0045 §2.
Como é a mesma em todos os caminhos (recebimento incluído), não há deadlocks.

**Alternativa rejeitada — taxa média mensal (Banco de Moçambique ou taxa contabilística).** É mais
simples, mas gera, no fim do acordo, uma diferença entre «recebido em USD − gasto em USD» e o saldo
real em USD, que a organização tem de explicar ao financiador como perda ou ganho cambial sem origem
identificável.

**Alternativa rejeitada — calcular o FIFO na leitura.** Uma leitura posterior a uma inserção
retroactiva (uma factura de Março lançada em Maio) reordena a fila e muda valores de relatórios já
submetidos. A alocação gravada torna o passado estável. A factura retroactiva consome a tranche com
saldo **no momento em que é lançada**.

### 3. Taxa de referência

`TaxaCambio { tenantId, moeda, data, taxa Decimal(18,6), fonte }`, introduzida ou importada (CSV)
pelo utilizador. É usada para alocações provisórias, conversão de cabimentos e compromissos (§4) e
revalorização (§5). A integração automática com uma fonte externa fica fora do MVP: não está
confirmado que exista uma API estável do Banco de Moçambique, e sem isso não há decisão a tomar.

### 4. Cabimento e compromisso na moeda do acordo

São convertidos à **taxa da próxima tranche com saldo** (é a que vai pagar, se nada mudar) ou, sem
saldo, à taxa de referência do dia, e gravados com essa taxa. Na execução, o valor em moeda do
acordo é o das alocações (§2), e a libertação do compromisso é feita **na moeda do acordo** até ao
valor comprometido. A diferença cambial entre o compromisso e a execução fica absorvida, e o
disponível reflecte-a.

### 5. Contas bancárias em moeda estrangeira

Para que um fundo em USD seja tesouraria real, e não só analítica:

- `PartidaLancamento` ganha `moeda String?`, `valorMoeda Decimal(18,2)?` e `taxa Decimal(18,6)?`. Só
  são obrigatórios em contas com moeda diferente de MZN (`ContaPGC.moeda`, derivada da
  `ContaBancaria`). O `valor` continua em MZN, e o balancete, a DRE e a DFC não mudam.
- **Revalorização no fim de cada período**: para cada conta em moeda estrangeira, saldo em moeda ×
  taxa de fecho − saldo em MZN → lançamento de diferenças de câmbio favoráveis ou desfavoráveis
  (contas configuráveis por tenant, a confirmar no `plano-contas-pgc.json`). Passa a ser um impedimento
  novo de `fecharPeriodo` (`REVALORIZACAO_CAMBIAL_EM_FALTA`), somado aos sete que existem hoje.
- As diferenças de câmbio **não são execução orçamental**. São imputáveis ao financiamento só quando o
  acordo o determina (questão em aberto 4 da spec).

**Impacto conhecido**: a reconciliação bancária (ADR-0038) compara valores em MZN. Numa conta em USD
tem de comparar `valorMoeda`. Fica como tarefa da fase de contas em moeda estrangeira, e não como
decisão deste ADR.

### 6. Tesouraria por financiamento

- `Financiamento.contaBancariaDedicadaId?`. Quando existe, recebimentos e pagamentos imputados a esse
  financiamento **só** podem sair dessa conta (`CONTA_DEDICADA_OBRIGATORIA`).
- **Saldo do fundo** = Σ recebimentos − Σ `PAGAMENTO` − Σ `ADIANTAMENTO` em aberto (MZN e moeda do
  acordo), sempre derivado. Na moeda do acordo, o `PAGAMENTO` usa a fracção paga do `valorMoeda` da
  execução que liquida, e o `ADIANTAMENTO` usa a taxa com que o adiantamento foi comprometido (§4).
- Com conta dedicada, o painel mostra a reconciliação saldo do fundo ↔ saldo de razão da conta. A
  diferença decompõe-se em juros, comissões, câmbio e movimentos não imputados. Sem conta dedicada, o
  painel diz explicitamente que o saldo é analítico.
- A projecção de tesouraria (ADR-0036) aceita o filtro `financiamentoId`: entradas = tranches previstas
  no acordo (`TranchePrevista`, opcional); saídas = compromissos orçamentais em aberto, com a data
  prevista do documento de origem. O contrato do ADR-0036 por tenant **não muda**: o filtro é aditivo.

## Consequências

**Positivas**
- O relatório ao financiador sai na moeda do acordo com valores que **reconciliam com o dinheiro
  recebido**, e não com uma taxa teórica.
- Os relatórios submetidos são estáveis (alocação gravada).
- O GestPro ganha contas em moeda estrangeira, que é também uma lacuna para clientes empresariais
  importadores.

**Negativas**
- É a mudança mais transversal da spec: a partida ganha três colunas, o fecho ganha um impedimento e a
  reconciliação tem de as conhecer.
- O utilizador tem de manter a tabela de câmbios. Sem taxa, as execuções provisórias são recusadas.

**Riscos**
- **Pré-financiamento prolongado**: muitas execuções provisórias, realocadas em bloco quando chega a
  tranche. A realocação é O(n) na transacção do recebimento. Acima de um limiar (a medir), passa para
  tarefa em segundo plano com o recebimento em estado `A_ALOCAR`.
- **Recebimento anulado depois de alocado**: as alocações passam a provisórias (anulação + nova
  alocação provisória) e o recebimento só se anula se nenhuma das suas alocações estiver num relatório
  submetido (`TRANCHE_EM_RELATORIO_SUBMETIDO`).
