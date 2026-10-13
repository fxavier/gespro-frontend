# Requisitos: Contabilidade Orçamental e Gestão de Financiamentos

## Introdução

O objectivo é acompanhar **cada financiamento** desde a aprovação do orçamento até à execução da
despesa, ao pagamento e à prestação de contas, **sem sair da contabilidade geral**: a execução
orçamental não é um registo paralelo. É uma leitura dos mesmos lançamentos, completada pelas fases
que a contabilidade geral não regista (cabimento e compromisso).

Há dois segmentos-alvo e o motor é o mesmo para os dois (decisão de alinhamento, 2026-10-12):

- **ONGs e associações** financiadas por doadores. Aqui o orçamento é uma **obrigação contratual**
  perante o financiador, e uma despesa fora dele pode tornar-se inelegível e ter de ser devolvida.
- **Empresas com projectos**, financiados por contratos, subvenções ou fundos próprios. Aqui o
  orçamento é sobretudo um **controlo de gestão**.

O que distingue os dois é a parametrização do financiamento (natureza contabilística, regra de
bloqueio, relatórios). Não há código diferente por segmento.

### Estado actual (verificado no código, 2026-10-12, `main` em `7ecdfa4`)

| Peça | Onde | Estado |
|---|---|---|
| Centro de custo | `financas.prisma`, `CentroCusto` | Existe. `orcamento Decimal?` é um número solto sem leitor nem regra |
| Dimensão analítica do lançamento | `PartidaLancamento.centroCustoId` | **Uma só** dimensão por partida; não reparte |
| Orçamento de projecto | `pessoas-projetos.prisma`, `OrcamentoProjeto` → `CategoriaOrcamento` → `ItemOrcamento` | Versão + estado, mas `valorUtilizado` é um **contador mutável** sem ligação à contabilidade |
| Cadeia de compras | `RequisicaoCompra` → `PedidoCompra` → `RecebimentoCompra` → `ContaPagar` → `Pagamento` | Completa, todas com `centroCustoId` no cabeçalho; os itens não têm imputação |
| Salários | `FolhaPagamento`/`Payroll` → `registarLancamentoContabilistico` | Lança, mas sem imputação a projecto |
| Adiantamentos | `TipoLinhaPayroll.ADIANTAMENTO` | Só o adiantamento **salarial**; não há adiantamento de actividade/viagem |
| Multi-moeda | `currency String @default("MZN")` em compras; `ContaBancaria.moeda` | **Não existe**: nenhum câmbio, nenhuma taxa, e os lançamentos são todos em MZN |
| Tesouraria | ADR-0036 (projecção), ADR-0038 (reconciliação) | Ambas por tenant; nenhuma por financiamento |
| Auditoria e documentos | ADR-0015 (`AuditLog`), ADR-0017 (armazenamento) | Reutilizáveis |
| Períodos | ADR-0033 | Reutilizáveis: o fecho ganha pré-condições novas |

### Vocabulário (entra no `CONTEXT.md`, secção «Contabilidade orçamental»)

| Termo | É | **Não é** |
|---|---|---|
| Financiador | Entidade que concede fundos (doador, fundação, governo, cliente, a própria organização) | Um `Cliente` (pode estar ligado a um, por FK escalar opcional) |
| Financiamento | Acordo com um financiador: montante, moeda, período de elegibilidade, regras | Um projecto. Um projecto pode ter vários financiamentos e um financiamento pode cobrir vários projectos |
| Rubrica do financiador | Linha de orçamento **na nomenclatura do acordo** («Pessoal», «Viagens», «Equipamento»…) | Uma conta PGC. A ligação faz-se por mapeamento |
| Actividade | Unidade de trabalho orçamentada dentro de um projecto (código de quadro lógico, ex. `1.2.3`) | Uma `TarefaProjeto`, que é operacional e não tem orçamento |
| Linha de controlo | Grão onde se mede a disponibilidade: (financiamento, actividade, rubrica) | Um período: a distribuição temporal é informativa |
| Dotação | Valor orçamentado de uma linha de controlo **na versão vigente** | O valor aprovado inicialmente, quando houve revisões |
| Orçamento aprovado | A versão `INICIAL` aprovada | A versão vigente |
| Orçamento revisto | A versão vigente (última aprovada) | Uma proposta de revisão por aprovar |
| Cabimento | Reserva de dotação **antes** de haver obrigação com terceiros (requisição aprovada) | Uma despesa. Não lança na contabilidade geral |
| Compromisso orçamental | Obrigação assumida com terceiros (pedido de compra, contrato, adiantamento aprovado) | O `CompromissoTesouraria` do ADR-0036, que é previsão de caixa |
| Executado (liquidado) | Despesa reconhecida na contabilidade geral e imputada ao financiamento | Pago |
| Pago | Saída de fundos imputada ao financiamento | Executado |
| Disponível | Dotação − cabimento em aberto − compromisso em aberto − executado | Saldo bancário |
| Tranche | Recebimento de fundos de um financiamento, com a sua taxa de câmbio efectiva | Uma prestação prevista no acordo |
| Saldo do fundo | Fundos recebidos − pagamentos imputados − adiantamentos por justificar, por financiamento | O saldo da conta bancária (só coincidem com conta dedicada) |
| Imputação | Repartição de uma partida (ou linha de documento) por financiamento, actividade, rubrica e centro de custo, em percentagem | O `centroCustoId` legado |

