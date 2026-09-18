# ADR-0033 — Exercício contabilístico: abertura, períodos e trancamento

- **Estado**: Proposto
- **Data**: 2026-09-18
- **Contexto**: Spec 02 (Contabilidade) · Spec 20 (Prontidão para Produção)
- **Relacionados**: [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (trilho de auditoria), [ADR-0011](./ADR-0011-fronteira-autorizacao.md) (§3, e D9 — estado com escritor), [ADR-0032](./ADR-0032-aplicacao-da-leitura.md) (padrão da bandeira explícita), [ADR-0023](./ADR-0023-governacao-documentacao.md)
- **Pressuposto de**: [ADR-0034](./ADR-0034-apuramento-iva.md) e [ADR-0035](./ADR-0035-encerramento-exercicio.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `api-conventions`, `fiscalidade-mz`, `estado-com-escritor`

## Contexto

O GestPro não tem ano contabilístico. Tem um campo de texto derivado de uma data.

O que existe hoje, verificado contra o código e não contra a memória do sistema (ADR-0024):

- `Lancamento.periodoFiscal` é uma `String` no formato `YYYY-MM`, produzida por
  `periodoFiscalDe(data)` (`src/server/services/financas/contabilidade.service.ts:63`). Não existe
  `ExercicioContabil`, não existe `PeriodoContabil`, e não existe nenhuma coluna de estado que
  diga se um período aceita escrita.
- A numeração dos lançamentos é `count(*) + 1` por `(tenant, diário, período)`, serializada por
  `SELECT id FROM "Diario" WHERE id = … FOR UPDATE` (`contabilidade.service.ts:109-120`). O
  `@@unique([tenantId, diarioId, periodoFiscal, numero])` sustenta-a.
- A permissão `financas:fechar_periodo` existe no catálogo (`prisma/seed/rbac.ts:83`) e é atribuída
  ao papel financeiro (`:462`). **Nenhuma Server Action a usa** — `git grep fechar_periodo` devolve
  duas linhas, ambas do seed. É uma permissão sem escritor, que é precisamente o defeito que o
  ADR-0011 D9 e a skill `estado-com-escritor` existem para impedir.
- `TipoDiario` tem `ABERTURA` e `ENCERRAMENTO`, e o bootstrap cria os diários `AB` e `EN` em todos
  os tenants (`src/server/provisioning/tenant-bootstrap.ts:121-122`). Nunca foram escritos por nada.
- `SerieDocumento` tem `ano` e o comentário do modelo promete «reset anual do proximoNumero»
  (`prisma/schema/financas.prisma:455`). O `proximoNumeroSerie` escolhe a série com
  `ORDER BY ano DESC, "createdAt" DESC LIMIT 1 FOR UPDATE` (`faturacao.service.ts:243-255`) —
  **pela série mais recente, não pela data do documento**.
- `periodoFiscalDe` usa `data.getFullYear()` e `data.getMonth()`, isto é, o fuso do processo. O
  servidor corre em UTC — está escrito no topo de `src/lib/format-date.ts` e é a razão pela qual
  esse ficheiro existe — e o facto fiscal acontece em `Africa/Maputo` (UTC+2, sem horário de Verão).

O resultado é que nada impede lançar hoje, 18 de Setembro de 2026, um documento com data de 3 de
Março de 2024 num exercício cuja Modelo 22 já foi entregue. O balancete de 2024 muda, e ninguém
fica a saber.

### Os três achados que bloqueiam esta decisão

Não são decisões — são defeitos, e por isso não têm ADR próprio (README, «O que **não** tem ADR»).
Ficam aqui porque o trancamento de período não vale nada enquanto existirem, e porque foram
encontrados a verificar esta decisão contra o código:

| # | Defeito | Onde | Efeito |
|---|---|---|---|
| A | O estorno inverte o balancete em vez de o zerar | `contabilidade.service.ts:450-502` + `:659-670` | O original passa a `ESTORNADO` e o balancete filtra `status: { not: 'ESTORNADO' }`; o lançamento espelho fica `LANCADO` e **é contado**. Sobra o **simétrico** do movimento original, não zero |
| B | Rascunhos entram no balancete, no razão e na DRE | `contabilidade.service.ts:666`, `:696` e `:740` | O filtro exclui `ESTORNADO` mas **não exige `LANCADO`**. Um `RASCUNHO` inflaciona os três mapas |
| C | A DRE devolve zero em todas as linhas de gasto | `contabilidade.service.ts:769-777` | `saldoPrefixo('6.1')` compara com códigos **sem pontos** (`611`, `6112`, …; zero códigos com ponto nos 504 do seed). Só `saldoPrefixo('7')` acerta. O comentário do `ContaPGC.codigo` promete `"1.1.1"`; os dados dizem `111` |

Os três são pré-requisitos de qualquer fecho: fechar um período cujo balancete está errado é
carimbar o erro.

## Decisão

**O exercício e o período passam a ser entidades com estado, escritor e trilho; a escrita
contabilística é recusada fora de um período aberto; a abertura do ano é automática e o balanço de
abertura não é.**

### 1. `ExercicioContabil` e `PeriodoContabil` são modelos, não convenções de string

```prisma
enum EstadoExercicio { ABERTO EM_ENCERRAMENTO ENCERRADO_PROVISORIO ENCERRADO }
enum EstadoPeriodo   { ABERTO FECHADO }

model ExercicioContabil {
  id          String          @id @default(cuid())
  tenantId    String
  codigo      String          // "2026" — igual ao ano civil, salvo período especial
  dataInicio  DateTime        // 2026-01-01 em Africa/Maputo
  dataFim     DateTime        // 2026-12-31 em Africa/Maputo
  estado      EstadoExercicio @default(ABERTO)
  anteriorId  String?         // encadeia para o exercício precedente
  periodos    PeriodoContabil[]
  @@unique([tenantId, codigo])
  @@index([tenantId, estado])
}

model PeriodoContabil {
  id          String       @id @default(cuid())
  tenantId    String
  exercicioId String
  ordem       Int          // 1..12 = meses; 13 = período de encerramento (ADR-0035 §2)
  codigo      String       // "2026-01" … "2026-13"
  dataInicio  DateTime
  dataFim     DateTime
  estado      EstadoPeriodo @default(ABERTO)
  fechadoEm   DateTime?
  fechadoPorId String?
  @@unique([tenantId, codigo])
  @@index([tenantId, exercicioId, ordem])
  @@index([tenantId, estado])
}
```

`Lancamento` ganha `periodoId String` (FK) e **mantém** `periodoFiscal`, que passa a ser copiada de
`periodo.codigo` em vez de derivada da data.

Trocar a coluna pela FK era mais limpo e foi recusado por uma razão concreta: `periodoFiscal` faz
parte de `@@unique([tenantId, diarioId, periodoFiscal, numero])`, que é o que garante a numeração
sem lacunas por diário. Substituí-la obriga a reescrever a chave e a renumerar o histórico. A cópia
desnormalizada custa uma coluna e uma invariante testada (`periodoFiscal === periodo.codigo`);
a alternativa custa a integridade da numeração já emitida.

### 2. O período é um facto moçambicano: `Africa/Maputo`, fixo

`periodoFiscalDe` passa a resolver o dia civil em `Africa/Maputo`. Hoje, uma factura emitida a 1 de
Fevereiro às 00h30 de Maputo é gravada como `2026-01-31T22:30Z` e cai no período **de Janeiro** —
que pode já estar declarado. São duas horas por fronteira de mês, doze vezes por ano, e caem sempre
no pior sítio.

Usar `ConfiguracaoFiscal.timezone` foi recusado: o fuso do facto fiscal não é uma preferência do
tenant, e um tenant que o alterasse reescrevia a que período pertence o passado. Moçambique tem um
só fuso e não tem horário de Verão; a coluna fica para o que já é — formatação. O `format-date.ts`
já fixa `Africa/Maputo` pela mesma razão do lado do ecrã; isto é a metade que faltava, do lado do
domínio.

### 3. A abertura do ano é automática; o balanço de abertura é um acto deliberado

São duas coisas e foram sempre tratadas como uma.

**Abrir o exercício** (criar `ExercicioContabil` + 13 `PeriodoContabil` + as séries de documento do
ano) é infraestrutura. Corre num cron, `/api/cron/abrir-exercicio`, a 1 de Dezembro, para todos os
tenants activos, e é idempotente pelo `@@unique([tenantId, codigo])`. Há rede de segurança:
`resolverPeriodo()` cria o exercício em falta dentro da transacção da primeira escrita que o
precisar.

**Lançar o balanço de abertura** (o lançamento do diário `AB`, com os saldos de partida) é um acto
contabilístico, com permissão própria e autor, e pode acontecer semanas depois. Um exercício sem
balanço de abertura aceita movimento; o que não aceita é encerrar (ADR-0035).

A alternativa era exigir abertura manual antes de qualquer escrita. Recusada pelo precedente que
está escrito no próprio código: as `SERIES_INICIAIS` nasceram incompletas e, cita-se o comentário
em `tenant-bootstrap.ts`, «sem elas, `criar encomenda`, `criar devolução` e `iniciar contagem de
stock` falhavam em **TODOS** os tenants». Um ERP que a 1 de Janeiro recusa vender até o contabilista
chegar é a mesma falha com outro nome. A alternativa oposta — só criação preguiçosa, sem cron —
também foi recusada: põe a criação de treze períodos e dezanove séries dentro da transacção de uma
venda no balcão, e um erro aí falha a venda.

### 4. A série de documento passa a ser escolhida pela data do documento

`proximoNumeroSerie(tx, tipo, ctx, data)` filtra `WHERE ano = <ano do exercício da data>` em vez de
`ORDER BY ano DESC`. Sem série para esse ano, erro explícito `SERIE_NAO_ENCONTRADA`.

Isto corrige um modo de falha silencioso: hoje, a 1 de Janeiro de 2027, com apenas a série de 2026
activa, a facturação **não pára** — continua a emitir `FAT/2026/000487` para documentos de 2027, e o
reset anual prometido no schema nunca acontece. Um erro que pára a emissão é reparável em cinco
minutos; numeração fiscal com o ano errado é irreparável por construção, porque o documento já
saiu. Entre falhar em voz alta e numerar mal em silêncio, escolhe-se o primeiro — é o mesmo critério
do ADR-0032 §2.

Muda a assinatura em quatro chamadores fora de `faturacao.service.ts`
(`devolucao.service.ts:171`, `encomenda.service.ts:270` e `:556`, `troca.service.ts:157`) e nos
chamadores internos do próprio `faturacao.service.ts`.

### 5. O trancamento é verificado na escrita, dentro da transacção, com bloqueio de linha

`registarLancamentoContabilistico` e `criarLancamento` passam a, na **mesma** transacção:

1. `SELECT … FROM "PeriodoContabil" WHERE id = … FOR SHARE` — o período fica preso enquanto a
   escrita decorre;
2. recusar com `PERIODO_FECHADO` se `estado <> 'ABERTO'`.

`fecharPeriodo` faz `FOR UPDATE` na mesma linha. É o padrão que já existe no ficheiro — o
`FOR UPDATE` no `Diario` que serializa a numeração (`contabilidade.service.ts:117-118`) —
reaproveitado, não inventado.

A verificação sem bloqueio não serve. Ler o estado, validar, e só depois inserir deixa a janela em
que o fecho confirma entre a leitura e a inserção: o documento entra num período já fechado, a
declaração entregue à AT deixa de bater com o razão, e a divergência é permanente porque ninguém a
vai procurar.

### 6. O que o fecho de período recusa

Cada pré-condição é verificável contra um modelo que já existe:

| Pré-condição | Como se verifica |
|---|---|
| Nenhum lançamento em `RASCUNHO` no período | `Lancamento.status` |
| Nenhuma sessão de caixa por fechar | `SessaoCaixa.status = ABERTA` com `dataAbertura` no período |
| Nenhuma reconciliação bancária em curso | `ReconciliacaoBancaria.status = EM_ANDAMENTO` |
| Todo o documento fiscal emitido tem lançamento | `Fatura.lancamentoId`, `NotaCredito`, `NotaDebito` |
| O balancete do período equilibra | `totalDebitos == totalCreditos` |
| O apuramento do IVA do período está feito | `ApuramentoIva` do período em estado `APURADO` ([ADR-0034](./ADR-0034-apuramento-iva.md)) |
| O período anterior está `FECHADO` | ordem estrita: não se fecha Março com Fevereiro aberto |

A lista vive no serviço, com o código de erro por linha, e o ecrã mostra-a toda de uma vez em vez de
uma por tentativa.

### 7. Reabrir é possível, caro e registado

Permissão nova `financas:periodo:reabrir`, distinta de `financas:fechar_periodo`: quem fecha na
rotina mensal não é quem desfaz um fecho. Exige motivo escrito, grava `ReaberturaPeriodo`
(append-only: período, quem, quando, motivo, `requestId`, `keycloakSub`) e é **recusada** se o
exercício estiver `ENCERRADO` ou se o apuramento do IVA do período já estiver marcado como
declarado à AT — nesse caso a correcção é uma regularização no período seguinte, não uma reescrita
do passado (ADR-0034 §7).

### 8. O que torna isto auditável

Quatro propriedades, cada uma com um mecanismo e não com uma intenção:

1. **Quem e quando** — `PeriodoContabil.fechadoPorId`/`fechadoEm`, `ReaberturaPeriodo`, e os modelos
   novos entram na lista síncrona do ADR-0015 (`ExercicioContabil`, `PeriodoContabil`,
   `ReaberturaPeriodo`). Regista-se aqui que o ADR-0015 continua **por executar**: `AUDIT_MODELS`
   tem hoje cinco modelos, todos de acesso (`src/server/db/audit-extension.ts:11-13`). Por isso
   estes três modelos carregam autor e data em colunas próprias, e não dependem da extensão para
   serem legíveis numa inspecção.
2. **Com que dados** — o fecho grava o balancete do período tal como estava ao fechar, e não uma
   promessa de o recalcular. `ContaPGC` é mutável (`nome`, `ativo`); um recálculo em 2031 devolve
   outras etiquetas.
3. **Reproduzível** — período fechado com bloqueio de linha significa que o conjunto de partidas do
   período é imutável, logo o balancete é determinístico.
4. **Correlacionável** — `requestId` e `keycloakSub` em todos os registos de fecho e reabertura,
   como o ADR-0015 §3 define, para ligar ao registo estruturado e ao trilho do Keycloak.

### 9. O gate que impede a repetição

`scripts/gate-periodo.mjs`, junto aos quatro que já existem (`gates.mjs`, `gate-dialog`,
`gate-use-client`, `gate-data-imports`, `gate-leitura`):

> Nenhum ficheiro fora de `src/server/services/financas/contabilidade.service.ts` escreve em
> `Lancamento` ou `PartidaLancamento`. Toda a escrita passa por `registarLancamentoContabilistico`
> ou `criarLancamento`, que são os dois sítios onde o período é verificado.

Sem isto, o próximo domínio que precise de lançar contabilidade fá-lo directamente pelo Prisma e o
trancamento passa a ter um buraco que nenhum teste vê — que é exactamente como o ADR-0015 descobriu
que a auditoria tinha ficado num comentário.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Exercício e período como entidades, trancamento na escrita** ✅ | Uma só fonte de verdade sobre o que aceita escrita; o estado tem escritor e trilho; suporta período 13 e período especial de tributação | Migração com backfill de `periodoId`; toca em todos os caminhos de escrita contabilística |
| Trancar por data (`dataUltimoFecho` na `ConfiguracaoFiscal`) | Uma coluna, zero modelos novos, migração trivial | Não representa a reabertura de um mês isolado, não tem onde pendurar autor/motivo, e transforma «fechar» num `UPDATE` de uma data que qualquer serviço pode fazer — o defeito do `statusAtivo` que o ADR-0032 §4 descreve |
| Trancar só no fim do ano, sem períodos mensais | Simples; um fecho por ano | O IVA é mensal (ADR-0034). Um apuramento sem período trancado é um número que pode mudar depois de entregue |
| Períodos derivados, sem tabela (calculados da data) | Zero migração | Não há onde guardar estado. Uma tabela é a única coisa que se consegue bloquear com `FOR UPDATE`, e o bloqueio é a decisão |
| Validar o período por *trigger* no PostgreSQL | Impossível de contornar, mesmo por acesso directo à BD | Mesma objecção do ADR-0015: lógica fora do TypeScript, invisível ao `tsc` e ao code review, e perde o contexto aplicacional. Fica como reforço possível, não como mecanismo primário |

## Consequências

- **Uma migração com backfill.** `periodoId` nasce nulo, é preenchido a partir de `periodoFiscal`
  para os lançamentos existentes, e só depois passa a `NOT NULL`. Os exercícios e períodos
  históricos são criados a partir dos `periodoFiscal` distintos já gravados. Segue o procedimento
  não-interactivo do `CLAUDE.md` (`migrate diff` + `migrate deploy`), e o `migrate diff` final tem
  de devolver *empty migration*.
- **Toda a escrita contabilística passa a fazer mais uma leitura com bloqueio.** É uma linha por
  transacção, indexada por chave primária. Entra nos cenários k6 do ADR-0018 — a emissão de factura
  e o fecho de caixa já lá estão, e passam a medir também a contenção no `PeriodoContabil` quando
  várias caixas fecham no mesmo minuto.
- **A 1 de Dezembro passa a haver um cron que escreve em todos os tenants.** É a primeira tarefa
  agendada que escreve contabilidade. Tem de correr sob `withApi` (não fora dele — é um dos achados
  da spec 19 listados no README) e tem de ser idempotente, porque vai ser reexecutada à mão na
  primeira vez que falhar.
- **`financas:fechar_periodo` passa a ter escritor**, e junta-se-lhe `financas:periodo:reabrir` e
  `financas:exercicio:abrir`. As três novas actions declaram `revalidate`; nenhuma leva
  `permiteEmLeitura` — fechar um período é escrita, e em Leitura recusa (ADR-0032 §2).
- **Os três achados A, B e C são pré-requisitos, não trabalho paralelo.** Fechar um período cujo
  balancete conta rascunhos (B) e inverte estornos (A) é carimbar o erro com autor e data. Entram na
  mesma entrega, antes do primeiro fecho.
- **O período 13 cabe no que já existe.** `codigo = "2026-13"` passa no regex
  `^\d{4}-\d{2}$` de `src/lib/validations/contabilidade.ts:237` sem alteração, e nada no código
  converte `periodoFiscal` de volta para um mês — é produzido por `periodoFiscalDe` e exibido como
  etiqueta (`contabilidade/lancamentos/[id]/page.tsx:98`).
- **Fica por decidir o período especial de tributação.** O CIRPC admite período diferente do ano
  civil mediante justificação comunicada à AT. O modelo suporta-o (`dataInicio`/`dataFim` são
  livres), mas o produto assume ano civil em todo o lado — séries, cron de 1 de Dezembro, mapas.
  Quando aparecer o primeiro tenant com exercício desfasado, é ADR novo, não emenda deste.

## Fontes

- Código do IRPC e período de tributação; prazos das declarações Modelo 22 e Modelo 20 —
  [RSM Moçambique, Guia Fiscal 2026](https://www.rsm.global/mozambique/sites/default/files/media/documents/Mo%C3%A7ambique%20Guia%20Fiscal%202026.PT%20.pdf)
- Conservação de livros e documentos por dez anos, e a base legal fiscal —
  [`docs/research/mocambique-quadro-legal.md`](../research/mocambique-quadro-legal.md) (CIRPC art. 75 n.º 5,
  Reg. do CIRPC art. 46 n.º 1, Reg. do CIVA art. 54, CIRPS art. 105 n.º 2)
- Plano Geral de Contabilidade (PGC-NIRF), Decreto n.º 70/2009, de 22 de Dezembro — cópia em
  [`docs/plano_contas/`](../plano_contas/) e no [Boletim da República](https://fracessoriasa.co.mz/wp-content/uploads/2021/03/29-Plano-de-Contas-BR-Decreto-70-2009-de-22-de-Dezembro.pdf)
