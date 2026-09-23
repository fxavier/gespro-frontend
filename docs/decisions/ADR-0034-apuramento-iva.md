# ADR-0034 — Apuramento periódico do IVA

- **Estado**: Proposto — a parte legal **requer confirmação contra o Boletim da República** (ver «O que não está conferido»)
- **Data**: 2026-09-18
- **Contexto**: Spec 02 (Contabilidade) · Spec 20 (Prontidão para Produção)
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (período trancado), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (trilho)
- **Relacionados**: [ADR-0021](./ADR-0021-fiscalidade-subscricao-saas.md) (o IVA da própria subscrição), [ADR-0005-a](./0005-motor-pdf.md) (mapas em PDF)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `api-conventions`, `fiscalidade-mz`

## Contexto

O GestPro liquida IVA e nunca o apura.

Verificado contra o código:

- A emissão de factura credita **44331 — IVA liquidado, operações gerais**
  (`src/server/services/financas/faturacao.service.ts:130` e `:161-167`). A nota de crédito estorna
  na mesma conta (`:208-214`). Está certo e está testado.
- **O IVA dedutível nunca é lançado.** O único lançamento do lado das compras é a liquidação da
  conta a pagar — `D 421 Fornecedores c/c / C 121 Depósitos à ordem`
  (`src/server/services/compras/conta-pagar.service.ts:224-225`). Não há lançamento de
  reconhecimento da dívida, e as contas `4432x` do plano nunca são tocadas. O IVA das compras é
  calculado nos totais do pedido (`compras.prisma:620-622`) e morre aí.
- As nove contas de IVA do plano existem e oito nunca foram escritas: `4431` suportado, `4432`
  dedutível, `4433` liquidado, `4434` regularizações, `4435` apuramento, `4436` liquidações
  oficiosas, `4437` a pagar, `4438` a recuperar, `4439` reembolsos pedidos — com as filhas
  `44321/44322/44323` (inventários, activos, outros bens e serviços) e `44341/44342/44343`
  (regularizações mensais a favor do sujeito passivo, a favor do Estado, anuais por pro rata
  definitivo).
- `ConfiguracaoFiscal.regimeIva` é `NORMAL | SIMPLIFICADO | ISENTO`, com
  `taxaIvaDefault = 0.160000` (`prisma/schema/plataforma.prisma:17-21, 56-59`).

Ou seja: `44331` cresce indefinidamente do lado credor, o balanço nunca mostra «IVA a pagar», e o
cliente preenche a Declaração Periódica à mão a partir de um mapa que o produto não emite.

### O que mudou na lei a 1 de Janeiro de 2026

A **Lei n.º 10/2025, de 29 de Dezembro** alterou o Código do IVA (Lei n.º 32/2007) com efeitos a
1 de Janeiro de 2026. O que toca directamente nesta decisão:

- **Os regimes especiais foram revogados** — o de tributação simplificada e o de isenção. Quem lá
  estava passa a contabilidade organizada e regime normal.
- **Taxa normal 16 %**, taxa reduzida **5 %** — e as operações à taxa reduzida **não conferem
  direito à dedução**; há ainda limitação da dedução em operações com base tributável reduzida.
- **Prazos de entrega escalonados**: até ao dia **10** do mês seguinte para serviços digitais
  adquiridos a não residentes; até ao dia **15** para guias com crédito ou sem movimento; até ao
  **último dia** do mês para guias com pagamento.
- **Declaração Periódica — Modelo A**; **Modelo E** para operações isoladas com autoliquidação.
- **Reembolsos**: acabou a exigência de crédito acumulado durante 12 meses; o prazo de decisão passa
  de 30 para 150 dias; o direito à dedução caduca em **10 anos** a contar do seu nascimento.

Duas consequências imediatas para o produto. Primeira: `RegimeIva.SIMPLIFICADO` e `RegimeIva.ISENTO`
passaram a ser categorias que a lei já não conhece. Segunda: a taxa reduzida sem direito a dedução
torna o pro rata um problema real, e não teórico, para qualquer tenant que preste serviços médicos,
de educação ou de formação profissional.

### O que não está conferido

