# ADR-0035 — Encerramento do exercício contabilístico

- **Estado**: Proposto
- **Data**: 2026-09-18
- **Contexto**: Spec 02 (Contabilidade) · Spec 20 (Prontidão para Produção)
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (exercício, períodos, trancamento), [ADR-0034](./ADR-0034-apuramento-iva.md) (o IVA apurado é pré-condição de cada período)
- **Relacionados**: [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (trilho), [ADR-0017](./ADR-0017-ciclo-vida-armazenamento.md) (onde ficam os mapas arquivados)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `api-conventions`, `fiscalidade-mz`

## Contexto

O GestPro nunca encerrou um exercício, e a razão pela qual ninguém deu por isso está no código: a
DRE é calculada ao vivo a partir das classes 6 e 7 (`contabilidade.service.ts:732-780`). Enquanto se
olhar só para a DRE do ano corrente, o sistema parece completo. O que não existe é o resto — o
resultado nunca chega ao balanço, a classe 8 nunca é escrita, as classes 6 e 7 nunca saldam, e o
exercício seguinte começa sem saldos de abertura porque não há de onde os transportar.

Três factos verificados que condicionam a decisão:

**1. Hoje o encerramento é literalmente impossível.** As contas de resultados do plano —
`81` resultados operacionais, `82` financeiros, `83` correntes, `88` resultado líquido do período, e
`59` resultados transitados — estão todas com `aceitaLancamento: false` no
`plano-contas-pgc.json`, e **nenhuma delas tem filhas** (verificado: zero descendentes para cada uma
das cinco). O `resolverContaPorCodigo` recusa-as com `CONTA_NAO_ACEITA_LANCAMENTO`
(`contabilidade.service.ts:78-95`). Não são contas agregadoras com analíticas por baixo — são folhas
com a bandeira por levantar.

**2. Os diários `AB` e `EN` existem em todos os tenants** (`tenant-bootstrap.ts:121-122`), com os
tipos `ABERTURA` e `ENCERRAMENTO` no enum desde a migração inicial, e nunca foram escritos.

**3. O calendário fiscal não permite um exercício hermético a 31 de Dezembro.** A declaração de
rendimentos (Modelo 22) entrega-se até 31 de Maio; a declaração de informação contabilística e
fiscal (Modelo 20) até ao último dia de Junho. Os ajustamentos do revisor chegam em Abril. Um fecho
irreversível a 31 de Dezembro obriga a fraudar a data dos ajustamentos ou a lançá-los no ano
seguinte com a data errada — as duas coisas que o encerramento existe para impedir.

## Decisão

**O encerramento é uma sequência de lançamentos no diário `EN`, com data no último dia do exercício
e num período 13 próprio, em duas fases — provisória e definitiva — com fotografia do balancete
guardada, e a aplicação do resultado tratada como acto separado do exercício seguinte.**

### 1. Duas fases, porque o calendário fiscal tem duas

- **`ENCERRADO_PROVISORIO`** — as contas estão saldadas e as demonstrações financeiras emitidas. O
  exercício não aceita escrita corrente, mas aceita **reabertura controlada** para ajustamentos de
  revisão, com permissão própria, motivo escrito e registo. É o estado normal entre Janeiro e a
  entrega da Modelo 22.
- **`ENCERRADO`** — definitivo. Nenhuma reabertura, em nenhuma circunstância, por ninguém. A
  transição é um acto do utilizador com `financas:exercicio:encerrar-definitivo`, tipicamente depois
  da entrega da Modelo 22 e da aprovação de contas.

Uma só fase foi a primeira hipótese e não sobrevive ao contacto com o calendário: ou é irreversível
e obriga toda a gente a datar mal os ajustamentos, ou é reversível para sempre e então não é fecho
nenhum. O custo aceite é um estado a mais na máquina e a pergunta «qual é o meu exercício de 2026?»
passar a ter duas respostas válidas em momentos diferentes — o que é verdade na contabilidade e é
melhor modelado do que escondido.

### 2. O período 13 separa o encerramento das operações de Dezembro

Os lançamentos de encerramento têm data de 31 de Dezembro mas não são movimento de Dezembro. Vão
para o `PeriodoContabil` com `ordem = 13` e `codigo = "2026-13"` (ADR-0033 §1).

Sem isto, o balancete de Dezembro inclui o saldar de todas as contas de gastos e rendimentos do ano,
e deixa de se poder ler o mês. Com isto, o balancete de Dezembro é Dezembro, o de `2026-13` é o
encerramento, e o acumulado do ano é a soma dos treze.

Custa zero em validação: `"2026-13"` passa no regex `^\d{4}-\d{2}$` de
`src/lib/validations/contabilidade.ts:237`, e nada no produto converte `periodoFiscal` de volta para
um mês — é produzido por `periodoFiscalDe` e exibido como etiqueta.

### 3. As cinco contas de resultados passam a aceitar lançamento

`81`, `82`, `83`, `88` e `59` passam a `aceitaLancamento: true` no `plano-contas-pgc.json`, com
migração para os tenants existentes.

Criar analíticas inventadas por baixo delas (`811`, `881`, `591`…) era a alternativa que respeitava
à letra o comentário do schema — «só contas folha aceitam lançamentos». Recusada por dois motivos.
Primeiro, **elas já são folhas**: não têm descendentes no plano. A regra não está a ser violada; a
bandeira é que está por levantar. Segundo, acrescentar códigos que o Decreto n.º 70/2009 não publica
faz o balancete do GestPro divergir do plano oficial no sítio onde um inspector olha primeiro.

Fica um teste que fixa o facto: as contas de encerramento aceitam lançamento e não têm filhas. Se
alguém acrescentar analíticas por baixo de `88` um dia, o teste falha e obriga a decidir de novo em
vez de descobrir no fecho de Dezembro.

### 4. A sequência: três lançamentos, não um

Todos no diário `EN`, data `dataFim` do exercício, período 13, criados numa transacção única:

| # | Lançamento | Partidas |
|---|---|---|
| 1 | **Apuramento dos resultados** | Saldar todas as contas com movimento da classe 6 (crédito) e da classe 7 (débito) por contrapartida de `81`, `82` e `83`, conforme a natureza operacional, financeira ou corrente |
| 2 | **Estimativa do imposto** | `D 851 — Imposto corrente / C 4411 — Estimativa de imposto` |
| 3 | **Resultado líquido** | Saldar `83` e `85` por contrapartida de `88 — Resultado líquido do período` |

Três lançamentos e não um só, porque são três actos com origens diferentes: o primeiro é mecânico e
derivável do razão; o segundo depende de um cálculo fiscal que alguém introduz e pode corrigir
sozinho; o terceiro fecha. Cada um é estornável isoladamente — corrigir a estimativa do imposto não
obriga a desfazer o apuramento dos resultados.

O custo da transacção é limitado pelo **número de contas com movimento** nas classes 6 e 7, não pelo
número de transacções do ano: a leitura é um `groupBy` por conta, como o `gerarBalancete` já faz
(`contabilidade.service.ts:660-670`), e o resultado são três lançamentos com dezenas de partidas —
não dezenas de milhares de lançamentos.

### 5. A aplicação do resultado **não** faz parte do encerramento

O transporte de `88` para `59 — Resultados transitados` é um lançamento do **exercício seguinte**,
com a data da deliberação que aprova as contas, permissão `financas:exercicio:aplicar-resultado` e
referência à acta. Até essa deliberação, o resultado do ano é o que o balanço diz que é: resultado
líquido do período.

Incluí-lo no encerramento poupava um passo e antecipava uma decisão dos sócios que o produto não
tem como conhecer — e tornaria impossível representar a distribuição de dividendos, que é a razão
pela qual `89 — Dividendos antecipados` existe no plano. É a parte deste ADR mais fácil de
implementar mal por instinto, e por isso está escrita.

### 6. A abertura do exercício seguinte lê a fotografia, não o razão

O lançamento de abertura (diário `AB`, data `dataInicio`, período 1) debita as contas de activo e
credita passivo e capital próprio, a partir dos saldos de fecho das classes 1 a 5. É gerado pela
**abertura do exercício seguinte**, não pelo encerramento, e exige que o anterior esteja pelo menos
em `ENCERRADO_PROVISORIO`.

Se o exercício anterior for reaberto e re-encerrado, o lançamento de abertura do seguinte é
**estornado e regerado**, com nova versão. Não é um caso de bordo: é o caso normal, porque os
ajustamentos de revisão chegam quando o ano seguinte já tem quatro meses de movimento. A regeneração
recusa se algum período do exercício seguinte já estiver fechado — nessa altura a correcção é um
lançamento de correcção de exercícios anteriores, não uma reescrita da abertura.

No primeiro exercício de um tenant não há antecessor: os saldos de abertura são introduzidos à mão
ou importados, no diário `AB`, e têm de equilibrar.

### 7. O que o encerramento recusa

Além das pré-condições de cada período (ADR-0033 §6), que já são exigidas para os treze:

| Pré-condição | Porquê |
|---|---|
| Os doze períodos mensais `FECHADO` | não se encerra um ano com Março aberto |
| Apuramento de IVA em todos os doze | ADR-0034; um ano com um mês por apurar tem uma dívida fiscal desconhecida |
| Balanço de abertura lançado, ou primeiro exercício declarado como tal | sem saldos de partida o balanço não fecha |
| `totalDebitos == totalCreditos` no balancete acumulado do ano | invariante da partida dobrada |
| Estimativa de imposto introduzida (ou zero, explicitamente) | um `0` por omissão é indistinguível de um `0` por esquecimento |
| Nenhuma sessão de caixa nem reconciliação por fechar no ano | herdado do fecho de período |

### 8. O que torna isto auditável

- **`EncerramentoExercicio` guarda a fotografia do balancete usado** — saldo devedor e credor por
  conta, com código *e nome* à data do fecho — mais os ids dos três lançamentos, autor, data,
  `requestId` e `keycloakSub` (ADR-0015 §3). Não se recalcula: `ContaPGC` é mutável no nome e no
  estado activo, e um balancete recalculado em 2031 devolveria outras etiquetas para os mesmos
  números. A fotografia é o que se apresenta numa inspecção, e a lei obriga a conservar dez anos.
- **Balanço, DRE e balancete são arquivados em PDF no momento do fecho**, pelo motor do ADR-0005-a
  e no armazenamento do ADR-0017, ligados ao `EncerramentoExercicio`. O que se entregou é o que se
  consegue voltar a abrir, byte a byte, e não depende de o gerador de relatórios se manter igual.
- **Nada do encerramento é privilegiado**: os três lançamentos são lançamentos normais — numerados
  pelo mesmo mecanismo, com partidas equilibradas, imutáveis depois de `LANCADO`, corrigíveis só por
  estorno. Não há caminho que escreva partidas sem passar pelo serviço (gate do ADR-0033 §9).
- **Reabrir deixa rasto próprio**: `ReaberturaExercicio` append-only, com motivo, autor e a lista dos
  lançamentos estornados. A passagem a `ENCERRADO` grava quem a fez e quando, e é irreversível.
- `ExercicioContabil`, `EncerramentoExercicio` e `ReaberturaExercicio` entram na lista síncrona do
  ADR-0015.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Três lançamentos no diário `EN`, período 13, fotografia guardada, duas fases** ✅ | Corrigível ao nível certo; o balancete de Dezembro continua legível; o que foi entregue é reproduzível independentemente do plano de contas futuro | Mais estados e mais registos; um ADR em vez de uma tarefa |
| Um único lançamento de encerramento | Atómico e simples de explicar | Corrigir a estimativa do imposto obriga a desfazer o saldar de todas as contas de gastos e rendimentos do ano |
| Sem lançamentos — resultado calculado ao vivo, como a DRE faz hoje | Zero migração; é o que já existe | O resultado nunca chega ao balanço, `59` nunca é escrita, e o exercício seguinte não tem saldos de abertura. É o estado actual, e é por ser invisível que durou |
| Fecho único e irreversível a 31 de Dezembro | Imutabilidade máxima; a mais fácil de defender numa inspecção | Os ajustamentos de revisão chegam até Maio. Força a datá-los mal ou a lançá-los no ano errado — o oposto do que o fecho garante |
| Incluir a aplicação do resultado no encerramento | Um passo a menos; o balanço «já arrumado» a 31 de Dezembro | Antecipa uma deliberação dos sócios que o produto não conhece, e impossibilita representar dividendos |
| Encerramento como procedimento no PostgreSQL | Atomicidade garantida no motor | Mesma objecção do ADR-0015 às *triggers*: lógica fora do TypeScript, invisível ao `tsc` e ao code review, e sem `requestId` |

## Consequências

- **Alteração de dados no plano de contas de todos os tenants** — cinco contas passam a aceitar
  lançamento. É a primeira migração que altera o plano depois do seed inicial, e estabelece o
  precedente de como se faz: `UPDATE` por código, idempotente, com teste que fixa o resultado.
- **O trabalho fica inútil enquanto os três achados do ADR-0033 existirem.** O encerramento lê o
  balancete acumulado do ano; se esse balancete conta rascunhos (achado B) e inverte estornos
  (achado A), o resultado apurado está errado — e fica assinado, datado e arquivado em PDF. São
  pré-requisitos, não trabalho paralelo.
- **A DRE tem de ser reparada antes do primeiro encerramento** (achado C: prefixos com ponto contra
  códigos sem ponto). O apuramento dos resultados não usa a `gerarDRE`, usa o razão por classe — mas
  a DRE é o mapa que o cliente confere antes de mandar fechar, e uma DRE com todas as linhas de gasto
  a zero é pior do que nenhuma.
- **Quatro permissões novas**: `financas:exercicio:encerrar`, `financas:exercicio:encerrar-definitivo`,
  `financas:exercicio:reabrir`, `financas:exercicio:aplicar-resultado`. Todas escrita, todas recusam
  em Leitura (ADR-0032 §2) — com uma consequência deliberada: um tenant em Leitura **não encerra o
  exercício**. Exportar e pagar continuam a funcionar, e é isso que a FAQ de preços promete.
- **A transacção de encerramento é a mais longa do produto.** Limitada pelo número de contas com
  movimento, não pelo volume de transacções, mas merece medição própria nos cenários do ADR-0018,
  com um tenant de escala (`pnpm db:seed:volume`) antes de ir para produção.
- **Dez anos de conservação passam a ter objecto concreto**: a fotografia do balancete e os PDF
  arquivados. O ADR-0017 define o ciclo de vida do armazenamento e o ADR-0015 §4 fixou dez anos para
  o grupo fiscal e contabilístico; é aqui que se torna verificável, porque passa a haver um artefacto
  datado por exercício em vez de uma promessa de recalcular.
- **Fica por decidir o tratamento dos erros materiais de exercícios anteriores.** Correcção por
  `59 — Resultados transitados` ou por resultado do período corrente é matéria da NCRF sobre
  políticas contabilísticas e erros, e não se decide sem o texto. O produto suporta as duas por
  serem lançamentos manuais; a orientação é trabalho futuro, com parecer.

## Fontes

- Prazos da Modelo 22 (31 de Maio) e da Modelo 20 (último dia de Junho), pagamentos por conta e
  pagamento especial por conta —
  [RSM Moçambique, Guia Fiscal 2026](https://www.rsm.global/mozambique/sites/default/files/media/documents/Mo%C3%A7ambique%20Guia%20Fiscal%202026.PT%20.pdf)
  e [Autoridade Tributária — Modelo 22, IRPC](https://www.at.gov.mz/por/Media/Files/Modelo-22-IRPC-Declaracao-de-Rendimentos)
- Plano Geral de Contabilidade (PGC-NIRF), Decreto n.º 70/2009, de 22 de Dezembro — classes 5, 6, 7 e
  8; cópia em [`docs/plano_contas/`](../plano_contas/) e no
  [Boletim da República](https://fracessoriasa.co.mz/wp-content/uploads/2021/03/29-Plano-de-Contas-BR-Decreto-70-2009-de-22-de-Dezembro.pdf)
- Conservação de livros e documentos por dez anos —
  [`docs/research/mocambique-quadro-legal.md`](../research/mocambique-quadro-legal.md)
