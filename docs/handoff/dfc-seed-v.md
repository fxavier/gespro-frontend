# Handoff — grafo `dfc`, nó `seed-v` (ticket 4.4)

- **Data**: 2026-09-25 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `seed`
- **Depende de**: `nucleo` (FEITO — [`dfc-nucleo.md`](dfc-nucleo.md), HEAD `fe5a78f`)
- **Agente**: `verificador-fluxo-caixa`. Nenhum código de produção; nenhuma fixture; nenhum JSON de rubricas.
- **Gate do nó**: os casos novos de `tenant-bootstrap.test.ts` a falhar pela razão certa
  (`semearRubricasFluxo is not a function` ×9, asserção ×1) ✅ · os 21 casos existentes verdes ✅ ·
  `tsc --noEmit` só com o `TS2305` do import em falta ✅ · `eslint` limpo no ficheiro ✅.

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/provisioning/__tests__/tenant-bootstrap.test.ts` | Describe novo **«DFC — semearRubricasFluxo (ticket 4.4)»** com 10 casos (abaixo). Os casos existentes **não foram alterados**. O `fakeTx` partilhado foi **alargado** (autorizado pelo orquestrador) com os três modelos da 22b como **duplos com estado** (`tabela()`), que fazem cumprir os `@@unique` do schema (P2002 sem `skipDuplicates`), e com `$executeRaw`/`$queryRaw`(`Unsafe`) a lançar. Os 21 casos existentes continuam verdes com o `fakeTx` alargado. |
| `docs/handoff/dfc-seed-v.md` | Este ficheiro. |

A partir deste commit, os casos DFC de `tenant-bootstrap.test.ts` são **ficheiro protegido** (grafo, «Ficheiros
protegidos»): o `feat-dfc` não lhes toca. Verificação no fim do nó `seed`:
`git diff --stat <hash deste commit>..HEAD -- apps/erp/src/server/provisioning/__tests__/tenant-bootstrap.test.ts` tem de ser vazio.

## Caso → invariante

| # | Caso (`it`) | Invariante / regra | O que o seed tem de cumprir |
|---|---|---|---|
| 1 | I7 sobre o seed: toda a conta folha do plano fica com exactamente UM mapeamento; nenhuma agregadora; nenhuma rubrica inexistente | **I7** (ADR-0037 §4), §2 (`@@unique([tenantId, contaId])`) | Depois de `bootstrapPlanoContas` + `semearRubricasFluxo`: `#mapeamentos == #folhas activas` (435 no plano canónico, deduplicado como o bootstrap faz); cada folha aparece **uma** vez; nenhum `contaId` de agregadora nem fora do plano do tenant; todo o `rubricaId` é de uma rubrica **viva** (`deletedAt: null`) do tenant. As mensagens de falha listam os **códigos** em falta/repetidos. |
| 2 | idempotência: correr duas vezes não duplica rubricas, mapeamentos nem versões | ticket 4.2 («idempotente, com `createMany` e `skipDuplicates`») | Contagens iguais antes e depois da 2.ª corrida; `versoes == [1]`. O duplo lança **P2002** num `create`/`createMany` repetido sem `skipDuplicates` — como a base. |
| 3 | idempotência: não sobrepõe o que o tenant já reconfigurou, nem cria versão por si | ticket 4.2 + V2 (o seed **não** é uma escrita do mapeamento) | Fixture: depois da 1.ª corrida, uma conta é movida para outra rubrica e existe uma versão 2 (simulação do futuro `config`). A 2.ª corrida **não** repõe o mapeamento, não duplica a conta, não cria versão 3, não cria rubricas. Precedente: `bootstrapContasNaturezaNotaDebito` («não substitui o que o tenant já escolheu»). |
| 4 | versão 1: exactamente uma, numero 1, PENDING, por validar — e o instantâneo é igual ao elemento (V1) ao mapeamento vivo | **V1**, E1 | Uma só `VersaoMapeamentoFluxo` do tenant: `{numero: 1, estado: 'PENDING', validadoPorId: null, validadoEm: null}`. `instantaneo` `toEqual` `instantaneoDe(rubricas, mapeamentos)` do vivo e `mudou(gravado, vivo) === false`; sobrevive a `JSON.parse(JSON.stringify(...))`. `instantaneoDe` **lança** se o seed repetir uma conta ou apontar para rubrica não viva (dfc-nucleo). A versão tem de ser gravada **depois** dos mapeamentos (mutação «versão antes» morre aqui). |
| 5 | coerência de caixa (E2): há pelo menos uma conta CAIXA e `coerenciaContasCaixa` não devolve impedimentos | **E2** | As contas de caixa deduzem-se **pela actividade da rubrica** (`atividade === 'CAIXA'`), nunca por prefixo; ≥ 1 conta; `impedimentos == []`. |
| 6 | coerência de caixa (E2): a configuração por omissão não nasce com avisos | **E2** (avisos) — decisão do verificador, ver «Decisões» | `avisos == []`: as contas mapeadas a `CAIXA` pelo seed são folhas **activas da classe 1**. |
| 7 | `bootstrapContabilidade` semeia as rubricas: um tenant novo nasce com o mapeamento e a versão 1 | ticket 4.2 («é chamada por `bootstrapContabilidade`») | Com um `fakeTx` cujo `contaPGC` se lembra do plano: rubricas > 0, `#mapeamentos == #folhas`, versões `[[1, 'PENDING']]`. Falha hoje por **asserção** (0 rubricas) — a função existe, só não chama o seed. |
| 8 | escritas: rubricas SISTEMA, activas, tenantId explícito, id uuid atribuído pelo bootstrap; enums válidos; sem SQL cru | ADR-0037 §3 (`origem: SISTEMA`), regra do `tenant-bootstrap` (ids uuid, `tenantId` explícito no cliente cru) | Toda a rubrica: `origem 'SISTEMA'`, `ativo true`, `deletedAt null`, `tenantId`, `id` a casar com o regex uuid (o duplo atribui `rub-n` a quem não traz id), `atividade ∈ AtividadeFluxoEnum`, `sinal ∈ SinalFluxoEnum`, `ordem` inteiro, `codigo`/`designacao` não vazios; **as quatro actividades têm rubrica** (OPERACIONAL, INVESTIMENTO, FINANCIAMENTO, CAIXA). Mapeamentos e versão com `tenantId`. `$executeRaw`/`$queryRaw`(`Unsafe`) **não chamados**. |
| 9 | isolamento (I10): dois tenants no mesmo cliente cru — cada mapeamento aponta para conta e rubrica do PRÓPRIO tenant | **I10** | Semeados T1 e T2 no mesmo duplo: os `contaId`/`rubricaId` de cada tenant pertencem ao seu plano/às suas rubricas; ids de rubrica disjuntos entre tenants (as FKs da 22b não são tenant-scoped); uma versão 1 por tenant. |
| 10 | **TEM de lançar**: sem plano de contas no tenant, o seed recusa e não deixa a versão 1 para trás | I7 (protecção do seed) — decisão do verificador, ver «Decisões» | `semearRubricasFluxo` antes de `bootstrapPlanoContas` ⇒ `rejects.toThrow(/plano/i)` e **zero** versões do tenant (a guarda corre antes de escrever a versão). |

