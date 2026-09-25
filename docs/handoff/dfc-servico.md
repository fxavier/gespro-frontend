# Handoff — grafo `dfc`, nó `servico` (tickets 5.1 e 5.2)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `fatia`
- **Depende de**: `servico-v` (FEITO — [`dfc-servico-v.md`](dfc-servico-v.md); base do oráculo `49588cd`, HEAD `1cecdff`)
- **Agente**: `feat-dfc`, worktree `wt/feat-dfc` (ramo `ws-2-dfc`). Sem commit, sem migração, sem escrita na base.
- **Gate do ticket 5**: golden ao cêntimo ✅ · a DFC do seed articula (3 casos + 91 intervalos I9) ✅ · desmapear
  no duplo ⇒ impedimentos e nenhum mapa (exemplo + `[property]` 1000 corridas) ✅ · os dois oráculos verdes **sem
  alterações** (23/23) ✅ · `tsc` 0 ✅ · `pnpm check` com o único vermelho aceite (`projecao.golden`,
  `compromissosManuais` 1 vs 0) ✅ · `pnpm gates` 5/5, `gate-periodo` a zero ✅.
- **Voltas**: 1 (verde à primeira no oráculo; o teste acessório teve uma correcção de içamento do `vi.mock`).

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/services/financas/dfc.service.ts` | `gerarDFC(filtro, ctx)`, `contasNaoMapeadas(filtro, ctx)` (exportações nomeadas, com as assinaturas do `IDfcService`) e `dfcService = { gerarDFC, contasNaoMapeadas }`. `import 'server-only'`. Só leitura. |
| `apps/erp/src/server/services/financas/__tests__/dfc-servico-homologo.test.ts` | **Acessório** (ficheiro novo, fora dos protegidos, sem base): coluna N-1 com valores, `homologo: null` sem exercício anterior, `provisorio` false com tudo FECHADO, conta não mapeada que só se move no N-1 ⇒ impedimento, conta com saldo e sem movimento ⇒ não impede. Usa um duplo em memória de `@/server/db/client`; `gerarBalancete`/`gerarDRE` são refeitas sobre um razão em memória com as funções puras REAIS (`montarLinhasBalancete`, `calcularLinhasDRE`). |

`dfc.interface.ts`, `dfc.model.ts`, `mapeamento-versao.model.ts` e `contabilidade.service.ts`: **não tocados**.
Nenhum ficheiro protegido tocado: `git diff --stat 49588cd..HEAD -- apps/erp/src/server/services/financas/__tests__/ apps/erp/src/server/provisioning/__tests__/tenant-bootstrap.test.ts` vazio, e o `git status` só tem os dois ficheiros novos.

## Ordem de `gerarDFC` (design §4.2 + ticket 5.1)

1. **Períodos**: `periodoContabil.findFirst({ where: { id, tenantId } })` para cada um (nunca `findUnique`): inexistente
   ou de outro tenant ⇒ `NotFoundError` (404), **antes** de qualquer impedimento. Depois `verificarMesmoExercicio`
   (V4: `DFC_ENTRE_EXERCICIOS` antes de `DFC_INTERVALO_INVERTIDO`), e o exercício, também com `tenantId`.
2. **Versão** mais recente (`findFirst`, `orderBy numero desc`). `null` ⇒ `ImpedimentosDFC` com
   «Mapeamento da DFC não semeado…», `contasNaoMapeadas: []`, `avisos: []`, e pára (sem lançar).
3. **Configuração**: rubricas (`deletedAt: null`) e mapeamentos (`select { contaId, rubricaId }`), ambos com
   `tenantId` explícito e pelo cliente `prisma`. O `MapaConta` só aceita rubricas **da lista do próprio tenant**; as
   mesmas rubricas vão para `montarSeccoesDFC`. `coerenciaContasCaixa` sobre as contas mapeadas a `CAIXA`.
4. **Homólogo** por `periodoHomologo` sobre os períodos do `anteriorId` (lidos com `tenantId`); `null` se não houver.
5. **Saldos**, por coluna, com `gerarBalancete` (que usa `FILTRO_LANCAMENTO_MAPA`): acumulado desde sempre até
   `dataInicio − 1 ms`, acumulado até `periodoFim.dataFim`, e o balancete **do intervalo** (decide «com movimento»).
6. **Impedimentos**, todos de uma vez: uma frase por conta não mapeada com movimento (N e, havendo, N-1) + os da
   coerência de caixa. Havendo algum ⇒ `ImpedimentosDFC` (sem `atual`, `homologo`, `seccoes` nem `versao`) e pára.
7. **Coluna** (N, depois N-1): `gerarDRE({ dataInicio: periodoInicio.dataInicio, dataFim: periodoFim.dataFim })` →
   `classificarVariacoes` → `montarSeccoesDFC(dre.lucroLiquido, …)` → `caixaInicial`/`caixaFinal` por `saldoCaixaDe`
   dos **mesmos** balancetes → `verificarArticulacao` (lança `DFC_NAO_ARTICULA` e o mapa não sai).
8. `provisorio` = existe período do intervalo N não `FECHADO` (`count` com `tenantId`); `versao` `{ id, numero, estado }`;
   `avisos` da coerência de caixa.

`gerarDRE` e `gerarBalancete` importam-se do módulo `./contabilidade.service` (é o que permite ao oráculo envolver
`gerarDRE`). Nada de `saldoContabilAte`, nada de `include` a seguir a FK para rubricas, nada de `prismaBase`.

## Decisões (para o revisor e o orquestrador)

1. **«Com movimento» = tem partidas no intervalo** (está no balancete do intervalo), e não «aparece em algum dos dois
   balancetes acumulados». Uma conta sem mapeamento com saldo e **sem** movimento no intervalo não é impedimento: a
   variação dela é zero e não mexe na articulação. As contas que `classificarVariacoes` devolve em `naoMapeadas`
   chegam à coluna só neste caso, e ignoram-se. Era a questão que o `servico-v` deixou em aberto (decisão 2); é o que
   o contrato diz («conta com movimento») e a `[property]` passa. Coberto pelo acessório.
2. **`contasNaoMapeadas(filtro)` inclui as contas que só se movem no comparativo N-1** (com os valores do homólogo),
   e `gerarDFC` também, com uma frase que diz «no comparativo N-1 (…)». Sem isto, uma conta desmapeada que só mexeu em
   2025 faria o N-1 lançar `DFC_NAO_ARTICULA` em vez de pedir o mapeamento. A lista das duas funções é a mesma, por
   código. Quando não há N-1 (todo o seed de hoje), é exactamente a lista do intervalo, como o contrato diz.
3. **Mapeamento para rubrica que o tenant não tem** (FK alheia, ou rubrica apagada) ⇒ conta **não mapeada**; a frase
   diz «está mapeada a uma rubrica que não existe neste tenant» e nunca inclui o id ou o código da rubrica alheia.
4. **Rubrica `ativo: false`** continua a classificar as contas que tem (só `deletedAt` a exclui). O contrato não diz o
   que a inactividade faz à DFC; excluí-la tornaria impedimento contas que estão mapeadas. **Pergunta para o
   `config`**: se desactivar uma rubrica com contas deve ser recusado, ou se a DFC deve tratá-la como não mapeada.
5. Frases de impedimento com o montante por `formatMZN` (servidor; não atravessa para o cliente como função).
6. `DESDE_SEMPRE = 0001-01-01Z` como início dos balancetes acumulados (o `servico-v` conferiu com 2000; não há
   lançamentos antes de 2026 no seed, e nenhum `Lancamento` pode ser anterior ao primeiro exercício).

## O que o nó `fatia` assume

- Importa `gerarDFC`/`contasNaoMapeadas` de `@/server/services/financas/dfc.service` (ou `dfcService`). O resultado é
  `ResultadoDFC`; discrimina com `temImpedimentos` (de `dfc.interface.ts` — é `server-only`: numa folha cliente, só
  `import type` e um `'impedimentos' in r` local, ou discriminar no Server Component).
- A action `gerarDFCAction` (`financas:fluxo-caixa:leitura`, `permiteEmLeitura: true`) devolve o resultado
  serializado pelo `createSafeAction` (Decimais → string). Um `BusinessRuleError` (`DFC_NAO_ARTICULA`,
  `DFC_ENTRE_EXERCICIOS`, `DFC_INTERVALO_INVERTIDO`) chega como erro da action com `code` e `details`; o
  `DFC_NAO_ARTICULA` traz `details.delta`, `somaAtividades`, `variacaoCaixa` em strings — é um defeito de mapeamento
  ou de dados, a UI mostra-o e não o esconde.
- `NotFoundError` para períodos de outro tenant: a página não precisa de o tratar se os períodos vêm de
  `listarPeriodos` do próprio tenant.
- `versao.estado === 'PENDING'` ⇒ faixa «Mapeamento por validar»; `provisorio` ⇒ marca «Provisório»; `homologo: null`
  ⇒ coluna N-1 com «—»; `avisos` ⇒ lista não bloqueante.
- Custo: 3 balancetes + 1 DRE por coluna (6 + 2 com N-1), todos agregados em SQL. Os dois oráculos (23 testes, com as 91
  DFC do I9 exaustivo e a `[property]` de 1000 corridas) correm em ~20 s contra a base local.

## Fora deste nó

- Actions, rotas, UI, permissões (`fatia`); escritas de configuração e versões (`config`); PDF (`export`).
- N-1 com valores **na base**: continua sem exercício 2025 no seed; coberto só pelo acessório (duplo em memória).
- Errata humana ao ADR-0037 E2 (`saldoContabilAte` → saldos dos mesmos balancetes), pendente desde o `contratos`.
- `projecao.golden.test.ts` continua vermelho só pelo resíduo manual (compromisso «Pagamento da Internet»); alheio.

## Decisões do orquestrador depois da revisão (code-reviewer: APROVAR COM NITS; PV: LIMPO)

- **MINOR-1 → nó `fatia`.** Hoje `ContaNaoMapeada` não diz se `movimento`/`saldoFinal` são do intervalo ou do N-1.
  A `fatia` acrescenta `comparativo: boolean` ao contrato (`dfc.interface.ts`), preenche-o no serviço e mostra-o
  na lista de impedimentos. A frase em `impedimentos` já os distingue.
- **MINOR-2 → nó `config` (regra obrigatória).** Recusar com `BusinessRuleError` desactivar (`ativo:false`) ou
  apagar uma rubrica que ainda tenha contas mapeadas. A alternativa é reatribuir as contas na mesma transacção. Com
  essa regra, o `gerarDFC` pode continuar a ler só `deletedAt: null`.
- **MINOR-3 → dívida registada para o ADR-0035.** Os limites são por data, e o período 13 coincide em data com o
  12. Quando houver lançamentos de encerramento, a DFC de Dezembro e a do exercício apanham-nos. Nessa altura,
  filtrar por `periodo.ordem` ou excluir a origem `ENCERRAMENTO`, nos balancetes e na DRE da DFC.
- **MINOR-4 → nó `fatia`.** A página chama só `gerarDFC`, que já traz `contasNaoMapeadas`; chamar as duas
  duplicaria as agregações. Poupar um balancete por coluna fica como optimização futura.
- **NITs** (texto da rubrica eliminada, `Error` de invariante em vez de 404, comparador, `formatMZN`): ficam para
  quem voltar a tocar em `dfc.service.ts`, por exemplo o `fatia` com o MINOR-1.