As alterações acima vêm de análises de PwC, DLA Piper/SAL & Caldeira, KPMG e RSM — **não do
articulado publicado no Boletim da República**, que não foi lido. O
[`docs/research/mocambique-quadro-legal.md`](../research/mocambique-quadro-legal.md) já tinha
identificado «os textos da Lei n.º 12/2025 (IRPC) e da Lei n.º 10/2025 (IVA)» como por ler, e esta
decisão não resolve isso. Acresce que o Governo tem 180 dias para regulamentar, e a regulamentação
pode mexer nos modelos declarativos. **Antes de `Aceite`, esta parte é conferida contra o Boletim da
República e contra a AT.** O que se decide abaixo é a *forma* do apuramento no razão, que é estável;
os prazos e os modelos são parametrização.

## Decisão

**O apuramento é um lançamento contabilístico mensal, gerado do razão e não dos documentos, que
esvazia as contas de IVA contra `4435` e liquida o saldo para `4437` ou `4438`; recusa-se a produzir
um número quando não o sabe calcular.**

### 1. Sem IVA dedutível não há apuramento — e é aqui que ele entra

A decisão mínima que desbloqueia o resto: **o reconhecimento da dívida ao fornecedor passa a ser
lançado, e é aí que o IVA dedutível nasce.** `ContaPagar` ganha o bloco fiscal do documento:

```prisma
// ContaPagar — bloco fiscal (novo)
numeroDocumento  String?        // número da factura do fornecedor
dataDocumento    DateTime?      // data do documento, que é a que define o período de dedução
nuitFornecedor   String?        // copiado do Fornecedor no momento do registo
baseIva          Decimal?  @db.Decimal(18, 2)
taxaIva          Decimal?  @db.Decimal(9, 6)
valorIva         Decimal?  @db.Decimal(18, 2)
tipoAquisicao    TipoAquisicaoIva?  // INVENTARIOS | ATIVOS | OUTROS_BENS_SERVICOS
```

e o lançamento de reconhecimento fica `D <gasto ou existências> + D 4432x / C 421`, com o `4432x`
escolhido por `tipoAquisicao` — que é exactamente o que as três filhas de `4432` no plano já
distinguem. A liquidação mantém-se como está (`D 421 / C 121`) e não toca em IVA, porque a dedução
depende do documento e não do pagamento.

Um modelo `FaturaFornecedor` separado seria o desenho de domínio correcto — a conta a pagar é uma
obrigação financeira, a factura do fornecedor é um documento fiscal, e são coisas diferentes com
ciclos de vida diferentes. Foi recusado por proporção: duplicaria uma entidade em todos os fluxos de
compra já escritos, para modelar uma distinção que só se torna visível quando houver facturas de
fornecedor com várias taxas na mesma linha. Fica registado como a evolução natural, e o bloco fiscal
acima é deliberadamente o subconjunto que se transplanta sem perda quando isso acontecer.

**Sem NUIT do fornecedor e número de documento não há dedução** — é o documento que confere o
direito. O serviço recusa lançar dedutível sem os dois, com `DOCUMENTO_FORNECEDOR_INCOMPLETO`, em
vez de deduzir na mesma e deixar o mapa sem suporte.

### 2. A forma do lançamento de apuramento

Um lançamento por período, diário `OP` (`OPERACOES`), origem `AJUSTE`, data = último dia do período,
`periodoId` do período em apuramento:

| # | Partida | Valor |
|---|---|---|
| 1 | `D 44331`, `D 44332`, `D 44333` | saldo credor de cada uma no período |
| 2 | `C 44321`, `C 44322`, `C 44323` | saldo devedor de cada uma no período |
| 3 | `D 44342` (a favor do Estado) · `C 44341` (a favor do sujeito passivo) | saldo de cada uma |
| 4 | contrapartida de 1–3 | `4435 — IVA apuramento` |
| 5 | saldo de `4435` | credor → `C 4437 a pagar` · devedor → `D 4438 a recuperar` |

**Invariante: depois do apuramento, `4435` fica a zero, e `4433x`, `4432x` e `4434x` ficam a zero no
período.** É o que torna o balancete do mês seguinte legível — cada mês começa limpo e o que
transita está onde tem de estar, em `4437` ou `4438`.