### Divisão em épicos

| Épico | Âmbito | ADR | Depende de |
|---|---|---|---|
| **WS-1** | Financiamentos, rubricas, actividades, orçamento versionado | ADR-0043 | — |
| **WS-2** | Imputação analítica múltipla das partidas | ADR-0044 | WS-1 |
| **WS-3** | Ciclo da despesa: cabimento, compromisso, execução, pagamento e controlo de disponibilidade | ADR-0045 | WS-1, WS-2 |
| **WS-4** | Fundos recebidos, câmbio FIFO por tranche, tesouraria por financiamento | ADR-0046 | WS-2 |
| **WS-5** | Reconhecimento contabilístico dos financiamentos (rendimento diferido) | ADR-0047 | WS-3, WS-4 |
| **WS-6** | Prestação de contas, elegibilidade, evidência e trilho de auditoria | ADR-0048 | WS-3, WS-4 |

WS-1 e WS-2 tocam `financas.prisma` e `contabilidade.service.ts` e, por isso, **não correm em
paralelo**. WS-4 e o ramo de compras de WS-3 podem correr em paralelo depois de WS-2 integrado.

---

## Épico WS-1 — Financiamentos e orçamento

### Requisito 1 — Financiador

1. O sistema DEVE permitir criar, editar e desactivar `Financiador` (nome, tipo, país, NUIT opcional,
   contacto, `clienteId` opcional). A desactivação é soft delete.
2. Tipos: `BILATERAL`, `MULTILATERAL`, `FUNDACAO`, `GOVERNO`, `PRIVADO`, `PROPRIO`. O tipo `PROPRIO`
   representa fundos da própria organização e é o que permite às empresas orçamentar projectos sem
   financiador externo.

### Requisito 2 — Financiamento (acordo)

1. O sistema DEVE registar: código (único por tenant), financiador, referência do acordo, título,
   **moeda do acordo** (ISO 4217), montante aprovado na moeda do acordo, data de início, data de fim,
   **data de fim de elegibilidade** (≥ data de fim), natureza contabilística (ADR-0047), nível de
   controlo, regra de bloqueio, tolerância de realocação (%), elegibilidade do IVA não dedutível,
   conta bancária dedicada (opcional), projectos abrangidos e condições (texto + anexos).
2. Estados: `RASCUNHO → ACTIVO → EM_ENCERRAMENTO → ENCERRADO`, mais `SUSPENSO` (reversível a partir de
   `ACTIVO`). As transições seguem o mapa `TRANSICOES_FINANCIAMENTO` em `lib/state-machines.ts`.
3. QUANDO o financiamento está em `RASCUNHO`, ENTÃO não aceita cabimentos, compromissos, imputações
   nem recebimentos.
4. QUANDO o financiamento está `SUSPENSO` ou `EM_ENCERRAMENTO`, ENTÃO recusa cabimentos e
   compromissos novos (`FINANCIAMENTO_SUSPENSO` / `FINANCIAMENTO_EM_ENCERRAMENTO`), mas aceita
   execuções, justificações e pagamentos de compromissos já assumidos. Para efeitos de reconhecimento
   (Requisito 19) e de relatório, «financiamento em curso» = `ACTIVO`, `SUSPENSO` ou `EM_ENCERRAMENTO`.
5. QUANDO o financiamento está `ENCERRADO`, ENTÃO recusa qualquer escrita nova, imputações incluídas
   (`FINANCIAMENTO_ENCERRADO`). A reabertura é um acto auditado com motivo.