## Saída vermelha (gate do nó)

`cd apps/erp && npx vitest run src/server/provisioning/__tests__/tenant-bootstrap.test.ts`:

```
 ❯ src/server/provisioning/__tests__/tenant-bootstrap.test.ts (31 tests | 10 failed)
     × I7 sobre o seed: toda a conta folha do plano fica com exactamente UM mapeamento; nenhuma agregadora; nenhuma rubrica inexistente
     × idempotência: correr duas vezes não duplica rubricas, mapeamentos nem versões (o duplo faz cumprir os @@unique)
     × idempotência: não sobrepõe o que o tenant já reconfigurou, nem cria versão por si (o seed não é uma escrita do mapeamento)
     × versão 1: exactamente uma, numero 1, PENDING, por validar — e o instantâneo é igual ao elemento (V1) ao mapeamento vivo
     × coerência de caixa (E2): há pelo menos uma conta CAIXA e coerenciaContasCaixa não devolve impedimentos
     × coerência de caixa (E2): a configuração por omissão não nasce com avisos (folhas activas da classe 1)
     × bootstrapContabilidade semeia as rubricas: um tenant novo nasce com o mapeamento e a versão 1
     × escritas: rubricas SISTEMA, activas, com tenantId explícito e id uuid atribuído pelo bootstrap; enums válidos; sem SQL cru
     × isolamento (I10): dois tenants no mesmo cliente cru — cada mapeamento aponta para conta e rubrica do PRÓPRIO tenant
     × TEM de lançar: sem plano de contas no tenant, o seed recusa e não deixa a versão 1 para trás

 FAIL  … > I7 sobre o seed: …                      TypeError: semearRubricasFluxo is not a function
 FAIL  … > idempotência: correr duas vezes …       TypeError: semearRubricasFluxo is not a function
 FAIL  … > idempotência: não sobrepõe …            TypeError: semearRubricasFluxo is not a function
 FAIL  … > versão 1: …                             TypeError: semearRubricasFluxo is not a function
 FAIL  … > coerência de caixa (E2): há pelo menos … TypeError: semearRubricasFluxo is not a function
 FAIL  … > coerência de caixa (E2): a configuração … TypeError: semearRubricasFluxo is not a function
 FAIL  … > bootstrapContabilidade semeia as rubricas … AssertionError: expected 0 to be greater than 0
 FAIL  … > escritas: …                             TypeError: semearRubricasFluxo is not a function
 FAIL  … > isolamento (I10): …                     TypeError: semearRubricasFluxo is not a function
 FAIL  … > TEM de lançar: …                        TypeError: semearRubricasFluxo is not a function

 Test Files  1 failed (1)
      Tests  10 failed | 21 passed (31)
```

