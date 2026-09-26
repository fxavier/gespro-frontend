# Handoff — grafo `dfc`, nó `contratos` (ticket 1, itens 1.1–1.3)

- **Data**: 2026-09-25 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `oraculos`
  (depois do ⚙ `22b`)
- **Depende de**: `adr` (FEITO — [`dfc-adr.md`](dfc-adr.md))
- **Gate do ticket**: `npx prisma validate` ✅ · ⚙ `22b` aplicada pelo orquestrador
  (`prisma/migrations/20260925155120_22b_rubricas_fluxo_caixa`) · `tsc` 0 erros (hotfix `13c64c2` de `compras.ts`)
- **Estado**: 1.1–1.3 entregues; **FIX volta 1** aplicada após revisão do code-reviewer (sem BLOCKER) — ver
  «Correcções da revisão». Schema **não** tocado na FIX (a 22b já estava aplicada).

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/prisma/schema/financas.prisma` | 4 enums (`AtividadeFluxo` com `CAIXA`, `SinalFluxo`, `OrigemRubrica`, `EstadoVersaoMapeamento { PENDING VALIDATED }`), 3 modelos (`RubricaFluxoCaixa`, `MapeamentoContaFluxo`, `VersaoMapeamentoFluxo`), relação `CompromissoTesouraria.rubrica`, back-relation `ContaPGC.mapeamentosFluxo`. Editado à mão; sem `prisma format`. |
| `apps/erp/src/lib/validations/fluxo-caixa.ts` | Enums Zod + `FiltroDFCSchema`, `MapearContaSchema`, `CriarRubricaSchema`, `EditarRubricaSchema`, `DefinirContasCaixaSchema`, `ValidarVersaoSchema`. Só `idEntidade()`; nenhum `.cuid()`; nenhum `z.coerce.date()`. |
| `apps/erp/src/server/services/financas/dfc.interface.ts` | `ERROS_DFC`, tipos de domínio, `InstantaneoMapeamento`, `ContaNaoMapeada`, `AvisoConfiguracao`, `ImpedimentosDFC`, `VariacaoClassificada`, `MapaConta`, `SeccoesDFC`, `ColunaDFC`, `DFC`, `ResultadoDFC` + `temImpedimentos()`, as assinaturas do núcleo puro (`*Fn`) e `IDfcService`. |

Verificações feitas (de `apps/erp/`):

- `npx prisma validate` → «The schemas at prisma/schema are valid».
- `npx prisma generate` → OK (o cliente gerado já tem os três modelos).
- `npx tsc --noEmit -p .` → **0 erros nos ficheiros deste nó**; 15 erros pré-existentes em `compras.ts` /
  `conta-pagar.service.ts` (ver abaixo). Com os dois imports repostos o `tsc` dá **0 erros** (testado e revertido).
- `npx eslint` sobre os dois ficheiros novos → limpo.
- `projecao.property.test.ts` (WS-1, sem base) → verde; os tipos de `CompromissoTesouraria` não mudaram
  (uma `@relation` não acrescenta campos escalares).
- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` (só leitura) → o SQL da
  `22b`: 4 `CREATE TYPE`, 3 `CREATE TABLE`, 6 índices, 3 FKs. `CompromissoTesouraria.rubricaId` fica
  `ON DELETE SET NULL`; as duas FKs de `MapeamentoContaFluxo` ficam `ON DELETE RESTRICT`.

## Decisões deste nó (e porquê)

1. **Relações `@relation`, não escalares, dentro de `financas.prisma`.** A regra da casa «FK escalar, nunca
   `@relation`» é para FKs **cross-domínio**; `ContaPGC`, `RubricaFluxoCaixa` e `CompromissoTesouraria` são todos
   do mesmo ficheiro. Há dois precedentes no ficheiro (`ContaBancaria.contaContabil` com relação;
   `ContaNaturezaNotaDebito.contaId` escalar); escolheu-se a relação porque aqui a integridade na base é
   substantiva: um `rubricaId` pendurado faria a conta desaparecer do mapa em silêncio, que é exactamente o
   defeito que o ADR-0037 §Contexto-3 e §4 proíbem. O `RESTRICT` na FK `rubricaId` reforça ao nível da base o
   `RUBRICA_DE_SISTEMA` (nenhuma rubrica com contas se apaga fisicamente). O grafo já dizia
   «`CompromissoTesouraria.rubricaId` passa a relação»; `validadoPorId` → `User` fica escalar (outro domínio),
   como `criadoPorId`/`fechadoPorId`.
2. **`createdAt`/`updatedAt` em `RubricaFluxoCaixa` e `MapeamentoContaFluxo`.** Não estão no ADR §2, mas são a
   convenção `prisma-conventions` e a reatribuição de uma conta é uma escrita que interessa datar. Aditivo, sem
   efeito no contrato. `VersaoMapeamentoFluxo` só tem `createdAt` (append-only: não se actualiza, excepto a
   transição V3, cujo instante é `validadoEm`).