6. A passagem a `ACTIVO` exige um orçamento `INICIAL` aprovado.

### Requisito 3 — Rubricas, actividades e mapeamento

1. Cada financiamento DEVE ter a sua lista de **rubricas do financiador** (código, nome, tipo `DIRECTA`
   ou `INDIRECTA`, ordem). O sistema DEVE oferecer modelos reutilizáveis de listas de rubricas por
   tenant, que se copiam para o financiamento. Copiam-se e não se referenciam: a alteração de um modelo
   não altera os acordos já assinados.
2. O sistema DEVE permitir definir **actividades** por projecto (código hierárquico, nome, projecto),
   reutilizáveis por vários financiamentos do mesmo projecto.
3. Cada financiamento DEVE ter um **mapeamento conta PGC → rubrica**, versionado como o
   `VersaoMapeamentoFluxo` (ADR-0037). Uma conta folha mapeia-se, no máximo, para uma rubrica por
   financiamento.
4. QUANDO uma partida é imputada a um financiamento e a sua conta não tem rubrica nesse mapeamento,
   ENTÃO a imputação é recusada (`CONTA_SEM_RUBRICA`). Nunca vai para uma rubrica «Outros» por
   omissão.
5. Alterar o mapeamento depois de um relatório submetido DEVE criar uma versão nova. Os relatórios
   submetidos continuam a ler a versão com que foram gerados.

### Requisito 4 — Orçamento versionado

1. O orçamento de um financiamento DEVE ser uma sequência de **versões completas** (`INICIAL`,
   `REVISAO_1`, …), cada uma com linhas (actividade, rubrica, centro de custo opcional, mês,
   valor na moeda do acordo).
2. Estados da versão: `RASCUNHO → SUBMETIDO → APROVADO | REJEITADO`. Uma versão `APROVADO` é imutável.
   Quando outra a substitui, passa a `SUBSTITUIDO`, e é a única escrita permitida sobre ela.
3. Há **no máximo uma** versão vigente (`APROVADO`) por financiamento, garantida por índice único
   parcial.
4. INVARIANTE `O1`: Σ linhas da versão vigente ≤ montante aprovado do financiamento (moeda do acordo).
   Um aumento de montante é uma adenda ao acordo e é registada antes da revisão.
5. INVARIANTE `O2`: uma revisão NÃO PODE reduzir a dotação de uma linha de controlo para baixo do seu
   consumo (cabimento em aberto + compromisso em aberto + executado). Recusa com
   `DOTACAO_ABAIXO_DO_CONSUMO` e lista **todas** as linhas em falta.
6. Quem submete uma versão NÃO PODE aprová-la (segregação de funções, `SEGREGACAO_FUNCOES`).
7. A aprovação DEVE exigir motivo e permitir anexar o documento de aprovação do financiador.
8. O sistema DEVE permitir importar e exportar a versão em XLSX (modelo fornecido pelo sistema).

### Requisito 5 — Substituição do orçamento de projecto actual

1. `OrcamentoProjeto`, `CategoriaOrcamento` e `ItemOrcamento` DEVEM ser migrados para o novo domínio e
   removidos. Cada projecto com orçamento ganha um financiamento `PROPRIO`, e as suas categorias
   passam a rubricas desse financiamento.
2. `Projeto.orcamentoPlanejado` deixa de ser escrito e passa a leitura derivada (Σ dotações vigentes
   dos financiamentos do projecto).
3. `valorUtilizado` NÃO é migrado: a execução passa a ser derivada (WS-3). Não há produção (ADR-0026),
   pelo que a migração só afecta seeds e o tenant `demo`.
4. A rota `/projetos/orcamento` DEVE redireccionar para a vista orçamental do projecto.

---

## Épico WS-2 — Imputação analítica

### Requisito 6 — Imputação múltipla por partida

1. Cada `PartidaLancamento` PODE ter N **imputações** (financiamento, actividade, rubrica, projecto,
   centro de custo, percentagem, valor).
2. INVARIANTE `A1`: Σ percentagens = 1,000000 exacto (fracção `Decimal(9,6)`, mostrada como 100 %); Σ valores = valor da partida ao cêntimo. O resto
   do arredondamento vai para a imputação de maior percentagem (maior resto). O resultado tem de ser
   determinístico.
3. A rubrica NÃO é escolhida pelo utilizador: deriva do mapeamento do financiamento (Requisito 3.3).
   Projecto e actividade têm de ser coerentes (a actividade pertence ao projecto).