### 3. O crédito reportável vive em `4438`, e volta ao apuramento seguinte por lançamento explícito

Quando o saldo é devedor, fica em `4438 — IVA a recuperar`, identificado pelo período de origem. O
apuramento do período seguinte **abre** transferindo esse saldo para `4435` (`D 4435 / C 4438`).

A alternativa era deixar o crédito em `4435` a transitar de mês para mês, o que poupa dois
movimentos. Recusada porque `4435` é uma conta de apuramento — se nunca zera, deixa de se poder
verificar que o apuramento do mês está certo, e passa a haver um número no balancete que ninguém
consegue explicar sem reconstituir a história toda. Com a transferência explícita, o saldo de `4438`
é, a cada momento, exactamente o campo «excesso a reportar» da declaração, e a antiguidade por
período de origem é uma consulta e não uma reconstrução. Isso passou a importar: acabou a regra dos
12 meses para pedir reembolso e o direito caduca aos 10 anos, logo o que interessa saber de um
crédito é **quando nasceu**.

### 4. Recusar é melhor do que devolver um número errado

O apuramento **recusa-se a correr**, com código de erro próprio, quando:

| Código | Quando | Porquê |
|---|---|---|
| `PRORATA_NAO_SUPORTADO` | o período tem operações à taxa reduzida de 5 %, isentas, ou fora do campo do imposto | a dedução é limitada ou nula e o cálculo do pro rata não está implementado. A conta `44343 — regularizações anuais por pro rata definitivo` fica por usar, e isso é a declaração honesta do que falta |
| `PERIODO_COM_RASCUNHOS` | há lançamentos em `RASCUNHO` no período | o apuramento lê o razão; um rascunho é um número que ainda pode mudar |
| `DOCUMENTO_SEM_LANCAMENTO` | há factura, NC ou ND emitida sem `lancamentoId` | o razão não tem tudo o que devia ter |
| `PERIODO_JA_APURADO` | já existe `ApuramentoIva` activo no período | corrige-se por estorno e nova versão (§7), nunca por recálculo por cima |

A alternativa — calcular assumindo dedução integral e avisar no ecrã — foi recusada sem hesitação.
O número sai do produto, entra numa declaração assinada pelo contribuinte e é entregue à AT. Um
aviso que se fecha não é defesa. O ADR-0032 §2 já fixou este critério para o bloqueio de escrita:
entre falhar em silêncio e falhar em voz alta, escolhe-se o segundo.

### 5. `SIMPLIFICADO` e `ISENTO` deixam de ser lidos

O apuramento **não lê `regimeIva`** para períodos a partir de `2026-01`: a lei acabou com os regimes
especiais e todos os sujeitos passivos estão em regime normal. Para períodos anteriores, o valor
histórico da coluna é respeitado, porque à data era verdade.

Os dois valores ficam no enum, sem serem escritos — mesmo padrão e mesmo custo aceite do ADR-0032
§1, que manteve `EXPIRADO`, `SUSPENSA` e `CANCELADA` no `EstadoAssinatura`. Não se faz migração de
dados a reclassificar tenants para `NORMAL`: reescrever silenciosamente a classificação fiscal
histórica de um cliente é pior do que ter dois valores mortos num enum. O ecrã de configuração
fiscal deixa de os oferecer, e um teste garante que nenhum caminho novo os escreve.

### 6. Autoliquidação de serviços a não residentes

A aquisição de serviços digitais a não residentes obriga o adquirente a autoliquidar. O lançamento
tem os dois lados no mesmo movimento — `C 44333` (operações especiais) e `D 44323` (outros bens e
serviços) — e entra no apuramento como qualquer outro saldo. O efeito no `4435` é nulo quando há
direito integral à dedução, e é precisamente isso que se quer ver reflectido.

A **declaração** própria destas operações (Modelo E, e o mapa mensal até ao dia 10) fica **fora do
âmbito**: exige o articulado e a regulamentação que ainda não foram lidos. O razão passa a suportá-la;
a submissão é trabalho futuro. Regista-se que isto atinge o próprio GestPro como adquirente — Stripe,
alojamento, ferramentas — e portanto cruza com o [ADR-0021](./ADR-0021-fiscalidade-subscricao-saas.md),
que já está marcado como «requer parecer externo».

