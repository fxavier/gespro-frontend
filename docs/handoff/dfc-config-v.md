# Handoff — grafo `dfc`, nó `config-v` (gate do ticket 7)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `config`
- **Depende de**: `fatia` (HEAD `1f6989e`, ramo `ws-2-dfc`, worktree `wt/feat-dfc`)
- **Agente**: `verificador-fluxo-caixa`. Não há código de produção, fixture nem escrita na base, e o grafo não foi marcado.
- **Gate do nó**:
  - o oráculo falha **pela razão certa**: 56/56 vermelhos, 55 com «… is not a function» e 1 por asserção
    (`AUDIT_MODELS`) ✅
  - nenhum teste passa sem implementação ✅
  - `tsc --noEmit` dá **um** erro, o TS2322 das exportações em falta ✅
  - `eslint` limpo nos quatro ficheiros ✅
  - `numRuns = 1000` na propriedade ✅

## Entregue — ficheiros PROTEGIDOS a partir deste commit

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/services/financas/__tests__/dfc-config.test.ts` | **O oráculo do gate do ticket 7.** 56 testes contra o `dfc.service.ts` real e o duplo com estado. |
| `apps/erp/src/server/services/financas/__tests__/helpers/duplo-config-dfc.ts` | **Duplo com estado** de `@/server/db/client` (`prisma` e `prismaBase`). Detalhe na secção seguinte. |
| `apps/erp/src/server/services/financas/__tests__/helpers/juiz-v1-dfc.ts` | O juiz do V1, `afirmarV1`. Usa `mudou()` e uma forma canónica calculada à parte, sem o núcleo. |
| `apps/erp/src/server/services/financas/__tests__/duplo-config-dfc.autoteste.test.ts` | **Autoteste do oráculo, não da implementação**: 11 testes ao duplo e ao juiz, **verdes já**. Um duplo que fizesse commit de uma tx falhada ou calasse um `upsert` tornaria o verde do gate inútil. |

Os ficheiros protegidos dos nós anteriores não foram tocados. `git diff --stat 49588cd..HEAD` sobre `dfc.property`,
`mapeamento-versao.property`, `dfc-coerencia-caixa`, `dfc.golden`, `dfc.impedimentos-isolamento`, `dfc-saldo-caixa`,
`fixtures/`, `helpers/{dfc-golden,duplo-leitura-dfc}.ts` e `tenant-bootstrap.test.ts` sai vazio. Também não se
reutilizou o `DuploPrisma` de `compras`. A razão está em `dfc-oraculos.md`: a lista de `TABELAS` é fixa.

## O que o autor (`config`) tem de cumprir — assinaturas exactas

O `dfc.service.ts` passa a ter estas **exportações nomeadas**, com as assinaturas do `IDfcService` de
`dfc.interface.ts`. O oráculo liga-as ao contrato, e uma assinatura divergente dá erro de `tsc` no oráculo:

```ts
mapearConta(input: MapearContaInput, ctx: Ctx): Promise<MapeamentoContaFluxo>
criarRubrica(input: CriarRubricaInput, ctx: Ctx): Promise<RubricaFluxoCaixa>      // nasce origem TENANT, ativo true
editarRubrica(input: EditarRubricaInput, ctx: Ctx): Promise<RubricaFluxoCaixa>
eliminarRubrica(id: string, ctx: Ctx): Promise<RubricaFluxoCaixa>                 // SOFT delete (deletedAt)
definirContasCaixa(input: DefinirContasCaixaInput, ctx: Ctx): Promise<MapeamentoContaFluxo[]>
validarVersao(input: ValidarVersaoInput, ctx: Ctx): Promise<VersaoMapeamentoFluxo>
versaoAtual(ctx: Ctx): Promise<VersaoMapeamentoFluxo | null>
listarVersoes(ctx: Ctx): Promise<VersaoMapeamentoFluxo[]>                         // da mais recente para a mais antiga
// NOVA — ajuste 4 do grafo; ainda não está no contrato. O autor acrescenta-a ao IDfcService:
desmapearConta(contaId: string, ctx: Ctx): Promise<unknown>                       // o oráculo não lê o retorno
```

O oráculo **não** pede `listarRubricas` nem `listarMapeamentos`. Continuam no contrato para a UI (7.3).

**Código de erro novo, fixado por este oráculo (MINOR-2 do `servico`)**: `RUBRICA_COM_CONTAS`, como
`BusinessRuleError`. O oráculo compara-o como literal de string. O autor acrescenta-o a `ERROS_DFC`.

### Regras que o oráculo impõe

1. **V2, na mesma transacção.** `mapearConta`, `desmapearConta`, `criarRubrica`, `editarRubrica`, `eliminarRubrica` e
   `definirContasCaixa` escrevem a cópia de trabalho **e** criam a versão `n+1` dentro de uma única
   `$transaction(async (tx) => …)`, com commit.
   - A versão nova nasce `PENDING`, com `validadoPorId`, `validadoEm` e `observacao` a `null`.
   - As versões anteriores ficam intactas.
   - Com uma falha injectada no `create` da versão, **ou** na 1.ª escrita da cópia, **ou** na 2.ª escrita do
     `definirContasCaixa`, a chamada rejeita e o estado fica igual ao de antes.
2. **V2, sem mudança não há versão.** Nestes casos a chamada **passa** e não cria versão:
   - mapear uma conta para a rubrica onde já está;
   - editar uma rubrica com os valores que já tem, ou sem campos;
   - `definirContasCaixa` com o conjunto actual, noutra ordem;
   - repetir a mesma escrita.

   `desmapearConta` de uma conta sem mapeamento não cria versão. Pode passar ou lançar; o oráculo não fixa qual.
3. **V1.** Depois de cada escrita, o `instantaneo` da versão mais recente é igual, elemento a elemento, a
   `instantaneoDe(rubricas vivas, mapeamentos vivos)`. A verificação é dupla: `mudou(...) === false` e a forma canónica.
4. **V3.** `validarVersao` segue estes passos:
   - lê a versão com `SELECT … FROM "VersaoMapeamentoFluxo" WHERE … FOR UPDATE`, **dentro** da mesma tx do
     update e **antes** dele;
   - recusa com `VERSAO_DESACTUALIZADA` se a versão não for a mais recente, e nada muda;
   - faz uma única escrita, `versaoMapeamentoFluxo.update`, só com `estado`, `validadoPorId = ctx.userId`,
     `validadoEm = agora` e `observacao ?? null`.

   Nenhuma outra escrita toca numa versão existente.
5. **A transição nos dois sentidos, vista pelo `gerarDFC`.** v1 VALIDATED passa a v2 PENDING com `mapearConta`, a
   v2 VALIDATED com `validarVersao`, e a v3 PENDING com `definirContasCaixa`.
   - A v1 continua VALIDATED.
   - Validar a v1 dá `VERSAO_DESACTUALIZADA`.
   - `listarVersoes` devolve `[3 PENDING, 2 VALIDATED, 1 VALIDATED]`.
6. **`RUBRICA_DE_SISTEMA`.** Apagar a FIN-01, SISTEMA e sem contas, recusa com este código. Uma SISTEMA **com**
   contas pode recusar com `RUBRICA_DE_SISTEMA` ou com `RUBRICA_COM_CONTAS`.
7. **`RUBRICA_COM_CONTAS`.** Recusa com este código:
   - apagar uma TENANT com contas;
   - `editarRubrica({ ativo: false })` de uma rubrica com contas, seja TENANT, SISTEMA ou a CX-01.

   Sem contas, passa: desactivar a FIN-01 SISTEMA, e apagar a INV-90 depois de lhe desmapear a única conta.
8. **I10.** Um `contaId`, `rubricaId` ou `versaoId` de outro tenant, inexistente, ou de uma rubrica apagada dá
   `NotFoundError` **com zero chamadas de escrita**. Isto vale para os seis escritores e para `validarVersao`, e
   inclui `definirContasCaixa` com uma conta alheia no meio da lista.
   - O código `FIN-99` de B está livre em A: criá-lo passa, e B não muda.
9. **Auditoria.**
   - Nenhuma chamada a `upsert`, `createMany`, `createManyAndReturn`, `updateMany`, `updateManyAndReturn` ou
     `deleteMany`. O duplo lança e conta, e um `afterEach` confirma a zero em todos os testes.
   - `RubricaFluxoCaixa`, `MapeamentoContaFluxo` e `VersaoMapeamentoFluxo` entram em `AUDIT_MODELS`
     (`src/server/db/audit-extension.ts`).
10. **A `[property]`** gera, em 1000 corridas, sequências de 1 a 12 escritas: as sete operações, com alvos
    próprios, alheios, inexistentes e apagados, e a v1 em PENDING ou VALIDATED. Um **modelo de referência** calcula
    o que o vivo tem de ser. Depois de **cada** escrita confirma quatro coisas:
    - o desfecho que a especificação obriga;
    - vivo == previsto;
    - B intocado;
    - versão `n+1` numa só tx **se e só se** o mapeamento previsto mudou.

    Confirma também o V1, o V3 (FOR UPDATE, uma só escrita) e zero escritas antes de um 404.

    Casos sem especificação que a propriedade **não gera**:
    - mapear para rubricas `CAIXA` ou inactivas;
    - `mapearConta`/`desmapearConta` de contas de caixa (isso é o `definirContasCaixa`);
    - editar `atividade`/`sinal` de rubricas SISTEMA;
    - criar rubricas `CAIXA`;
    - revalidar uma versão já VALIDATED;
    - reutilizar o código de uma rubrica apagada.

## O duplo: o que simula e como o serviço tem de falar com ele

`vi.mock('@/server/db/client')` expõe `duploConfigDfc.prisma` e `duploConfigDfc.prismaBase`. O teste chama o serviço
dentro de `runWithTenantContext`, como faz a action.

- Os seis modelos são `ContaPGC`, `PeriodoContabil` e `ExercicioContabil`, só de leitura (escrever neles lança), e
  os três da DFC. Um teste confirma que os campos e as relações batem com o `Prisma.dmmf`.
- **A tenant-extension é emulada à letra.** No cliente `prisma`:
  - sem contexto dá `SEM_CONTEXTO_TENANT`;
  - o `create` recebe o `tenantId` do contexto;
  - `findMany`, `findFirst`, `count` e `aggregate` recebem `tenantId` e, na rubrica, `deletedAt: null`.

  `findUnique`, `update`, `delete` e o `prismaBase` **não** são escopados.
- **FKs sem escopo de tenant**, como na 22b: um mapeamento aceita uma rubrica de outro tenant, e é o serviço que a
  tem de recusar. Há também P2002 nas unicidades, e P2003 com Restrict no `delete` de uma rubrica com mapeamentos.
- **O que se suporta**:
  - `where` com escalares, `in`, `not`, `gte`/`lte`, `AND`/`OR`/`NOT`, chaves compostas (`tenantId_contaId`) e
    filtros por relação (`rubrica: { atividade: 'CAIXA' }`, `mapeamentos: { some }`);
  - `select`/`include` com relações e `_count`;
  - `orderBy`, `take`, `skip` e `aggregate`;
  - `connect` no `data`.
- **SQL cru**: só `SELECT … FROM "Modelo" WHERE col = $n AND … [ORDER BY col] [LIMIT n] FOR UPDATE|FOR SHARE` e
  `pg_advisory_xact_lock`. Serve pelo `$queryRaw` com template, por `Prisma.sql` ou por `$queryRawUnsafe`.
- **Lança em vez de fingir** nos casos seguintes. Se o autor precisar de um deles, escala ao verificador e não mexe
  no duplo:
  - `$transaction([...])` em array;
  - transacção aninhada;
  - `groupBy`, `distinct` e `cursor`;
  - outro SQL;
  - escritas aninhadas além de `connect`.

## Prova de que o oráculo é satisfazível e discriminante (fora do repositório)

Escrevi uma implementação de **referência descartável** no scratchpad da sessão. Ficou fora da árvore, não foi
commitada e não serve de molde ao `config`. Liguei-a com um `vitest.config` temporário de alias, já apagado, e
corri o oráculo contra ela e contra oito mutações:

| Implementação | Resultado |
|---|---|
| referência correcta (`findFirst` com tenantId, tudo numa `$transaction`, `FOR UPDATE` por `$queryRawUnsafe`) | **55/56 verdes**; a propriedade de 1000 corridas corre em ~12 s. O vermelho que sobra é `AUDIT_MODELS`, que é código de produção. |
| versão criada **depois** do commit (fora da tx) | 16 mortas: as 7 «mesma tx», as 7 «falha a meio» e a propriedade |
| `mudou` sempre `true` | 8 mortas: as 6 «sem mudança» e a propriedade |
| conta resolvida por `findUnique` (sem tenant) | 4 mortas: I10 conta de B no `mapear` e no `desmapear`, e a propriedade |
| desactivar com contas sem recusa | 3 mortas |
| apagar com contas sem recusa | 3 mortas |
| `deleteMany` no `definirContasCaixa` | 10 mortas |
| `validarVersao` sem `FOR UPDATE` | 3 mortas |
| `validarVersao` sem verificar a mais recente | 4 mortas: V3, a transição e a propriedade |

## Saída vermelha (gate do nó)

`cd apps/erp && npx vitest run src/server/services/financas/__tests__/dfc-config.test.ts`:

```
 Test Files  1 failed (1)
      Tests  56 failed (56)