4. As imputações nascem e morrem com o lançamento: são escritas **só** por `criarLancamento` /
   `registarLancamentoContabilistico` (e pela edição de rascunho), na mesma transacção. Enquanto o
   lançamento é `RASCUNHO` são editáveis e **não** geram movimentos orçamentais. Ficam imutáveis
   a partir de `LANCADO`. O
   `gate-periodo` passa a cobrir `ImputacaoPartida`.
5. O estorno de um lançamento DEVE gerar as imputações simétricas.
6. QUANDO o tenant tem o módulo orçamental activo e a conta está marcada `exigeImputacao`, ENTÃO uma
   partida sem imputação é recusada (`IMPUTACAO_OBRIGATORIA`). As contas de gasto (classe 6) vêm
   marcadas por omissão.
7. `PartidaLancamento.centroCustoId` DEVE ser migrado para uma imputação a 100 %. A partir daí deixa
   de ser escrito, e todos os leitores (DRE por centro de custo incluída) passam a ler as imputações.

### Requisito 7 — Chaves de repartição

1. O sistema DEVE permitir **chaves de repartição** nomeadas (lista de imputações com percentagens e
   vigência), aplicáveis a uma partida ou a uma linha de documento.
2. Chaves de pessoal: por colaborador, com vigência (`desde`, `ate`), a repartir o custo salarial
   por financiamento/actividade. Uma alteração cria um registo novo e nunca reescreve o anterior.
3. DEVERIA (fase 2): derivar a chave de pessoal do mês a partir de `Timesheet` aprovados. Isto exige
   `atividadeId` no timesheet.

### Requisito 8 — Contabilidade analítica (leitura)

1. O sistema DEVE produzir mapas de gastos e rendimentos por programa, projecto, actividade,
   financiamento e centro de custo, com filtro de período, a partir das imputações e com o
   `FILTRO_LANCAMENTO_MAPA`.
2. INVARIANTE `A2`: para qualquer conta e período, Σ imputações = Σ das partidas que têm
   imputações (partidas imputadas), com `FILTRO_LANCAMENTO_MAPA`. As partidas sem imputação aparecem
   no mapa numa linha explícita «não imputado»: um mapa
   analítico nunca soma mais nem menos do que o razão.

---

## Épico WS-3 — Ciclo da despesa e controlo de disponibilidade

### Requisito 9 — Livro de movimentos orçamentais

1. Cada mudança de fase DEVE gravar um `MovimentoOrcamental` **append-only** (linha de controlo,
   fase, valor em MZN, valor na moeda do acordo, taxa, origem polimórfica, lançamento quando houver,
   data, utilizador). Anulações e libertações são movimentos de sinal contrário e nunca `UPDATE`.
2. Fases: `CABIMENTO`, `COMPROMISSO`, `EXECUCAO`, `PAGAMENTO`, `ADIANTAMENTO` (pago e por justificar).
   Na cadeia cabimento → compromisso → execução, a passagem grava dois movimentos na mesma transacção:
   consome a fase anterior e cria a seguinte. O `PAGAMENTO` **não** consome a execução: é uma medida
   paralela.
3. Os saldos por fase são **sempre derivados** por soma. É proibido guardar contadores
   (`valorUtilizado`, `saldoDisponivel`).
4. INVARIANTE `C1` (ligação à contabilidade geral): por financiamento e `periodoId` **do lançamento**,
   Σ movimentos `EXECUCAO` (MZN) = Σ imputações de partidas `LANCADO`/`ESTORNADO` nesse financiamento,
   nas contas de gasto e de investimento, com débito positivo e crédito negativo. A `EXECUCAO` é escrita
   **só** pelo serviço de contabilidade, na transacção que põe o lançamento em `LANCADO`.
5. INVARIANTE `C2`: por linha de controlo, na moeda do acordo, cabimento em aberto ≥ 0, compromisso
   em aberto ≥ 0 e pago ≤ executado. O adiantamento por justificar é medido à parte e não entra no
   pago.

### Requisito 10 — Controlo de disponibilidade

1. Antes de gravar um cabimento, um compromisso ou uma execução **sem compromisso prévio** (ou acima
   do compromisso), o sistema DEVE verificar a disponibilidade **dentro da mesma transacção**, com o
   financiamento e as linhas de controlo trancados (`SELECT … FOR UPDATE`) pela ordem global do
   ADR-0045 §2. Dois pedidos concorrentes não podem consumir a mesma dotação, nem na mesma linha nem
   no total do financiamento.
