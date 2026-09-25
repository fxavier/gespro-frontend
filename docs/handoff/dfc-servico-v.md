# Handoff — grafo `dfc`, nó `servico-v` (ticket 5.3)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `servico`
- **Depende de**: `seed` (FEITO — [`dfc-seed.md`](dfc-seed.md); base deste nó `496481e`)
- **Agente**: `verificador-fluxo-caixa`. Nenhum código de produção. A base local **não** foi escrita: só `SELECT`s
  e leituras pelos serviços de balancete e DRE.
- **Gate do nó**: os dois ficheiros de teste falham **só** por `Cannot find module '../dfc.service'` ✅ ·
  `tsc --noEmit` só com os dois `TS2307` desse import ✅ · `eslint` limpo ✅ · a fixture foi derivada à mão e
  **articula** ✅ · satisfazível por uma referência descartável e discriminante contra 9 mutantes (ver abaixo) ✅.

## Entregue (ficheiros PROTEGIDOS a partir deste nó)

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/services/financas/__tests__/fixtures/dfc-seed-demo.json` | Golden: sentinelas do seed + 3 casos (2026-09 · 2026-01..09 · 2026-04..06) + os números do impedimento. |
| `apps/erp/src/server/services/financas/__tests__/dfc.golden.test.ts` | Golden ao cêntimo (3 casos), I7 sobre o seed (`contasNaoMapeadas` vazia), **I9** exaustivo (91 intervalos), **I10** cross-tenant ⇒ `NotFoundError` (×3), V4 `DFC_INTERVALO_INVERTIDO`, o 13.º período sozinho. Contra a base local. |
| `apps/erp/src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts` | **I7** (impedimento com a lista completa + `[property]` 1000 corridas), E2 (sem conta CAIXA), «Mapeamento da DFC não semeado», **I10** (linhas de outro tenant; rubrica alheia por FK), **V4** `DFC_ENTRE_EXERCICIOS` (×2), **I9** que TEM de lançar (DRE ± 0,01 ⇒ `DFC_NAO_ARTICULA`). Contra o duplo de leitura. |
| `apps/erp/src/server/services/financas/__tests__/helpers/dfc-golden.ts` | Sentinelas («a base tem resíduos»), comparador `Decimal.equals` da coluna, resolução código→id. |
| `apps/erp/src/server/services/financas/__tests__/helpers/duplo-leitura-dfc.ts` | Duplo de leitura sobre `@/server/db/client` (ver «O duplo»). |

A lista do grafo («`dfc-seed-demo.json` e os testes de I9/I10») passa a ser, em concreto, estes **cinco** ficheiros.
Verificação do orquestrador depois do `servico`:

```bash
git diff --stat <commit deste nó>..HEAD -- \
  apps/erp/src/server/services/financas/__tests__/dfc.golden.test.ts \
  apps/erp/src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts \
  apps/erp/src/server/services/financas/__tests__/fixtures/dfc-seed-demo.json \
  apps/erp/src/server/services/financas/__tests__/helpers/dfc-golden.ts \
  apps/erp/src/server/services/financas/__tests__/helpers/duplo-leitura-dfc.ts
