# Intent: Página da Demonstração de Fluxos de Caixa (DFC - ADR-0037)

- **Issue**: [#153](https://github.com/fxavier/gespro-frontend/issues/153) · **ADR**: [ADR-0037](../../decisions/ADR-0037-demonstracao-fluxos-caixa.md) (Proposto)
- **Spec**: `.kiro/specs/22-fluxo-de-caixa/tasks.md`, WS-2 (tasks 9–15) · **Grafo**: `docs/agentic/grafo-22-fluxo-de-caixa.md` (L9–L15, agente `feat-dfc`)
- **Sessão de grooming**: 2026-09-25, sobre `main` em `07b814e`

## Problem

A issue diz «DFC sem UI». A lacuna é maior: **a DFC não existe em camada nenhuma**. Verificado em `07b814e`:

| Camada | Estado |
|---|---|
| Schema | Não existem `RubricaFluxoCaixa`, `MapeamentoContaFluxo` nem os enums `AtividadeFluxo`/`SinalFluxo`/`OrigemRubrica`. Só `CompromissoTesouraria.rubricaId`, escalar e nulo «até à migração 22b» |
| Seed / bootstrap | Não há rubricas semeadas nem mapeamento das contas PGC |
| Serviço | Não existem `gerarDFC`, `contasNaoMapeadas` nem `dfc.interface.ts` |
| Actions / API | Não existem `fluxo-caixa.actions.ts` nem `/api/contabilidade/dfc/export` |
| RBAC | Não existem `financas:fluxo-caixa:leitura` nem `:configurar` |
| UI | Não existem `/contabilidade/dfc` nem `/contabilidade/fluxo-caixa/rubricas` |

Sem ela, o GestPro produz o balancete, o razão e a DRE, mas não a terceira demonstração financeira obrigatória, a única
que liga o resultado ao dinheiro que entrou e saiu.

**O que já existe e é para reutilizar, não reescrever:**
- `montarLinhasBalancete`, `calcularLinhasDRE`/`gerarDRE`, `saldoContabilAte` e `FILTRO_LANCAMENTO_MAPA`, todos em
  `contabilidade.service.ts`;
- `contabilidade/_components/seletor-periodo.tsx`, usado pelo balancete e pela DRE;
- o motor de PDF do ADR-0005, e `recharts` já instalado.

## Proposed Outcomes

O âmbito é o **WS-2 inteiro**. Parte-se em tickets tracer-bullet (skill `tracer-bullet-tickets`) pela ordem das tasks
9 → 15, e a #153 passa a épico, ou fica ligada ao épico.

### Motor (tasks 9–12, conforme ADR-0037 §1–§6)
1. Os dois modelos e os três enums, numa migração 22b. `@@unique([tenantId, contaId])` impede, por construção, que
   uma conta entre em duas actividades.
2. As rubricas `SISTEMA` e o mapeamento das contas folha do PGC padrão, em dois sítios:
   - no `tenant-bootstrap.ts`;
   - na própria migração, com `INSERT … ON CONFLICT DO NOTHING`, para os tenants que já existem.
3. `gerarDFC(periodos)`, pelo método indirecto. Corre na ordem da spec §4.2 (a ordem está nesse documento, não neste):
   - devolve os `impedimentos`, com todas as contas não mapeadas de uma vez, e nesse caso **nenhum mapa**;
   - verifica sempre a articulação, e recusa com `DFC_NAO_ARTICULA` se não bater.
4. Os invariantes I6 a I10 do ADR ficam trancados por testes: property tests para I6/I8, golden fixture
   `dfc-seed-demo.json` para o seed, e teste de I9 contra a `gerarDRE`.

### Página `/contabilidade/dfc` (task 14)
- **Limites**: **períodos contabilísticos**, um ou um intervalo do mesmo exercício, escolhidos com o `seletor-periodo`
  que já existe. Datas livres ficam fora. Um período aberto mostra o badge **«Provisório»**.
- **Colunas**: o período escolhido (N) e o **período homólogo do exercício anterior** (N-1). Sem dados de N-1, a
  coluna mostra «—».
- **Blocos**, de cima para baixo:
  1. Cartões-resumo (`KpiCard`) com o fluxo operacional, o de investimento, o de financiamento e a variação de caixa.
  2. Gráfico (`recharts`) do resultado líquido até à variação de caixa. Cascata ou barras, a decidir no desenho.
  3. Tabela com as secções Operacional, Investimento e Financiamento, rubrica a rubrica. **Cada rubrica expande para
     as suas contas**, com a variação de cada uma, e cada conta liga ao razão geral do mesmo período.
  4. Reconciliação com a DRE: o resultado líquido que abre a secção operacional, com ligação à DRE do mesmo
     período (I9).
  5. Linha de articulação: caixa inicial + variação = caixa final (I6), visível.
- **Impedimentos**: quando o mapa não sai, a página mostra a lista completa das contas não mapeadas, com o saldo e o
  movimento de cada uma.
  - Quem tem `:configurar` vê o botão **«Mapear»** em cada linha. Leva à rota de reatribuição e volta à DFC.
  - Quem só lê vê o que falta e que é preciso pedi-lo a um utilizador com permissão.
- **Menu**: grupo Contabilidade, junto da DRE, com um atalho a partir da página de Tesouraria.

### Configuração `/contabilidade/fluxo-caixa/rubricas` (task 14.3)
- Reatribuir a rubrica de qualquer conta.
- Criar rubricas `TENANT` próprias.
- As rubricas `SISTEMA` não se apagam (`RUBRICA_DE_SISTEMA`).
- Criar e editar em rotas dedicadas, sem modais.

### Exportação (task 13.3)
- **Só PDF**, por Route Handler `withApi` em `/api/contabilidade/dfc/export`. Leva as marcas «Provisório» e
  «Mapeamento por validar» quando se aplicam.
- **Isto diverge do ADR-0037 §7, que prevê também CSV. Foi decisão de produto nesta sessão**, e o ADR tem de ser
  anotado.

### Mapeamento versionado e parecer do contabilista (decisão Q2)
- **Cada tenant tem versões do seu mapeamento.** Cada versão fixa o conjunto de rubricas, a atribuição conta→rubrica
  e as contas de caixa (Q6).
- **Estado da versão**: `PENDING` ou `VALIDATED`. A validação regista também o utilizador, a data e hora, e uma
  observação opcional.
- **A DFC diz com que versão foi produzida**: o número da versão aparece no ecrã e no PDF.
- **Qualquer alteração cria uma versão nova, em `PENDING`**: reatribuir uma conta, criar ou editar uma rubrica,
  mudar as contas de caixa. A faixa **«Mapeamento por validar»** volta ao ecrã e ao PDF.
- **Versões e validações anteriores nunca se apagam**, para auditoria e histórico.
- **O parecer não bloqueia o merge.** Uma DFC com a versão em `PENDING` sai na mesma, com a faixa.

### Limites do intervalo (decisão Q4)
- **Início e fim do intervalo têm de estar no mesmo exercício.** Se não estiverem, o serviço recusa com um
  `BusinessRuleError`; o código de erro decide-se no desenho.
- **Comparativo N-1**: o período homólogo do exercício anterior, com a mesma granularidade e o mesmo intervalo
  relativo. Exemplo: 01/04/2026–30/06/2026 compara com 01/04/2025–30/06/2025.

### Contas de caixa e equivalentes (decisão Q6)
- **Quais contas são caixa é configuração**: o tenant associa-as à rubrica «Caixa e equivalentes de caixa», e essa
  associação fica registada explicitamente. **Nunca se deduz pelo prefixo** nem se assume «classe 1 inteira».
- **O Δcaixa da articulação (I6) sai só dessas contas.** Como uma conta só pode ter uma rubrica, uma conta de caixa
  fica fora das três actividades.
- **O sistema verifica a configuração contra o plano de contas.** Uma conta de caixa fora da classe 1, de agregação
  ou inactiva gera um **aviso**, que não bloqueia. **Nenhuma conta de caixa** gera um **impedimento**: sem elas não
  há Δcaixa.
- **As contas de caixa fazem parte da versão do mapeamento.** Alterá-las invalida a validação anterior.

## Affected Users

| Perfil | `financas:fluxo-caixa:leitura` | `financas:fluxo-caixa:configurar` |
|---|---|---|
| ADMIN | sim | sim |
| FINANCEIRO | sim | sim |
| GESTOR | sim | não |
| LEITURA | sim | não |
| OPERADOR | não | não |

- A exportação reutiliza `financas:exportar`.
- Em modo Leitura (ADR-0032), a consulta e a exportação funcionam: a action declara `permiteEmLeitura: true` e o
  export é `GET`.
- As permissões novas só chegam aos tenants existentes depois de `pnpm db:seed`.

Fora do sistema: o contabilista que dá o parecer da task 15.3, e o revisor de contas que recebe o PDF.

## Constraints

- **A DFC é só leitura de `Lancamento`**: o `gate-periodo` tem de ficar a zero (task 15.2).
- **Articulação e cobertura são recusas, não avisos** (ADR §4–§5). Um mapa que não fecha não sai do serviço.
- **Dinheiro em `Prisma.Decimal`** do princípio ao fim. A articulação é igualdade exacta, sem tolerância.
- **Datas**:
  - dia fiscal por `diaCivilEmMaputo`;
  - limites por `PeriodoContabil`, nunca por `z.coerce.date()` em `aaaa-mm-dd`, que perde o último dia (ver
    `CLAUDE.md`);
  - as datas da UI passam por `format-date.ts`.
- **Multi-tenant**: rubricas e mapeamentos filtram por `tenantId`; cross-tenant devolve `NotFoundError` (I10).
- **Auditoria**:
  - a reatribuição e a criação de rubricas usam escritas singulares, com os modelos em `AUDIT_MODELS`, porque
    `upsert` e `*Many` não ficam no trilho;
  - as versões do mapeamento são **append-only**: nenhum `UPDATE` nem `DELETE` de uma versão, excepto a transição
    `PENDENTE → VALIDADO` da própria versão;
  - a alteração do mapeamento e a versão nova nascem na **mesma `$transaction`**.
- **UI**:
  - `page.tsx` é Server Component;
  - colunas com funções num módulo `'use client'`;
  - sem modais;
  - só tokens de `packages/brand`;
  - dark mode, e `e2e:a11y` AA nos dois temas.
- **Sequência**: o WS-2 só arranca com o WS-1 integrado, e o WS-1 está na `main`. O `tenant-bootstrap.ts` é ponto
  de conflito de merge conhecido.
- **Oráculos escritos por quem não implementa** (doutrina `docs/agentic/00-doutrina-loop-e-grafo.md`): o agente
  `verificador-fluxo-caixa` escreve os property tests e a golden fixture antes do núcleo puro.
- **Aceitação**:
  - `pnpm check && pnpm gates` verdes, mais `pnpm build`;
  - o `e2e/15-dfc.spec.ts`: desmapear uma conta, ver o impedimento, mapear, gerar e exportar o PDF;
  - um smoke autenticado da página com o seed demo.

## Open Questions

Q2, Q4 e Q6 ficaram respondidas: ver as secções respectivas em *Proposed Outcomes*. As que sobram têm uma omissão
proposta, e os tickets seguem-na até alguém dizer o contrário.

1. **O ADR-0037 tem de ser emendado e aceite.** Esta intenção diverge dele em três pontos:
   - o mapeamento versionado com validação (Q2), que o ADR não prevê;
   - a rubrica de caixa em vez da «classe 1 mapeada como meios líquidos» (Q6);
   - só PDF, em vez de CSV e PDF.

   A emenda e a aceitação são actos humanos. *Omissão*: é o ticket 0, e bloqueia o resto.
2. **Nomes do estado da versão**: `PENDING`/`VALIDATED` foram os nomes dados na resposta. A casa usa enums em
   português (`EMITIDA`, `LANCADO`). *Omissão*: `PENDENTE`/`VALIDADO` no enum, e «Por validar»/«Validado» na UI.
   Corrige-se na emenda do ADR se não for isto.
3. **N-1 sem exercício anterior**: *omissão* «—». Não se calcula um N-1 parcial a partir dos saldos de abertura do
   ADR-0035.
4. **Gráfico**: *omissão* barras por actividade (OP, INV, FIN e Δcaixa), que o `recharts` faz nativamente. A cascata
   fica como melhoria.
5. **Quem pode validar a versão**: *omissão* só `financas:fluxo-caixa:configurar` (ADMIN e FINANCEIRO). O
   contabilista externo precisaria de um utilizador com esse perfil. É preciso uma permissão própria, por exemplo
   `:validar`?
6. **Conteúdo da tabela de mapeamento semeada**: quais rubricas `SISTEMA` e qual conta do PGC padrão vai para cada
   uma. Não existe em lado nenhum: o spec 22 só diz «mapear todas as contas folha». Um agente propõe, e o parecer
   é que a valida.
7. **Destino da #153**: *omissão* a #153 passa a épico, com uma sub-issue por ticket. As sub-issues só se criam no
   GitHub com o teu OK.