2. Com `regraBloqueio = BLOQUEIA_COM_TOLERANCIA` (omissão; alinhamento: «bloqueia, com tolerância»):
   - linha: consumo novo ≤ dotação × (1 + tolerância) − consumo existente;
   - financiamento: Σ consumos ≤ Σ dotações. A tolerância **realoca** entre linhas, mas nunca aumenta
     o total.
3. QUANDO a regra falha, ENTÃO → `BusinessRuleError('ORCAMENTO_INSUFICIENTE')` com dotação, consumo,
   disponível, tolerância e défice de **todas** as linhas em falta. Não há permissão de «forçar»: o
   caminho é a revisão orçamental. Com `regraBloqueio = ALERTA`, a operação grava e devolve `avisos[]`,
   que ficam no trilho.
4. A disponibilidade é medida **na moeda do acordo**. A conversão segue o ADR-0046.
5. IVA: a execução é o que o razão põe em contas de gasto e de investimento. O IVA dedutível
   (contas 443x) nunca é execução. O IVA não dedutível, que o razão já leva ao gasto, é execução só
   se `ivaNaoDedutivelElegivel = true`; caso contrário, a parte de IVA da partida é imputada a fundos
   próprios. Cabimentos e compromissos estimam pela mesma regra.
6. Datas: cabimentos e compromissos só podem ser assumidos dentro de [início, fim]. A data **nunca**
   bloqueia uma execução: fora de [início, fim de elegibilidade] a execução fica inelegível
   (Requisito 20). Bloqueiam a execução apenas: disponibilidade (sem compromisso suficiente),
   financiamento `RASCUNHO`/`ENCERRADO`, taxa de câmbio em falta (Requisito 17.2) e imputação de
   investimento a subsídio de exploração (ADR-0047).

### Requisito 11 — Origem: compras

1. Requisição aprovada → `CABIMENTO` por item, com a imputação do item (ou do cabeçalho, se o item não
   tiver). Requisição rejeitada ou cancelada → libertação.
2. Pedido de compra aprovado → `COMPROMISSO`, que consome o cabimento da requisição de origem até ao
   valor cabimentado. O excedente é verificado como consumo novo. Pedido sem requisição → compromisso
   directo, verificado.
3. Conta a pagar registada → o lançamento (D gasto / C 421) gera `EXECUCAO` pelas imputações e consome
   o compromisso do pedido de origem. O excedente da factura sobre o compromisso é verificado como
   consumo novo (Requisito 10). Cancelamento do pedido → libertação do compromisso remanescente.
4. Pagamento → `PAGAMENTO` = valor pago × (execução da conta a pagar ÷ valor original), repartido pelas
   imputações. O IVA dedutível pago não é pagamento orçamental. Na moeda do acordo, usa a mesma
   proporção sobre o `valorMoeda` da execução.
5. Os itens de requisição e de pedido DEVEM ganhar imputação própria (`ImputacaoDocumento`). O
   `centroCustoId` do cabeçalho passa a valor por omissão das imputações.

### Requisito 12 — Origem: salários

1. O processamento da folha DEVE imputar o custo de cada colaborador pela chave de pessoal vigente no
   mês de referência. Na falta de chave, o custo é imputado ao centro de custo do colaborador, sem
   financiamento.
2. O processamento verifica a disponibilidade como execução sem compromisso. Com `BLOQUEIA_COM_TOLERANCIA`,
   se falhar, o processamento da folha inteira é recusado e é devolvida a lista de **todos** os
   colaboradores e linhas em défice. Com `ALERTA`, a folha processa e os avisos ficam no trilho.
3. DEVERIA: compromisso anual de pessoal (contrato × meses) para reservar a dotação de salários no
   início do ano.

### Requisito 13 — Origem: adiantamentos de actividade

1. Entidade nova `AdiantamentoActividade` (beneficiário colaborador, finalidade, imputação, valor,
   datas, prazo de justificação), com o ciclo `RASCUNHO → APROVADO → PAGO → JUSTIFICADO → FECHADO`
   (ou `CANCELADO`).
2. Aprovado → `COMPROMISSO +`. Pago → lançamento D adiantamentos ao pessoal / C banco ou caixa. O
   adiantamento não é gasto, e o orçamental regista-o como `ADIANTAMENTO +`, sem `EXECUCAO` nem
   `PAGAMENTO`.