`npx tsc --noEmit -p .` (um único erro, o do import em falta):

```
src/server/provisioning/__tests__/tenant-bootstrap.test.ts(18,3): error TS2305: Module '"../tenant-bootstrap"' has no exported member 'semearRubricasFluxo'.
```

`npx eslint src/server/provisioning/__tests__/tenant-bootstrap.test.ts` → exit 0.

## Prova de que o oráculo é satisfazível e discriminante (fora do repositório)

Um oráculo que só falha por «is not a function» prova que antecede a solução; não prova que uma solução correcta o
passa nem que uma errada o chumba. Escrevi uma implementação de **referência descartável** no scratchpad da sessão
(fora da árvore; **não** é o nó `seed` e não fica), ligada por um `vitest.config` de alias sobre `../tenant-bootstrap`,
e corri o ficheiro inteiro contra ela e contra oito mutações:

| Implementação | Resultado (31 casos) |
|---|---|
| referência correcta (4 rubricas, classe 1 → CX-01, 3 → INV, 5 → FIN, resto → OP; `skipDuplicates`; versão 1 só se não existir; guarda «sem plano») | **31/31 verdes** — incluindo o caso existente «bootstrapContabilidade encadeia os três passos» com o `fakeTx` de 3 contas |
| sem a guarda «tenant sem plano» | 1 morta: caso 10 |
| `createMany` sem `skipDuplicates` | 2 mortas: casos 2 e 3 (P2002 do duplo) |
| versão criada em todas as corridas (`numero = n+1`) | 2 mortas: casos 2 e 3 |
| uma conta da classe 2 (211) mapeada a `CX-01` | 1 morta: caso 6 |
| rubricas sem `id` (deixado ao `@default(cuid())`) | 1 morta: caso 8 |
| rubricas com `origem: 'TENANT'` | 1 morta: caso 8 |
| versão 1 gravada **antes** dos mapeamentos (instantâneo com 0 mapeamentos) | 1 morta: caso 4 |
| agregadoras também mapeadas (sem `aceitaLancamento: true`) | 4 mortas: casos 1, 6, 7, 9 |

## Decisões do verificador (o que o oráculo fixa além da letra do ticket)

1. **Duplo com estado, não `{ count }`.** Idempotência não se mede num mock que esquece: `tabela()` guarda linhas,
   aplica os `@@unique` (`[tenantId, codigo]`, `[tenantId, contaId]`, `[tenantId, numero]`, `[tenantId, codigo]` no
   `contaPGC` dos casos DFC) e lança P2002 sem `skipDuplicates`. Suporta `create`, `createMany`,
   `createManyAndReturn`, `findMany`/`findFirst`/`findUnique` (igualdade, `in`, `notIn`, `not`, `equals`,
   `AND`/`OR`/`NOT`, chaves compostas `tenantId_codigo`…), `count`, `aggregate({_max,_count})`, `upsert`,
   `update(Many)`, `delete(Many)`, `orderBy`, `take`. **Só campos escalares**: `connect`/`include`/filtros de relação
   lançam com mensagem própria; um filtro por campo inexistente na tabela também lança (não passa por «vazio»).
   `select` é ignorado (devolve a linha inteira). `undefined` num `data` é «não fornecido» (não apaga a omissão).
2. **O caso existente `bootstrapContabilidade encadeia os três passos` corre com um plano de 3 contas** (o `fakeTx`
   partilhado devolve `711/781/769`). Consequência para o autor: `semearRubricasFluxo` **não pode lançar** quando uma
   conta do JSON não existe no plano do tenant — mapeia o que existe (precedente `bootstrapContasNaturezaNotaDebito`:
   «conta em falta → fica sem linha, nunca uma conta inventada»). A DFC dirá o resto como impedimento (I7).