### 7. Corrigir um apuramento: estorno e nova versão, ou regularização no período seguinte

`ApuramentoIva` tem `versao Int` e `estado { APURADO, ESTORNADO, DECLARADO }`.

- **Ainda não declarado** → estorna-se o lançamento (o mecanismo de estorno que já existe) e corre-se
  o apuramento de novo, `versao + 1`. Fica o rasto das duas versões.
- **Já declarado à AT** (`DECLARADO`, com data e referência da entrega) → **não se toca no período**.
  A correcção é uma regularização no período seguinte, nas contas `44341`/`44342`, que é o que a
  declaração prevê. Reabrir um período já declarado põe o razão em desacordo permanente com uma
  entrega feita ao Estado.

Marcar `DECLARADO` é um acto do utilizador com permissão `financas:iva:declarar`, data de entrega e
referência — e é o que tranca a reabertura do período no ADR-0033 §7.

### 8. Os mapas saem do apuramento, não de um recálculo

`/api/financas/iva/mapas/[periodo]` — mesma forma dos mapas de payroll que já existem
(`src/app/api/rh/payroll/mapas/inss/route.ts`, `…/irps/route.ts`), servida por `withApi` com
exportação CSV e PDF:

1. **Mapa de suporte à Declaração Periódica (Modelo A)** — base tributável e imposto por taxa, IVA
   dedutível por tipo de aquisição, regularizações, e o apuramento final.
2. **Mapa de clientes** — por documento, com NUIT, base e imposto liquidado.
3. **Mapa de fornecedores** — por documento, com NUIT, base e imposto dedutível.
4. **Antiguidade do crédito reportável** — saldo de `4438` por período de origem, que é o que
   sustenta um pedido de reembolso e o controlo da caducidade aos 10 anos.

Os quatro são gerados a partir das linhas gravadas no `ApuramentoIva`, **não recalculados na hora**.
Um mapa emitido em 2031 sobre o período de 2026 tem de devolver os mesmos números que a declaração
entregue, mesmo que o plano de contas tenha sido reorganizado entretanto.

### 9. O que torna isto auditável

- `ApuramentoIva` guarda as **linhas** (conta, base, imposto) e os totais tal como foram apurados,
  mais `lancamentoId`, `periodoId`, autor, data, `requestId` e `keycloakSub` (ADR-0015 §3). É
  *append-only*: corrige-se por versão nova.
- **Reprodutibilidade por construção**: o apuramento toma o bloqueio do período (ADR-0033 §5) e,
  ao terminar, o período fica `FECHADO`. Sendo o conjunto de partidas imutável a partir daí, o
  recálculo é determinístico — e o teste de regressão é exactamente isso: recalcular e comparar com
  o gravado.
- O lançamento de apuramento é um lançamento normal: numerado, com partidas equilibradas,
  imutável depois de `LANCADO`, corrigível só por estorno. Não há caminho privilegiado.
- `ApuramentoIva` entra na lista síncrona do ADR-0015.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Apuramento como lançamento contabilístico, calculado do razão** ✅ | Uma fonte de verdade; o balanço passa a mostrar `4437`/`4438`; o mapa e o razão não podem divergir | Exige o período trancado (ADR-0033) e o dedutível lançado (§1) |
| Apuramento só como relatório, sem lançamento | Entrega valor em dias, sem migração | `4433x` e `4432x` crescem para sempre; o balanço nunca mostra a dívida de IVA; e o relatório muda quando alguém estorna um documento antigo — incluindo depois de entregue a declaração |
| Calcular dos documentos (facturas e contas a pagar) em vez do razão | Mais directo; dá acesso natural ao NUIT e ao número do documento para os mapas | Duas fontes de verdade que divergem no primeiro estorno, na primeira nota de crédito e no primeiro lançamento manual de regularização. O razão é o que a AT examina |
| Apuramento trimestral ou anual | Menos corridas, menos lançamentos | A obrigação declarativa é mensal. Um apuramento que não corresponde a uma declaração não serve para nada |
| Pro rata calculado por aproximação quando há isentas | O apuramento nunca falha | Um número errado numa declaração assinada. O custo de recusar é um ecrã que explica o que falta; o de calcular mal é uma coima |