3. Justificação → linhas de despesa com documento de suporte obrigatório, lançamento D gastos (com
   imputações) / C adiantamentos → `EXECUCAO +`, `COMPROMISSO −`, `ADIANTAMENTO −` e `PAGAMENTO +`
   pelo valor justificado. O remanescente devolvido (D caixa/banco / C adiantamentos) grava
   `ADIANTAMENTO −` e `COMPROMISSO −`. O reembolso de excesso ao colaborador é execução sem
   compromisso. Fechar o adiantamento liberta o compromisso remanescente.
4. QUANDO o prazo de justificação passa, ENTÃO o adiantamento aparece como vencido no painel do
   financiamento e é gerada uma notificação ao responsável financeiro. Um colaborador com
   adiantamentos vencidos NÃO PODE receber um adiantamento novo (`ADIANTAMENTO_VENCIDO_PENDENTE`).

### Requisito 14 — Origem: lançamentos manuais

1. Um lançamento manual numa conta com `exigeImputacao` exige imputação (Requisito 6.6). A execução
   que gera é verificada como execução sem compromisso.
2. O formulário de lançamento DEVE mostrar o disponível da linha de controlo **antes** de submeter.

### Requisito 15 — Execução orçamental (leitura)

1. Para cada financiamento, por linha de controlo e agregado por rubrica, actividade e projecto: **aprovado,
   revisto, cabimentado, comprometido, executado, pago, disponível, % de execução, variância**, na
   moeda do acordo e em MZN, com filtro até uma data.
2. A distribuição mensal da versão vigente DEVE ser comparável com o executado mensal (curva
   planeado × real).
3. Cada valor DEVE permitir descer até aos movimentos e documentos que o compõem.
4. Exportação CSV/XLSX/PDF pelos mecanismos existentes (`withApi`, `lib/reporting`).

---

## Épico WS-4 — Fundos, câmbio e tesouraria

### Requisito 16 — Recebimento de fundos (tranches)

1. O sistema DEVE registar recebimentos por financiamento: data, valor na moeda do acordo, conta
   bancária, valor creditado em MZN e documento (aviso bancário). Daí resulta a **taxa efectiva** =
   MZN / moeda do acordo, com 6 casas decimais.
2. O recebimento DEVE gerar o lançamento definido pelo ADR-0047 (D banco / C rendimento diferido ou
   equivalente) e guardar o `lancamentoId`.
3. QUANDO o financiamento tem conta dedicada, ENTÃO recebimentos, pagamentos e adiantamentos imputados
   a ele NÃO PODEM movimentar outra conta (`CONTA_DEDICADA_OBRIGATORIA`).

### Requisito 17 — Conversão FIFO por tranche (alinhamento: «taxa da tranche, FIFO»)

1. Cada `EXECUCAO` em MZN consome as tranches por ordem de data de recebimento e é convertida à taxa
   efectiva de cada uma. Fica gravada a alocação execução × tranche (`AlocacaoTranche`).
2. QUANDO não há saldo de tranche (pré-financiamento), ENTÃO a execução é convertida à taxa de
   referência do dia (`TaxaCambio` do tenant) e marcada `PROVISORIA`. A tranche seguinte realoca as
   provisórias por ordem FIFO, anulando a alocação provisória e criando a definitiva, e grava um
   movimento `EXECUCAO` correctivo (0 MZN, ± moeda do acordo). Se o período já foi reportado, a
   diferença aparece como ajustamento no relatório seguinte.
3. O estorno de uma execução DEVE anular exactamente as suas próprias alocações. Nunca re-corre o FIFO
   sobre o passado.
4. INVARIANTE `F1`: por tranche, Σ alocações (MZN) ≤ valor da tranche (MZN).
5. INVARIANTE `F2`: o valor de uma execução na moeda do acordo é reprodutível, a partir das alocações
   gravadas, independentemente da ordem de leitura.
6. Cabimentos e compromissos são convertidos à taxa da próxima tranche com saldo (ou à taxa de
   referência) e reavaliados na execução. A diferença ajusta a libertação do compromisso.

### Requisito 18 — Tesouraria por financiamento

1. **Saldo do fundo** por financiamento = recebido − `PAGAMENTO` − `ADIANTAMENTO` por justificar
   (MZN e moeda do acordo), sempre derivado. O adiantamento entra na moeda do acordo à taxa com que
   foi comprometido.
2. Com conta dedicada, o painel DEVE reconciliar o saldo do fundo com o saldo de razão da conta e
   mostrar a diferença (juros, comissões, câmbio). Sem conta dedicada, o saldo é analítico e o painel
   di-lo explicitamente.