razões (uniq -c sobre a 1.ª linha de cada FAIL):
  18 TypeError: svc.mapearConta is not a function
   9 TypeError: svc.editarRubrica is not a function
   7 TypeError: svc.eliminarRubrica is not a function
   7 TypeError: svc.definirContasCaixa is not a function
   6 TypeError: svc.desmapearConta is not a function
   4 TypeError: svc.criarRubrica is not a function
   3 TypeError: svc.validarVersao is not a function
   1 Error: Property failed after 1 tests
       Counterexample: ["PENDING",[{"k":"mapear","conta":0,"rubrica":0,"alvoConta":"propria","alvoRubrica":"propria"}]]
       Caused by: TypeError: svc.mapearConta is not a function
   1 AssertionError: expected [ 'User', 'Role', 'Permission', …(9) ] to deeply equal ArrayContaining{…}
       (- "RubricaFluxoCaixa", "MapeamentoContaFluxo", "VersaoMapeamentoFluxo")
```

Na transição, o 1.º `gerarDFC` passa contra o duplo e reporta `{ numero: 1, estado: 'VALIDATED' }`. O teste cai no
`mapearConta` seguinte.

`npx vitest run …/duplo-config-dfc.autoteste.test.ts`: **11/11 verdes**. É o autoteste do oráculo.

`npx tsc --noEmit -p .` tem um único erro, as exportações em falta:

```
src/server/services/financas/__tests__/dfc-config.test.ts(103,7): error TS2322: Type 'typeof import(".../financas/dfc.service")' is not assignable to type 'ServicoConfig'.
  Type 'typeof import(".../dfc.service")' is missing the following properties from type 'Pick<IDfcService, "gerarDFC" | "mapearConta" | "criarRubrica" | "editarRubrica" | "eliminarRubrica" | "definirContasCaixa" | "validarVersao" | "versaoAtual" | "listarVersoes">': mapearConta, criarRubrica, editarRubrica, eliminarRubrica, and 4 more.
```

`npx eslint` sobre os quatro ficheiros: limpo (exit 0).

## Para o orquestrador

- **Verificação depois do nó `config`**:
  `git diff --stat <commit deste nó>..HEAD -- apps/erp/src/server/services/financas/__tests__/{dfc-config.test.ts,duplo-config-dfc.autoteste.test.ts,helpers/duplo-config-dfc.ts,helpers/juiz-v1-dfc.ts}`
  tem de sair vazio. Acrescentar estes quatro à lista de protegidos do grafo.
- **Decisões que o oráculo fixa e o ADR não diz** (nenhuma relaxa um invariante):
  - o código `RUBRICA_COM_CONTAS`;
  - `eliminarRubrica` é soft delete;
  - rubrica apagada conta como `NotFoundError` para mapear, editar e apagar;
  - `validarVersao` de outro tenant dá 404 sem escrita.
- **As permissões ficam fora deste oráculo** (`:configurar` e `:validar` nas actions). A matriz de papéis já está em
  `dfc-permissoes.test.ts`, do `fatia`. As actions do 7.2 são do autor.
- A faixa «Mapeamento por validar» mede-se pela `versao.estado` que o `gerarDFC` devolve, a mesma que a página usa.
  A UI em si fica para o E2E 10.1.