```

## O que o autor do `servico` tem de cumprir

### Assinatura exacta que os testes importam

```ts
// apps/erp/src/server/services/financas/dfc.service.ts
export async function gerarDFC(filtro: FiltroDFCInput, ctx: Ctx): Promise<ResultadoDFC>;
export async function contasNaoMapeadas(filtro: FiltroDFCInput, ctx: Ctx): Promise<ContaNaoMapeada[]>;
```

Exportações **nomeadas** do módulo `../dfc.service` (um objecto `dfcService` pode existir também, mas os testes
importam as funções soltas). Os testes ligam-nas ao contrato
(`const gerarDFC: IDfcService['gerarDFC'] = gerarDFCImpl`): uma assinatura divergente é erro de `tsc` no oráculo.
Correm dentro de `runWithTenantContext(ctx, …)`.

### Comportamento que os testes fixam

1. **Golden** (3 casos, tabela abaixo): cada `ColunaDFC` ao cêntimo — `resultadoLiquido`, total de cada secção,
   rubricas **com contas que pesam** (OP-04, OP-05, OP-06; INV e FIN vazias), cada conta com `saldoInicial`,
   `saldoFinal`, `variacao`, `efeitoCaixa`, e `somaAtividades`, `caixaInicial`, `caixaFinal`, `variacaoCaixa`.
   Mais: `exercicio.codigo = '2026'`, `periodoInicio.id`/`periodoFim.id` dos períodos pedidos, `homologo: null`
   (não há 2025), `provisorio: true` (13 períodos `ABERTO`), `versao = { id da versão 1 do demo, numero 1,
   estado 'PENDING' }`, `avisos: []`. A ordem das rubricas e das contas **não** é asserida (os testes ordenam).
2. **Balancetes**: saldo acumulado desde sempre até à **véspera** do início (`dataInicio − 1 ms`) e até ao
   `dataFim` do período final, com `FILTRO_LANCAMENTO_MAPA`. `caixaInicial`/`caixaFinal` = `saldoCaixaDe` desses
   mesmos balancetes (nunca Σ `saldoAtual`, nunca `saldoContabilAte`).
3. **I9**: `resultadoLiquido` é o `lucroLiquido` de **`gerarDRE`** chamada com `{ dataInicio:
   periodoInicio.dataInicio, dataFim: periodoFim.dataFim }` (instantes exactos). O teste envolve `gerarDRE` de
   `../contabilidade.service` (e `contabilidadeService.gerarDRE`): se a DRE devolver ±0,01, `gerarDFC` **tem de**
   lançar `DFC_NAO_ARTICULA` com `details.delta` `'0.01'`/`'-0.01'`. Um resultado calculado à parte — mesmo que
   igual — é apanhado aqui (mutante `resultadoProprio`, abaixo).
4. **I9 exaustivo**: nos 91 intervalos `i ≤ j` do exercício (inclui 2026-10 com o resíduo manual 123/6981 e o
   13.º), o mapa sai, articula, e `resultadoLiquido == DRE.lucroLiquido`; `operacional.total = resultado + Σ linhas`.
5. **I7**: com 411, 421, 44331, 711 e 131 sem mapeamento, em 2026-09 ⇒ `ImpedimentosDFC` sem `atual`,
   `homologo`, `seccoes` nem `versao`; `contasNaoMapeadas` **exactamente** as 4 com movimento (131 fora), com
   `conta.id` do demo, `movimento` = Δ do saldo pela natureza **no intervalo**, `saldoFinal` = saldo acumulado a
   30/09 pela natureza; cada código aparece em pelo menos uma frase de `impedimentos`. `contasNaoMapeadas(filtro)`
   devolve a mesma lista. A `[property]` generaliza: subconjunto qualquer de 12 contas × 44 intervalos.
6. **E2**: sem nenhuma conta mapeada a `CAIXA` ⇒ pelo menos 2 impedimentos (a conta 121 e o de caixa). Desmapear só
   111/122/123 (sem movimento) **não** impede: o mapa sai igual à golden.
7. **Sem versão** ⇒ `ImpedimentosDFC` com uma frase que contém «Mapeamento da DFC não semeado», `contasNaoMapeadas:
   []`, sem lançar.
8. **I10**: períodos de outro tenant (ou inexistentes) ⇒ `NotFoundError`, em `gerarDFC` e em `contasNaoMapeadas`,
   **antes** de qualquer impedimento. Linhas de outro tenant (rubrica, versão 99 `VALIDATED`, mapeamento da 411 do
   demo) nunca entram. Um mapeamento do **próprio** demo que aponte para uma rubrica de outro tenant (a FK da 22b
   deixa) ⇒ a conta conta como **não mapeada** (impedimento só com 411), nunca a rubrica alheia, nunca um 500.
9. **V4**: `DFC_ENTRE_EXERCICIOS` nos dois sentidos (2025-12→2026-01 e 2026-01→2025-12);
   `DFC_INTERVALO_INVERTIDO` em 2026-09→2026-04; um só período (incluindo o 13.º) é válido.
10. `gerarDFC` **não escreve** — o duplo lança em qualquer `create/update/upsert/delete/*Many/$executeRaw`.

### O duplo (e o que ele exige da forma das leituras)

`dfc.impedimentos-isolamento.test.ts` faz `vi.mock('@/server/db/client')` e envolve `prisma` e `prismaBase`. Todas
as leituras vão à base real; o cenário activo altera só o **resultado**. Para o duplo conseguir simular os estados,
o serviço lê:

- o mapeamento por um delegado (`mapeamentoContaFluxo.*`, ou `include`/`select` a partir de `ContaPGC` ou
  `RubricaFluxoCaixa`) com `contaId` e `rubricaId` nas linhas (se as tirar do `select`, o duplo recusa com uma
  mensagem explícita — não passa em silêncio);
- se usar SQL cru, as colunas com os nomes do modelo (`contaId`, `rubricaId`; `numero`/`estado`/`instantaneo`).
  Limite conhecido: no cenário `linhasAlheias` o SQL cru **não** recebe linhas do outro tenant — um `$queryRaw` sem
  `WHERE "tenantId"` não é apanhado por este teste (fica para o revisor);
- «com âmbito de tenant» = cliente `prisma` numa operação da `INJECT_WHERE` (a extensão escopa), ou `tenantId` do
  demo explícito no `where`. `findUnique` e `prismaBase` só ficam escopados pelo `where`.

Se o duplo recusar uma forma de consulta legítima, **não** se altera o duplo no nó do autor: descreve-se a consulta e
escala-se ao verificador.

## Golden — derivação à mão

**Estado do seed** (`pnpm db:seed` de 2026-09-23, tenant `demo`; sentinelas em `sentinelasDoSeed`): um exercício,
2026, sem anterior; 13 períodos `ABERTO`; nada antes de 01/01/2026; 217 lançamentos `LANCADO` de 2026-01 a 2026-09
(nenhum `ESTORNADO`); versão 1 `PENDING`, 19 rubricas, 435 mapeamentos; CAIXA = 111, 121, 122, 123 (todas classe 1,
folha, activas ⇒ `avisos: []`).

**Contas com movimento** até 30/09 (`LANCADO`+`ESTORNADO`), com a rubrica semeada:

| Conta | Natureza | Tipo | Rubrica | Actividade | Σ D (01–09) | Σ C (01–09) |
|---|---|---|---|---|---|---|
| 121 Depósitos à ordem | DEVEDORA | ATIVO | CX-01 | CAIXA | 4 624 081,20 | 388 100,00 |
| 411 Clientes c/c | DEVEDORA | ATIVO | OP-04 | OPERACIONAL | 5 719 271,84 | 4 624 081,20 |
| 421 Fornecedores c/c | **DEVEDORA** | ATIVO | OP-05 | OPERACIONAL | 388 100,00 | 1 713 650,00 |
| 44331 IVA liquidado | **DEVEDORA** | ATIVO | OP-06 | OPERACIONAL | 0 | 704 113,84 |
| 6112 CMV mercadorias | DEVEDORA | GASTO | OP-00 | OPERACIONAL (no RL) | 944 950,00 | 0 |
| 63299 Outros FSE | DEVEDORA | GASTO | OP-00 | OPERACIONAL (no RL) | 768 700,00 | 0 |
| 711 Vendas mercadorias | CREDORA | RENDIMENTO | OP-00 | OPERACIONAL (no RL) | 0 | 5 015 158,00 |

(Movimento por período em `sentinelasDoSeed.movimentoPorPeriodo`; por conta e período no SQL do INSPECT.)

**Regra aplicada** (método indirecto; a do núcleo, reescrita à mão): saldo pela natureza (`D − C` numa DEVEDORA);
`variacao = saldoFinal − saldoInicial`; `efeitoCaixa = −variacao` numa DEVEDORA fora de CAIXA (e `+variacao` numa
CREDORA). 421 e 44331 estão DEVEDORAS no seed com saldo **negativo**: o aumento do saldo credor (Δ negativo)
**liberta** caixa — sinal positivo, conta a conta. Classes 6/7 não pesam em linha: estão no `resultadoLiquido`
(`lucroLiquido` da DRE). CAIXA fica fora das secções: `caixa = saldoCaixaDe(121+111+122+123)`.

### Caso 1 — mês 2026-09

Véspera 31/08 (`2026-08-31T21:59:59.999Z`), fim 30/09 (`2026-09-30T21:59:59.999Z`).

| Conta | Rubrica | saldoInicial | saldoFinal | variacao | efeitoCaixa |
|---|---|---|---|---|---|
| 411 | OP-04 | 1 063 029,64 | 1 095 190,64 | +32 161,00 | **−32 161,00** |
| 421 | OP-05 | −603 500,00 | −1 325 550,00 | −722 050,00 | **+722 050,00** |
| 44331 | OP-06 | −658 550,00 | −704 113,84 | −45 563,84 | **+45 563,84** |
| 121 | CX-01 | 4 027 874,36 | 4 235 981,20 | +208 106,84 | (caixa) |

DRE 01/09–30/09: receita 711 = 314 704,00; CMV 6112 = 413 550,00; FSE 63299 = 428 500,00 ⇒ **RL = −527 346,00**.
OP = −527 346,00 − 32 161,00 + 722 050,00 + 45 563,84 = **208 106,84**; INV = FIN = 0.
Δcaixa = 4 235 981,20 − 4 027 874,36 = **208 106,84** ⇒ **articula**.
Partida dobrada de Setembro (controlo): 208 106,84 + 32 161,00 − 722 050,00 − 45 563,84 + 413 550,00 + 428 500,00 −
314 704,00 = 0.

### Caso 2 — exercício até à data 2026-01..2026-09

Véspera 31/12/2025: balancete vazio ⇒ todos os `saldoInicial` = 0 e caixaInicial = 0.

| Conta | Rubrica | saldoFinal = variacao | efeitoCaixa |
|---|---|---|---|
| 411 | OP-04 | 1 095 190,64 | −1 095 190,64 |
| 421 | OP-05 | −1 325 550,00 | +1 325 550,00 |
| 44331 | OP-06 | −704 113,84 | +704 113,84 |
| 121 | CX-01 | 4 235 981,20 | (caixa) |

RL = 5 015 158,00 − 944 950,00 − 768 700,00 = **3 301 508,00** (a 6981 só tem movimento em 2026-10).
OP = 3 301 508,00 − 1 095 190,64 + 1 325 550,00 + 704 113,84 = **4 235 981,20** = Δcaixa (0 → 4 235 981,20) ⇒
**articula**.

### Caso 3 — trimestre 2026-04..2026-06 (abertura não nula; 421 sem saldo na véspera)

| Conta | Rubrica | saldoInicial (31/03) | saldoFinal (30/06) | variacao | efeitoCaixa |
|---|---|---|---|---|---|
| 411 | OP-04 | 475 725,08 | 993 560,14 | +517 835,06 | −517 835,06 |
| 421 | OP-05 | 0 (ausente) | −82 100,00 | −82 100,00 | +82 100,00 |
| 44331 | OP-06 | −227 729,28 | −442 404,68 | −214 675,40 | +214 675,40 |
| 121 | CX-01 | 1 325 889,20 | 2 454 248,29 | +1 128 359,09 | (caixa) |

RL = 1 511 518,75 − 152 300,00 − 9 800,00 = **1 349 418,75**.
OP = 1 349 418,75 − 517 835,06 + 82 100,00 + 214 675,40 = **1 128 359,09** = Δcaixa ⇒ **articula**.

### Impedimentos (2026-09; desmapeadas 131, 411, 421, 44331, 711)

`movimento` = Δ do saldo pela natureza em Setembro; `saldoFinal` a 30/09: 411 +32 161,00 / 1 095 190,64 ·
421 −722 050,00 / −1 325 550,00 · 44331 −45 563,84 / −704 113,84 · 711 (CREDORA, C − D) +314 704,00 /
5 015 158,00. 131 nunca teve movimento ⇒ fora da lista.

### Conferência independente

Os números acima foram conferidos contra `gerarBalancete` (acumulado desde 2000 até à véspera e até ao fim) e
`gerarDRE` dos três intervalos, por um script `tsx` só de leitura (apagado), e contra SQL directo sobre
`PartidaLancamento` por conta e período. Os três bateram ao cêntimo. Nenhum número veio de `gerarDFC`.

### Porque estes intervalos

- **2026-09** — o mês completo mais recente; tem movimento em todas as 7 contas e um `RASCUNHO` (15/09) que o
  `FILTRO_LANCAMENTO_MAPA` tem de deixar de fora.
- **2026-01..2026-09** — o exercício até à data (hoje 2026-09-26); abertura zero.
- **2026-04..2026-06** — abertura não nula e uma conta (421) que só existe num dos balancetes (saldo 0 do outro
  lado) — o caso de «presente num só lado» do contrato.
- **N-1**: não há exercício 2025 ⇒ `homologo: null` em todos. O comparativo com valores só é testável com um
  exercício anterior no seed — fica por cobrir (ver «Fora»).

## Resíduos da base local e a DFC

- **Compromisso «Pagamento da Internet»**: compromissos não são lançamentos e a DFC não lê
  `CompromissoTesouraria`. **Não afecta a DFC** — as sentinelas desta golden não os contam.
- **Lançamentos MANUAL de 2026-09-23/24** (resíduos de E2E): 2026-10-31 `LANCADO` 123/6981 350,00 e dois `RASCUNHO`
  (15/09 e 30/10). Os `RASCUNHO` ficam fora do filtro. O de 2026-10 fica fora dos três intervalos da golden (fim a
  30/09) e as sentinelas só cobrem 2026-01..09 — por isso não os acusam. O teste I9 exaustivo passa por 2026-10 e
  compara com a DRE ao vivo, não com a fixture: não depende deles.
- `projecao.golden.test.ts` continua vermelho só pelo compromisso manual (e é alheio a este nó).

## Saída vermelha (gate do nó)

`cd apps/erp && npx vitest run` sobre os dois ficheiros:

```
 RUN  v4.1.10 /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc/apps/erp
 ❯ src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts (0 test)
 ❯ src/server/services/financas/__tests__/dfc.golden.test.ts (0 test)
⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/server/services/financas/__tests__/dfc.golden.test.ts [ src/server/services/financas/__tests__/dfc.golden.test.ts ]
Error: Cannot find module '../dfc.service' imported from /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc/apps/erp/src/server/services/financas/__tests__/dfc.golden.test.ts
 ❯ src/server/services/financas/__tests__/dfc.golden.test.ts:26:1
 FAIL  src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts [ src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts ]
Error: Cannot find module '/src/server/services/financas/dfc.service' imported from /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc/apps/erp/src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts
 ❯ src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts:55:1
 Test Files  2 failed (2)
      Tests  no tests
```

`npx tsc --noEmit -p .` (só estes dois; nenhum outro erro):

```
src/server/services/financas/__tests__/dfc.golden.test.ts(29,8): error TS2307: Cannot find module '../dfc.service' or its corresponding type declarations.
src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts(58,8): error TS2307: Cannot find module '../dfc.service' or its corresponding type declarations.
```

`npx eslint` sobre os dois testes e `helpers/`: limpo (exit 0).

## Prova de que o oráculo é satisfazível e discriminante (fora do repositório)

Um oráculo que só falha por import não prova que uma solução correcta o passa. Escrevi uma **referência
descartável** de `gerarDFC`/`contasNaoMapeadas` (sobre o núcleo `dfc.model.ts`, `gerarBalancete` e `gerarDRE`),
ligada por um `vitest.config` de alias, corri os dois ficheiros contra ela e contra mutantes, e apaguei os dois
ficheiros (`git status` limpo fora dos cinco entregues). Não é código para o `servico` copiar.

| Implementação | Resultado |
|---|---|
| referência correcta | **23/23 verdes** (11 golden + 12 duplo, a `[property]` de 1000 corridas incluída) em ~25 s |
| períodos por `findUnique({ where: { id } })` sem tenant | 2 mortas: I10 `NotFoundError` em `gerarDFC` e em `contasNaoMapeadas` |
| mapeamento com `include: { rubrica: true }` (FK seguida) | 1 morta: I10 rubrica alheia |
| versão por `prismaBase.findFirst` sem tenant | 1 morta: I10 linhas alheias (versão 99 entrou) |
| rubricas **e** mapeamentos por `prismaBase` sem tenant | 1 morta: I10 linhas alheias (`operacional.total` 240 267,84 ≠ 208 106,84) |
| resultado calculado dos balancetes em vez de `gerarDRE` (igual no seed) | 2 mortas: I9 ± 0,01 |
| só a primeira conta não mapeada nos impedimentos | 2 mortas: I7 exemplo e `[property]` |
| sem o impedimento «nenhuma conta CAIXA» | 2 mortas: `[property]` e E2 |
| «não semeado» a lançar em vez de impedimento | 1 morta |
| sem `verificarMesmoExercicio` | 3 mortas: V4 ×2 e `INTERVALO_INVERTIDO` |

Mutante **equivalente** registado: mapeamentos por `prismaBase` sem tenant mas rubricas escopadas sobrevive — o
mapeamento alheio aponta para uma rubrica que o serviço nunca encontra, e nada entra. Não é fuga observável; o
revisor deve apontá-lo na mesma (é código frágil).

## Decisões deste oráculo (além da letra do contrato) — para o orquestrador

1. **Rubrica de outro tenant via FK ⇒ conta não mapeada (impedimento).** O contrato não diz o que fazer quando o
   mapeamento do próprio tenant aponta para uma rubrica alheia. As alternativas eram piores: a rubrica alheia a
   entrar (viola I10), um `ValidationError` de `montarSeccoesDFC` (500 ao utilizador) ou a conta a desaparecer
   (viola I7). Se o orquestrador preferir outra, é decisão sobre I10, não uma mudança ao teste pelo autor.
2. **«Com movimento»**: a `[property]` de I7 só usa intervalos em que toda a conta com saldo na véspera também tem
   movimento no intervalo (sai 2026-07 sozinho, por causa da 63299). O contrato fala em «conta com movimento»; o
   núcleo devolve em `naoMapeadas` também as contas com saldo e movimento zero. Não legislo sobre isso — fica em
   aberto para o `servico`/revisor.
3. **Frases dos impedimentos**: só se exige que cada código apareça numa frase, e «Mapeamento da DFC não semeado»
   como substring. Com zero CAIXA, pelo menos duas frases.
4. **Sentinelas estreitas**: cobrem só o que os números da fixture usam (movimento até 2026-09, estado dos períodos,
   exercícios, mapeamento). Um lançamento novo em 2026-01..09, um período fechado ou uma alteração ao mapeamento
   dão «a base tem resíduos»; os resíduos de 2026-10 não, porque não mudam nenhum número da fixture.

## Fora deste nó

- N-1 com valores: o seed não tem exercício anterior. O `periodoHomologo` está coberto no núcleo; ao nível do
  serviço, só `homologo: null`. Precisa de um exercício 2025 no seed (ou de um duplo mais fundo) — decisão do
  orquestrador.
- Conta CAIXA CREDORA (descoberto): o seed não tem; coberto por `dfc-saldo-caixa.test.ts` (acessório do `nucleo`).
- Errata humana ao ADR-0037 E2 (`saldoContabilAte` → saldos dos mesmos balancetes), pendente desde o `contratos`.
- Nenhum código de produção, nenhuma escrita na base, grafo não marcado.