3. A projecção de tesouraria (ADR-0036) DEVE poder ser filtrada por financiamento, com os
   compromissos orçamentais em aberto como saídas previstas e as tranches previstas no acordo como
   entradas.
4. O sistema DEVE suportar contas bancárias em moeda estrangeira: partidas com `moeda`, `valorMoeda` e
   `taxa`, e revalorização cambial no fecho do período (ADR-0046 §5). A revalorização torna-se
   pré-condição de `fecharPeriodo`.

---

## Épico WS-5 — Reconhecimento contabilístico

### Requisito 19 — Natureza contabilística do financiamento

1. `SUBSIDIO_EXPLORACAO`: o recebimento vai para rendimento diferido (passivo). No fecho de cada
   período, o rendimento reconhecido no período é **execução elegível acumulada − rendimento
   reconhecido acumulado**. Pode ser negativo, quando uma execução é marcada inelegível depois de
   reconhecida. A execução acima do recebido gera um subsídio a receber (activo).
2. `CONTRATO_RECEITA`: a receita vem da facturação normal ao financiador (`Cliente`), e o orçamento é
   apenas controlo de gestão. Não há lançamento de reconhecimento.
3. `FUNDOS_PROPRIOS`: não há receita associada. O orçamento é apenas controlo de gestão.
4. O lançamento de reconhecimento DEVE ser gerado por `registarLancamentoContabilistico`, com origem
   própria, uma vez por financiamento e período. Tem de ser idempotente e de ser estornado e
   regenerado quando o período reabre.
5. Para financiamentos `SUBSIDIO_EXPLORACAO` em curso (Requisito 2.4), o reconhecimento do período é pré-condição de
   `fecharPeriodo` (novo `impedimento`).
6. As contas exactas DEVEM ser confirmadas contra `prisma/seed/data/plano-contas-pgc.json` e
   configuradas por tenant (`ContaNaturezaFinanciamento`), com omissão no `tenant-bootstrap` **e** na
   migração. O mesmo padrão vale para as contas de adiantamentos ao pessoal e de diferenças de câmbio.

---

## Épico WS-6 — Prestação de contas e auditoria

### Requisito 20 — Elegibilidade

1. Uma execução é **elegível** quando: a data do documento está em [início, fim de elegibilidade], a
   rubrica pertence ao orçamento vigente, os documentos de suporte obrigatórios da fase estão
   anexados e não foi marcada inelegível.
2. A marcação de inelegibilidade é manual, com motivo, auditada e reversível. A despesa inelegível não
   sai do razão: sai do relatório e do reconhecimento de rendimento e entra no mapa de inelegíveis.
   A reclassificação para fundos próprios é um acto **manual** (estorno e relançamento com imputação
   nova).

### Requisito 21 — Relatório ao financiador (alinhamento: «motor genérico + mapeamento»)

1. Para um financiamento e um intervalo de períodos, o sistema DEVE gerar: orçamento vs. real por
   rubrica e actividade (aprovado, revisto, executado no período, executado acumulado, variância, %),
   fundos recebidos, saldo do fundo e lista de despesas (data, documento, fornecedor, rubrica, valor
   MZN, taxa, valor na moeda do acordo).
2. A submissão DEVE congelar o relatório como **snapshot imutável**: linhas gravadas, versão do
   mapeamento, versão do orçamento, hash SHA-256 do conteúdo e ficheiros XLSX/PDF no armazenamento
   (ADR-0017). Uma correcção gera uma nova versão do relatório, e a anterior nunca é reescrita.
3. Movimentos com data em períodos já reportados aparecem no relatório seguinte como «ajustamentos a
   períodos anteriores». Nunca alteram o relatório submetido.
4. Estados: `RASCUNHO → SUBMETIDO → ACEITE | DEVOLVIDO`.
5. Modelos oficiais por financiador (UE, USAID, Global Fund, etc.) ficam **fora** do MVP e entram
   como formatadores sobre o mesmo snapshot.

### Requisito 22 — Documentos de suporte

1. Todas as entidades do domínio (financiamento, versão de orçamento, requisição, pedido, conta a
   pagar, pagamento, adiantamento, justificação, recebimento, relatório) DEVEM aceitar anexos, guardados
   no armazenamento do ADR-0017 com o SHA-256 gravado.