3. **Caso 10 (TEM de lançar) — tenant sem plano.** Escolhi o caso que protege I7 no seed: gravar a versão 1 com zero
   mapeamentos e depois ser idempotente por «a versão 1 já existe» deixaria o tenant sem mapeamento para sempre. A
   asserção pede `toThrow(/plano/i)` (mensagem em PT-PT com «plano de contas») e zero versões — a guarda corre
   **antes** de escrever. Distingue-se da decisão 2: plano **vazio** é ordem de bootstrap errada; plano **parcial** é
   divergência do tenant. Se o orquestrador preferir outra semântica, é alteração ao oráculo (e ao ticket), não ao seed.
4. **Caso 6 — sem avisos por omissão.** O ticket só exige «sem impedimentos»; acrescentei «sem avisos» num `it`
   separado: uma configuração de sistema que nasce com «conta de caixa fora da classe 1» em todos os tenants é um
   defeito da tabela 4.1, não uma escolha. Só restringe as contas mapeadas a `CAIXA` (folhas activas da classe 1); não
   diz quais.
5. **Caso 8 — as quatro actividades têm rubrica.** Sem `CAIXA` não há Δcaixa; sem uma das três secções, o mapa nasce
   sem sítio para uma classe inteira (a 3 para INVESTIMENTO, a 5 para FINANCIAMENTO). Não fixa códigos, designações,
   `sinal` nem `ordem` — isso é do parecer.
6. **Ids uuid atribuídos pelo bootstrap** (instrução do orquestrador; precedente `bootstrapPlanoContas`): o duplo dá
   `rub-n` a quem não traz id, por isso um uuid só pode vir do seed. Razão prática: `createMany` não devolve linhas, e
   os mapeamentos precisam do `rubricaId` — na 2.ª corrida o seed tem de **reler** as rubricas por `codigo` (o caso 3
   morre se usar ids novos).
7. **Nada de conteúdo.** Nenhum caso conhece `rubricas-fluxo-caixa.json`: as folhas vêm de `plano-contas-pgc.json`
   (deduplicado como o bootstrap), as contas de caixa da actividade da rubrica, e a cobertura é exacta (`==`), não `≥`.

## O que o nó `seed` tem de cumprir (resumo operacional)

- `semearRubricasFluxo(tx, tenantId)` em `tenant-bootstrap.ts`, exportada; `bootstrapContabilidade` chama-a (caso 7).
  O ticket 4.2 manda chamá-la também em `prisma/seed/financas.ts` e `seed/volume/base.ts` — o oráculo não vê esses dois
  (é o `psql` do gate do ticket que os cobre).
- Lê as folhas do tenant por `tx.contaPGC.findMany({ where: { tenantId, aceitaLancamento: true, ativo: true } })`
  (ou equivalente com `in` de códigos); zero folhas ⇒ lança com «plano de contas» na mensagem, **antes** de escrever.
- `rubricaFluxoCaixa.createMany` com `id: randomUUID()`, `tenantId`, `origem: 'SISTEMA'`, `ativo: true`,
  `skipDuplicates: true`; depois **relê** as rubricas vivas do tenant para obter os ids (2.ª corrida).
- `mapeamentoContaFluxo.createMany` com `tenantId`, `contaId`, `rubricaId`, `skipDuplicates: true` — uma linha por
  folha, nenhuma agregadora, nenhum `connect`.
- Versão 1 **só se não existir nenhuma versão do tenant** (`findFirst`/`count`/`findUnique({tenantId_numero})`), com
  `instantaneo = instantaneoDe(rubricasVivas, mapeamentosDoTenant)` lido **depois** dos mapeamentos, `numero: 1`,
  `estado: 'PENDING'`. Nunca cria versão n+1 (isso é do `config`).
- Sem `$executeRaw`/`$queryRaw`; sem `upsert` obrigatório (o duplo aceita-o, mas o ticket diz `createMany`).
- `provisionamento-integracao.test.ts` (`limpar()`) apaga `ContaPGC` com `deleteMany`: com a FK `RESTRICT` de
  `MapeamentoContaFluxo`, esse `limpar` passa a ter de apagar primeiro mapeamentos, versões e rubricas (já avisado em
  `dfc-contratos.md`). Fora dos protegidos; é do autor.

## Fora deste nó

- `rubricas-fluxo-caixa.json` (4.1), `semearRubricasFluxo` (4.2), ⚙ `22c` (4.3), chamadas em `seed/financas.ts` e
  `seed/volume/base.ts`. Nenhuma golden (é do `servico-v`). O grafo **não** foi marcado.
- A base local não foi tocada.