3. **`@@index([tenantId, estado])` em `VersaoMapeamentoFluxo`.** A faixa «Mapeamento por validar» lê a versão
   mais recente por `numero` (o `@@unique` serve), mas o histórico e a pergunta «há alguma PENDING?» filtram por
   estado. Barato; pode cair se o `config` não o usar.
4. **As contas de caixa não têm campo próprio no instantâneo.** E1 diz que cada versão «fixa … as contas de
   caixa»; E2 diz que caixa = contas mapeadas a rubricas `CAIXA`. Um campo à parte seria uma segunda fonte de
   verdade que o V1 («igual ao elemento») teria de reconciliar. `InstantaneoMapeamento = { rubricas,
   mapeamentos }` em **ordem canónica** (rubricas por `codigo`, mapeamentos por `contaId`) para que `mudou()`
   seja igualdade estrutural.
5. **`ImpedimentosDFC` traz `contasNaoMapeadas` estruturadas além de `impedimentos: string[]`.** O ADR exige a
   lista de frases (padrão `fecharPeriodo`); a intent exige que a página mostre saldo e movimento de cada conta.
   Um só retorno evita que a página chame `contasNaoMapeadas` a seguir a `gerarDFC`. `ResultadoDFC = DFC |
   ImpedimentosDFC` com `temImpedimentos()` como discriminador: uma resposta com impedimentos **não tem** secções,
   por tipo.
6. **`FiltroDFC` sem `.default()` e sem datas.** Os limites são ids de `PeriodoContabil` (§6, E3); o defeito
   «`z.coerce.date()` perde o último dia» não tem por onde entrar. O que o Zod não vê fica no serviço:
   `DFC_ENTRE_EXERCICIOS` (V4), `DFC_INTERVALO_INVERTIDO` (código novo deste nó, para fim < início por `ordem`) e
   `NotFoundError` cross-tenant (I10).
7. **`DefinirContasCaixaSchema.contaIds` com `min(1)` e sem repetições.** Gravar de propósito «zero contas de
   caixa» é gravar um estado que a DFC recusa (E2). O estado continua alcançável por `mapearConta` (mover a única
   conta `CAIXA` para outra rubrica) — é por aí que o oráculo 2.3 «nenhuma conta CAIXA ⇒ impedimento» deve
   chegar lá, e é o que `coerenciaContasCaixa` cobre.
8. **`EditarRubricaSchema` entrou** embora o 1.3 liste cinco schemas: o ticket 7.1 tem `editarRubrica` e o
   contrato é deste nó. `origem` não é editável (uma `SISTEMA` não passa a `TENANT` para ficar apagável).
9. **Nome do resultado da DRE.** O ADR fala em `resultadoLiquido` de `gerarDRE`; o campo real do tipo `DRE` é
   `lucroLiquido`. `SeccoesDFC.resultadoLiquido` é, por contrato, esse `lucroLiquido` (I9).
10. **Sinal das variações.** `VariacaoClassificada` leva `natureza` e `efeitoCaixa` já calculado: a regra
    (activo DEVEDORA a crescer consome caixa; passivo CREDORA a crescer liberta-a) vive em
    `classificarVariacoes`, e a UI/testes não a reimplementam. É conta a conta (44331, 421), nunca por prefixo.

## Correcções da revisão (FIX, volta 1 de 3 — 2026-09-25)

Revisão do code-reviewer sem BLOCKER; seis achados, todos fechados em `dfc.interface.ts` sem tocar no schema.

- **M1** — `VariacaoClassificada.conta` deixou de pedir `classe`: `classificarVariacoes` só recebe
  `ContaBalancete[]` (cuja `conta` não tem `classe`) e o `MapaConta`. A forma é agora exactamente a de
  `ContaBalancete['conta']` (`id`, `codigo`, `nome`, `tipo`, `natureza`). `contabilidade.interface.ts` intacto.