2. Por financiamento, o sistema DEVE permitir configurar que tipos de documento são obrigatórios em
   cada fase (ex.: factura e comprovativo de pagamento na execução). Uma fase sem os obrigatórios fica
   **inelegível pendente** e não fica bloqueada: o bloqueio no terreno atrasa pagamentos legítimos.
3. Um anexo não se apaga: é retirado com motivo e o original fica disponível para auditoria.

### Requisito 23 — Trilho de auditoria

1. Todos os modelos novos com valores ou estados entram em `AUDIT_MODELS` (ADR-0015). As escritas têm
   de ser singulares (a `audit-extension` não vê `createMany`/`upsert`). Excepção: os modelos
   append-only, que são eles próprios trilho e podem usar `createMany`: `ImputacaoPartida`,
   `MovimentoOrcamental`, `AlocacaoTranche`, `ElegibilidadeExecucao` e as linhas de relatório.
2. Aprovações (orçamento, revisão, cabimento, compromisso, adiantamento) DEVEM guardar quem, quando,
   o estado anterior e o motivo.
3. O sistema DEVE oferecer, por financiamento, a vista cronológica de tudo o que lhe aconteceu
   (alterações, aprovações, revisões, relatórios).

---

## Requisitos não funcionais

1. **Multi-tenancy**: `tenantId` em todos os modelos novos. As FKs cross-domínio são escalares. As
   escritas dentro de `prismaBase.$transaction` incluem `tenantId`.
2. **Dinheiro**: `Decimal(18,2)` para valores, `Decimal(18,6)` para taxas de câmbio e
   `Decimal(9,6)` para percentagens. Nunca `Float`.
3. **Leitura (ADR-0032)**: todas as actions de leitura declaram `permiteEmLeitura: true`. A
   exportação de relatórios nunca é travada.
4. **Permissões** novas em `prisma/seed/rbac.ts`: `orcamental:ver`, `orcamental:financiamento:gerir`,
   `orcamental:orcamento:elaborar`, `orcamental:orcamento:aprovar`, `orcamental:cabimentar`,
   `orcamental:adiantamento:aprovar`, `orcamental:relatorio:submeter`,
   `orcamental:elegibilidade:marcar`. Cada uma é ligada a papéis no seed.
5. **Desempenho (ADR-0018)**: a verificação de disponibilidade cabe em p95 < 50 ms com 10⁵
   movimentos por financiamento, com índice `(tenantId, linhaControloId, fase)`. Se não couber, a
   resposta é um saldo materializado **com teste de equivalência contra a soma**, e não um contador
   solto.
6. **UI**: sem modais, molde `compras/requisicoes`, `StatusBadge` com os estados novos registados,
   `ComboboxRemoto` para financiamentos, actividades e rubricas.
7. **Testes**: invariantes `O1`, `O2`, `A1`, `A2`, `C1`, `C2`, `F1`, `F2` e `F3` como testes de propriedade
   (skill `tdd`). Concorrência do Requisito 10.1 em teste de integração (Testcontainers) com dois
   pedidos paralelos sobre a mesma linha.

## Fora de âmbito (MVP)

- Contabilidade orçamental pública (SISTAFE/CGE, classificador económico do Estado).
- Modelos oficiais de relatório por financiador (Requisito 21.5).
- Subsídios ao investimento (activos fixos financiados) com reconhecimento pela amortização. Fica
  como questão em aberto.
- Imputação por timesheet (Requisito 7.3, fase 2).
- Integração automática de câmbios do Banco de Moçambique.

## Questões em aberto

1. **Custos indirectos (overhead)**: percentagem fixa sobre custos directos, calculada no período
   (lançamento de imputação interna), ou só rubrica orçamentada e executada como as outras?
2. **Contrapartida (co-financiamento exigido)**: registar a contribuição própria (em dinheiro e em
   espécie) como financiamento `PROPRIO` ligado ao principal, com relatório conjunto?
3. **Activos fixos financiados**: tratamento contabilístico e orçamental (Requisito 19 só cobre a
   exploração).
4. **Juros e ganhos cambiais sobre fundos**: pertencem ao financiador (a reportar e eventualmente a
   devolver) ou à organização? Parâmetro por acordo?
5. **Gating comercial (ADR-0027)**: o módulo entra em que plano? É um add-on?
6. **Plano de contas das ONGs**: o PGC-NIRF serve as associações sem fins lucrativos clientes, ou é
   preciso suportar um plano para entidades sem fins lucrativos? Requer confirmação legal.