## Consequências

- **O caminho de compras passa a lançar contabilidade no reconhecimento da dívida**, e não só na
  liquidação. É a alteração de maior alcance desta decisão: toca em `conta-pagar.service.ts` e no
  recebimento de compras, e muda o que o balancete mostra para todos os tenants com histórico. Nos
  dados já existentes, o IVA dedutível do passado **não é reconstituível** — não há documento
  gravado com base e imposto. O primeiro apuramento de cada tenant tem de partir de um período
  declarado, com os saldos de abertura de IVA lançados à mão. Isto é escrito no ecrã, não escondido.
- **`ContaPagar` ganha seis colunas e um enum.** Nulas para o histórico, obrigatórias para os
  registos novos quando o fornecedor for sujeito passivo. Migração pelo procedimento não-interactivo
  do `CLAUDE.md`.
- **O apuramento fecha o período para IVA e é pré-condição do fecho contabilístico** (ADR-0033 §6).
  A ordem mensal passa a ser: conferir documentos → apurar IVA → fechar período → declarar.
- **Três permissões novas**: `financas:iva:apurar`, `financas:iva:declarar`, `financas:iva:mapas`.
  As duas primeiras são escrita e recusam em Leitura; a terceira declara `permiteEmLeitura: true` —
  exportar em Leitura é uma garantia do ADR-0032 e um mapa de IVA é dos documentos que o cliente
  mais precisa de levar consigo.
- **Os prazos legais são parametrização, não código.** Dia 10, dia 15 e último dia do mês vivem numa
  tabela versionada por vigência, como as tabelas de INSS e IRPS já fazem (skill `fiscalidade-mz`),
  porque a regulamentação da Lei 10/2025 ainda pode mexer neles dentro dos 180 dias.
- **O pro rata fica por fazer, e agora está escrito onde se vê.** Um tenant com operações à taxa
  reduzida ou isentas não consegue apurar. É uma limitação declarada, com código de erro próprio e
  conta do plano reservada, em vez de um cálculo errado.
- **A parte legal desta decisão é a menos sólida do documento.** Está apoiada em análises de
  consultoras, não no Boletim da República. Enquanto assim for, o ADR fica `Proposto` — e o mesmo
  aviso do ADR-0021 aplica-se: a forma contabilística decide-se aqui, a conformidade fiscal confirma-se
  com quem assina pareceres.

## Fontes

- [PwC — Moçambique: Alteração ao Código do Imposto sobre o Valor Acrescentado (Lei n.º 10/2025)](https://www.pwc.pt/pt/pwcinforfisco/flash/mocambique/mocambique-iva-alteracao-civa.html)
- [DLA Piper Africa / SAL & Caldeira — Changes to the Value Added Tax Code](https://www.dlapiperafrica.com/pt/mozambique/insights/2026/Changes-to-the-Value-Added-Tax-Code-)
- [KPMG TaxNewsFlash — Mozambique, 7 de Janeiro de 2026](https://kpmg.com/kpmg-us/content/dam/kpmg/taxnewsflash/pdf/2026/01/tnf-mozambique1-jan-7-2026.pdf)
- [RSM Moçambique — Pacote Fiscal 2026](https://www.rsm.global/mozambique/pt-pt/news/pacote-fiscal-2026-principais-alteracoes-fiscais-em-mocambique) e [Guia Fiscal 2026](https://www.rsm.global/mozambique/sites/default/files/media/documents/Mo%C3%A7ambique%20Guia%20Fiscal%202026.PT%20.pdf) (taxas, prazos, modelos A e E)
- [Autoridade Tributária de Moçambique — IVA](https://www.at.gov.mz/por/Processos-Fiscais/Imposto-sobre-o-Valor-Acrescentado-IVA) e [Calendário Fiscal](https://www.at.gov.mz/por/Informacao/Calendario-Fiscal)
- Plano de contas: [`prisma/seed/data/plano-contas-pgc.json`](../../apps/erp/prisma/seed/data/plano-contas-pgc.json), Decreto n.º 70/2009