- **M2** — **Os dois lados da articulação saem dos MESMOS balancetes.** `saldoContabilAte` filtra só
  `status: 'LANCADO'` (`contabilidade.service.ts:1180`), enquanto os balancetes usam `FILTRO_LANCAMENTO_MAPA`
  (`LANCADO` + `ESTORNADO`); usar um de cada lado faz o I6 falhar numa conta de caixa com estorno sem nenhum erro
  de classificação (skill `fluxo-de-caixa-conventions`, regra 1; issue #66). Contrato redefinido:
  `ColunaDFC.caixaInicial`/`caixaFinal` = Σ `saldoAtual` das contas mapeadas a rubricas `CAIXA` **nos mesmos
  balancetes** (mesmo filtro, mesmas datas) que alimentam `classificarVariacoes`, com o sinal pela natureza da
  conta (uma conta `CAIXA` CREDORA — um descoberto — entra negativa, coerente com `VariacaoClassificada`). As
  menções a `saldoContabilAte` passaram a proibições explícitas. Isto segue o ADR-0037 §6 (filtro dos mapas =
  `FILTRO_LANCAMENTO_MAPA`); **a letra da E2 («`saldoCaixa(d)` = soma de `saldoContabilAte(d)`…») precisa de uma
  errata humana** — o ADR não foi editado por este nó.
- **m1** — `SeccoesDFC.variacaoCaixa` → **`somaAtividades`** (OP + INV + FIN, o lado esquerdo). `variacaoCaixa`
  fica só em `ColunaDFC` (`caixaFinal − caixaInicial`, o lado direito). `details` de `DFC_NAO_ARTICULA` alinhado:
  `{ delta, somaAtividades, variacaoCaixa }`, `delta = somaAtividades − variacaoCaixa`.
- **m2** — `versaoAtual()` a devolver `null` (tenant sem seed do mapeamento) é, em `gerarDFC`, um
  **impedimento** («Mapeamento da DFC não semeado»), com `contasNaoMapeadas: []` — padrão §4, não erro. Está na
  JSDoc de `IDfcService` (passo 2) e de `versaoAtual`.
- **m3** — Parágrafo de I10 acrescentado: as FKs da 22b **não são tenant-scoped**; `mapearConta`,
  `definirContasCaixa`, `criarRubrica`/`editarRubrica` e qualquer escrita que receba `contaId`/`rubricaId`
  resolvem-nos por `findFirst({ where: { id, tenantId } })` → `NotFoundError` antes de escrever.
- **m4** — **Caminho do E2E 10.1 («desmapear uma conta com movimento»)**: retirar uma conta de caixa com movimento
  do conjunto via `definirContasCaixa` (as que saem ficam SEM mapeamento, por contrato) — nunca um `DELETE`
  directo em `MapeamentoContaFluxo`. **Proposta, não implementada, para o orquestrador decidir**: uma operação
  explícita `desmapearConta(contaId, ctx)` (escrita singular, `NotFoundError` cross-tenant, cria a versão n+1)
  daria ao E2E um caminho para desmapear uma conta que **não** seja de caixa (ex.: uma conta de clientes), o que
  exercita o impedimento I7 numa actividade e não só na caixa. Custo: uma action e uma linha «Desmapear» na UI de
  rubricas. Sem ela, o E2E fica preso à caixa (e o impedimento que vê é o da E2 «nenhuma conta CAIXA»/I7 da
  conta que saiu — ambos válidos). Não a acrescentei ao contrato.

## O que o nó `oraculos` assume (nomes que os três ficheiros de teste podem importar)

De `validations/fluxo-caixa.ts`: `FiltroDFCInput`, `MapearContaInput`, `CriarRubricaInput`, `EditarRubricaInput`,
`DefinirContasCaixaInput`, `ValidarVersaoInput`, e os enums Zod (`AtividadeFluxoEnum`, `AtividadeSeccaoEnum`,
`SinalFluxoEnum`, `OrigemRubricaEnum`, `EstadoVersaoMapeamentoEnum`) com os tipos homónimos.

De `dfc.interface.ts` (só `import type`, excepto `ERROS_DFC` e `temImpedimentos`):
`ERROS_DFC`, `RubricaFluxoCaixa`, `MapeamentoContaFluxo`, `VersaoMapeamentoFluxo`, `InstantaneoMapeamento`,
`RubricaInstantaneo`, `MapeamentoInstantaneo`, `ContaNaoMapeada`, `AvisoConfiguracao`, `CodigoAvisoConfiguracao`,
`ImpedimentosDFC`, `VariacaoClassificada`, `RubricaResumo`, `MapaConta`, `LinhaRubricaDFC`, `SeccaoDFC`,
`SeccoesDFC`, `PeriodoRef`, `ColunaDFC`, `DFC`, `ResultadoDFC`, `temImpedimentos`, `ContaCaixaInfo`, e os
tipos de função `ClassificarVariacoesFn`, `MontarSeccoesDFCFn`, `VerificarArticulacaoFn`,
`VerificarMesmoExercicioFn`, `PeriodoHomologoFn`, `CoerenciaContasCaixaFn`, `InstantaneoDeFn`, `MudouFn`,
`IDfcService`.

Módulos que **ainda não existem** (é por eles que os oráculos devem falhar, e só por eles):

- `dfc.model.ts` → `classificarVariacoes`, `montarSeccoesDFC`, `verificarArticulacao`, `periodoHomologo`,
  `verificarMesmoExercicio`, `coerenciaContasCaixa` (assinaturas: os `*Fn` acima).
- `mapeamento-versao.model.ts` → `instantaneoDe`, `mudou`.
- `dfc.service.ts` → `IDfcService`.

Detalhes de contrato que os oráculos devem exercitar:

- `verificarArticulacao(seccoes, variacaoCaixa)` compara `seccoes.somaAtividades` com o `variacaoCaixa` recebido
  (`ColunaDFC.variacaoCaixa` = `caixaFinal − caixaInicial`) por `Decimal.equals`; lança `BusinessRuleError` com
  `code === ERROS_DFC.DFC_NAO_ARTICULA` e `details: { delta, somaAtividades, variacaoCaixa }` em strings
  decimais, `delta = somaAtividades − variacaoCaixa`.
- `caixaInicial`/`caixaFinal` são Σ `saldoAtual` das contas `CAIXA` nos mesmos balancetes que entram em
  `classificarVariacoes` (sinal pela natureza) — um gerador de I6 que inclua um estorno numa conta de caixa tem de
  continuar a articular; um que use `saldoContabilAte` de um lado é o defeito do M2.
- `classificarVariacoes` devolve `{ variacoes, naoMapeadas }`: uma conta sem entrada em `mapa` NÃO é silenciada
  nem lançada — sai em `naoMapeadas` para o serviço a converter em impedimento.
- `montarSeccoesDFC` exclui `CAIXA` das três secções; `operacional.total` inclui `resultadoLiquido`;
  `somaAtividades` = Σ dos três totais.
- `gerarDFC` num tenant sem versão (`versaoAtual` = `null`) devolve `ImpedimentosDFC` com o impedimento
  «Mapeamento da DFC não semeado» e `contasNaoMapeadas: []` — não lança.
- `periodoHomologo` casa por `ordem` nos períodos do exercício anterior e devolve `null` sem exercício anterior
  ou sem algum dos dois homólogos (nunca um parcial).
- `verificarMesmoExercicio` lança `DFC_ENTRE_EXERCICIOS` (exercícios diferentes) e `DFC_INTERVALO_INVERTIDO`
  (`fim.ordem < inicio.ordem`).
- `coerenciaContasCaixa([])` ⇒ um impedimento; conta fora da `CLASSE_1`, com `aceitaLancamento: false` ou
  `ativo: false` ⇒ um aviso por motivo, com `codigo` em `CodigoAvisoConfiguracao`.
- `mudou(null, x)` é `true`; `mudou(x, x')` com as mesmas entradas por outra ordem é `false`.

## O que o nó `seed` vai encontrar

- `provisionamento-integracao.test.ts` (`limpar()`) apaga `ContaPGC` por nível com `deleteMany`. Depois de o
  bootstrap semear `MapeamentoContaFluxo` (FK `RESTRICT` para `ContaPGC`), esse `limpar` tem de apagar primeiro
  `MapeamentoContaFluxo`, `VersaoMapeamentoFluxo` e `RubricaFluxoCaixa` do tenant. É consequência directa da
  decisão 1; fica aqui para não ser surpresa.
- `RubricaFluxoCaixa` tem `deletedAt` ⇒ entra sozinha em `SOFT_DELETE_MODELS` (derivado do DMMF): `findMany`
  já filtra as apagadas. Os três modelos têm `tenantId` ⇒ `TENANT_MODELS` automático.
- A `22c` (INSERT … ON CONFLICT DO NOTHING) apoia-se em `@@unique([tenantId, codigo])` para rubricas e
  `@@unique([tenantId, contaId])` para mapeamentos, e em `@@unique([tenantId, numero])` para a versão 1.

## Estado da árvore (para o orquestrador)

- O ramo vinha vermelho no `tsc` por dois imports perdidos em `compras.ts` no merge `92b1fbc` (achado deste nó);
  **corrigido pelo orquestrador em `13c64c2`**. Depois da FIX: `npx tsc --noEmit -p .` → **0 erros**;
  `npx eslint` nos dois ficheiros novos → limpo.
- ⚙ `22b` aplicada: `apps/erp/prisma/migrations/20260925155120_22b_rubricas_fluxo_caixa`.

A base local tem o compromisso manual «Pagamento da Internet» (ver `dfc-adr.md`): o `projecao.golden.test.ts`
continua vermelho só por resíduos, como antes.

## Fora deste nó

- Errata humana ao ADR-0037 E2 (`saldoContabilAte` → «saldo nos balancetes com `FILTRO_LANCAMENTO_MAPA`», M2).
- Decisão sobre `desmapearConta` (m4) antes do nó `e2e-v`.
- Nenhum serviço, action, UI, seed ou permissão. Nenhum ficheiro de `__tests__/` ou `fixtures/` tocado.
- O nome `resultadoLiquido` vs `lucroLiquido` no ADR é cosmético; não se emendou o ADR (acto humano).
