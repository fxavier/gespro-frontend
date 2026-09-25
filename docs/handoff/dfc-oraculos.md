# Handoff — grafo `dfc`, nó `oraculos` (ticket 2)

- **Data**: 2026-09-25 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `nucleo`
- **Depende de**: `contratos` (FEITO — [`dfc-contratos.md`](dfc-contratos.md), base `a865604`)
- **Agente**: `verificador-fluxo-caixa`. Nenhum código de produção; nenhuma fixture (a golden é do `servico-v`).
- **Gate do nó**: os três ficheiros falham **só** por import em falta (`dfc.model` / `mapeamento-versao.model`) ✅ ·
  `tsc --noEmit` só com os três `TS2307` ✅ · `eslint` limpo nos três ✅.

## Entregue (os três ficheiros protegidos do ticket 2)

| Ficheiro | Invariante → teste |
|---|---|
| `apps/erp/src/server/services/financas/__tests__/dfc.property.test.ts` | **I6** `[property] OP + INV + FIN == Δcaixa …` (diário de partida dobrada gerado, natureza de 421/44331 gerada, conjunto de caixa gerado de {111, 121, 123, 129 CREDORA, 314 classe 3}, reatribuições de rubrica geradas); `[property] estorno numa conta de caixa: articula, e o mapa é o mesmo com e sem o par` (correcção M2); `[property] conta sem mapeamento sai em naoMapeadas` (I7 na parte pura); **TEM de lançar** ×3: delta de ±0,01/±0,001/qualquer cêntimo ⇒ `DFC_NAO_ARTICULA` com `details {delta, somaAtividades, variacaoCaixa}`; 1 000 000 000 000 000,01 vs …000 (onde `number` já não vê); de ponta a ponta com um cêntimo a mais na caixa. **I8** `[property] DFC(de..ate) == Σ DFC(m)` por actividade, por rubrica, no resultado e na soma (cada mês articula por si); `[property] o ano inteiro == Σ 12 meses com abertura (mês 0) não nula`; **TEM de lançar**: variação com actividade fora do enum em `montarSeccoesDFC`. **V4** `[property] exercícios diferentes ⇒ DFC_ENTRE_EXERCICIOS` (seja qual for a ordem); `[property] mesmo exercício, fim ≥ início ⇒ não lança` (inclui 1 período e o 13.º); **TEM de lançar** `[property] fim < início ⇒ DFC_INTERVALO_INVERTIDO`; fronteira Dez-2025 → Jan-2026 (e 13.º de 2025 → Jan-2026) é `ENTRE_EXERCICIOS`, não `INVERTIDO`. **periodoHomologo** `[property] mesma ordem em N-1`, com os dias civis em Africa/Maputo verificados por `Intl` (dia 1 → último dia do mês em N-1, 13.º = 31/12); `[property] null com null ou []`; `[property] anterior incompleto ⇒ null se faltar qualquer um dos dois` (nunca parcial); exemplo da emenda (2026-04..06 → 2025-04..06); 29 de Fevereiro (Fev-2025 → Fev-2024 até dia 29). |
| `apps/erp/src/server/services/financas/__tests__/mapeamento-versao.property.test.ts` | **V1** `[property] instantaneoDe == forma canónica` (rubricas não apagadas por `codigo`, só os 8 campos — `toEqual` recusa `tenantId`/datas; mapeamentos por `contaId`); `[property] indiferente à ordem`; `[property] rubrica apagada fica de fora`; vazio; serializável em JSON; **TEM de lançar** ×2: a mesma conta em dois mapeamentos; mapeamento para rubrica apagada ou inexistente. **V2** `[property] mudou(null, x) === true`; `[property] mudou(x, x′) === false` com x′ baralhado (e um instantâneo que chegue fora da ordem canónica); `[property] qualquer alteração de UM elemento é mudança` (designação, actividade, sinal, ordem, origem, activo, código, reatribuir, desmapear, mapear nova, apagar rubrica sem contas) com um **juiz independente** (forma canónica calculada pelo oráculo). **V1 + V2 contra um duplo COM ESTADO** (`CopiaDeTrabalho`: rubricas, mapeamentos, versões; a única lógica de decisão é `instantaneoDe` + `mudou`): sequências de 1..12 escritas do serviço (mapear, criar, editar, eliminar, definir caixa) ⇒ versão n+1 em `PENDING` ⇔ o vivo mudou; a mais recente é igual ao vivo; **repetir a mesma escrita não cria versão**; números 1..n contíguos; dois exemplos nomeados (mapear onde já está; contas de caixa fazem parte da versão). |
| `apps/erp/src/server/services/financas/__tests__/dfc-coerencia-caixa.test.ts` | `[]` ⇒ **exactamente um** impedimento e nenhum aviso (e continua impedimento «mesmo que a classe 1 exista» — a função não a vê); `[property]` classe 1 folha activa ⇒ nada; uma só conta (111) chega — não se exige a classe 1 inteira; fora da classe 1 / agregação / inactiva ⇒ um aviso por motivo, `conta = {id, codigo, nome}`, `mensagem` contém o código, `impedimentos = []`; três problemas ⇒ três avisos; 12 Bancos (classe 1, agregadora) é aviso, não passe livre; `[property]` avisos == multiconjunto exacto (conta, motivo); `[property]` só olha para o que recebe; **TEM de lançar**: a mesma conta repetida. |

`numRuns = 1000` em todas as propriedades. Dinheiro só por `Decimal.equals` (helper `iguais`); nenhuma comparação em
`number`, nenhuma tolerância. Datas por `Date.UTC(...) − 2h` / `21:59:59.999Z` (o que `criarExercicioContabil` grava) e
lidas por `Intl` em `Africa/Maputo`. Os imports do núcleo estão **ligados aos tipos `*Fn` do contrato**
(`const classificarVariacoes: ClassificarVariacoesFn = classificarVariacoesImpl` etc.): quando o módulo existir, uma
assinatura divergente é erro de `tsc` no oráculo, sem tocar no oráculo.

## Saída vermelha (gate do nó)

`cd apps/erp && npx vitest run` sobre os três ficheiros:

```
 RUN  v4.1.10 /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc/apps/erp

 ❯ src/server/services/financas/__tests__/dfc.property.test.ts (0 test)
 ❯ src/server/services/financas/__tests__/mapeamento-versao.property.test.ts (0 test)
 ❯ src/server/services/financas/__tests__/dfc-coerencia-caixa.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/server/services/financas/__tests__/dfc-coerencia-caixa.test.ts [ src/server/services/financas/__tests__/dfc-coerencia-caixa.test.ts ]
Error: Cannot find module '../dfc.model' imported from /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc/apps/erp/src/server/services/financas/__tests__/dfc-coerencia-caixa.test.ts

 FAIL  src/server/services/financas/__tests__/dfc.property.test.ts [ src/server/services/financas/__tests__/dfc.property.test.ts ]
Error: Cannot find module '../dfc.model' imported from /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc/apps/erp/src/server/services/financas/__tests__/dfc.property.test.ts

 FAIL  src/server/services/financas/__tests__/mapeamento-versao.property.test.ts [ src/server/services/financas/__tests__/mapeamento-versao.property.test.ts ]
Error: Cannot find module '../mapeamento-versao.model' imported from /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-dfc/apps/erp/src/server/services/financas/__tests__/mapeamento-versao.property.test.ts

 Test Files  3 failed (3)
      Tests  no tests
```

`npx tsc --noEmit -p .` (só os três `TS2307`; nenhum outro erro):

```
src/server/services/financas/__tests__/dfc-coerencia-caixa.test.ts(23,66): error TS2307: Cannot find module '../dfc.model' or its corresponding type declarations.
src/server/services/financas/__tests__/dfc.property.test.ts(41,8): error TS2307: Cannot find module '../dfc.model' or its corresponding type declarations.
src/server/services/financas/__tests__/mapeamento-versao.property.test.ts(40,72): error TS2307: Cannot find module '../mapeamento-versao.model' or its corresponding type declarations.
```

`npx eslint` sobre os três ficheiros: limpo (exit 0).

## Prova de que o oráculo é satisfazível e discriminante (fora do repositório)

Um oráculo que falha só por import prova que antecede a solução; não prova que uma solução correcta o passa, nem que
uma errada o chumba. Para fechar os dois lados escrevi uma implementação de **referência descartável** no scratchpad da
sessão (fora da árvore; não é commitada nem fica para o `nucleo`), ligada por um `vitest.config` de alias, e corri o
oráculo contra ela e contra sete mutações:

| Implementação | Resultado |
|---|---|
| referência correcta | **44/44 verdes** (19 + 13 + 12) em 7,7 s |
| `verificarArticulacao` sem efeito (mutação 1 do ticket 3) | 3 mortas: os três «TEM de lançar» de I6 |
| `CAIXA` contada na operacional (mutação 2 do ticket 3) | 4 mortas: I6 principal, estorno, ponta a ponta, I8 |
| `mudou` sempre `true` (mutação 3 do ticket 3) | 4 mortas: «mesmo mapeamento por outra ordem», duplo com estado, os dois exemplos |
| `mudou` sempre `false` | 5 mortas (V1: a mais recente deixa de ser igual ao vivo) |
| classes 6/7 somadas nas secções além do resultado (dupla contagem) | 4 mortas: I6 principal, estorno, ponta a ponta, I8 |
| sinal do fluxo por `tipo` em vez de `natureza` (3281 ATIVO/CREDORA) | 4 mortas: I6 principal, estorno, ponta a ponta, I8 |
| articulação comparada depois de `toFixed(2)` (tolerância) | 1 morta: o `[property] TEM de lançar` (delta 0,001) |

## O que o nó `nucleo` assume (decisões que o oráculo fixa, além da letra do contrato)

1. **As contas de resultado chegam ao núcleo e não se somam duas vezes.** Os balancetes que entram em
   `classificarVariacoes` são o que `montarLinhasBalancete` devolve — TODAS as contas com movimento, classes 6 e 7
   incluídas, e o seed (ticket 4.1) mapeia-as como a qualquer folha. Elas são representadas pelo `resultadoLiquido`
   (I9); quem as somar outra vez numa secção conta o resultado duas vezes e não articula. A distinção faz-se por
   **`tipo` (`GASTO`/`RENDIMENTO`)**, que é dado da conta — nunca por prefixo de código. O oráculo admite que a
   variação delas exista (com `rubricaId`/`atividade` do mapa) desde que não pese nas linhas; não admite que sejam
   `naoMapeadas` quando estão no mapa.
2. **A classe 8 (`tipo` RESULTADO, ex.: 851) FLUI como variação.** `calcularLinhasDRE` fixa `impostos = 0` e só lê os
   prefixos 6/7; se o núcleo excluísse também RESULTADO, um débito em 851 deixaria caixa fantasma. É por isso que
   o `resultadoLiquido` que o oráculo passa é rendimentos − gastos (tipos GASTO/RENDIMENTO), e só isso.
3. **Sinal pela natureza, conta a conta.** `efeitoCaixa = −variação` numa DEVEDORA, `+variação` numa CREDORA;
   numa conta `CAIXA` é a própria variação de caixa (`+variação` DEVEDORA, `−variação` CREDORA — o descoberto
   entra negativo). O catálogo tem 421 e 44331 com natureza GERADA e 3281 com `tipo` ATIVO e natureza CREDORA:
   uma regra por `tipo` ou por prefixo morre na primeira corrida.
4. **`Δcaixa` esperado = Σ (débitos − créditos) das contas CAIXA**, nos MESMOS balancetes (M2). O oráculo calcula-o à
   parte e passa-o a `verificarArticulacao`; e verifica também `somaAtividades.equals(Δcaixa)` directamente, para que
   um `verificarArticulacao` mudo não salve uma soma errada.
5. **`montarSeccoesDFC` lança para uma actividade fora do enum** (total sobre o enum, como `distribuirCompromissos`
   e `expandirRecorrencia` no WS-1). `CAIXA` não entra em secção nenhuma; `operacional.total` inclui o resultado;
   cada `linha.valor` é a Σ dos `efeitoCaixa` das suas contas; nenhuma conta aparece em duas linhas. A ORDEM das
   rubricas dentro da secção não é asserida (o contrato diz «`atividade`, `ordem`»; fica para a página).
6. **`verificarMesmoExercicio`**: o exercício decide antes da ordem — Dez-2025 → Jan-2026 é `DFC_ENTRE_EXERCICIOS`.
7. **`periodoHomologo`** casa por `ordem`, é indiferente à ordem do array recebido, e devolve `null` com `null`, com
   `[]` e sempre que falte um dos dois homólogos.
8. **`instantaneoDe` lança** com a mesma conta em dois mapeamentos e com um mapeamento para uma rubrica apagada ou
   inexistente (uma versão que não se reconcilia consigo própria não se congela). **`mudou`** compara na ordem
   canónica também quando o instantâneo anterior chega desordenado (uma versão antiga lida da base).
9. **`coerenciaContasCaixa`**: `[]` ⇒ **exactamente um** impedimento; contas repetidas ⇒ lança; um aviso por (conta,
   motivo), `conta = {id, codigo, nome}` e `mensagem` com o código da conta.
10. O que os oráculos **não** fixam: mensagens em PT-PT (só o código e a presença do código da conta), a ordem das
    rubricas nas secções, e o valor da `variacao` das contas de resultado.

## O que fica para o `config-v` (precisa do serviço real, ticket 7)

- **V2 «na mesma `$transaction`»** contra `mapearConta`, `criarRubrica`, `editarRubrica`, `definirContasCaixa` e
  `desmapearConta` (ajuste 4 do grafo): versão n+1 em `PENDING` dentro da transacção da escrita; uma escrita que não
  muda nada não cria versão; `NotFoundError` cross-tenant antes de escrever (I10).
- **V3 inteiro**: `validarVersao` só na mais recente (`FOR UPDATE`), `VERSAO_DESACTUALIZADA` numa anterior,
  «validar é a única escrita sobre uma versão», `validadoPorId = ctx.userId`.
- A transição nos dois sentidos (VALIDATED → alterar → PENDING → validar → VALIDATED) e «nenhuma escrita usa `upsert`
  ou `*Many`».
- **O `DuploPrisma` de `compras/__tests__/helpers/duplo-prisma.ts` não serve como está**: `TABELAS` é uma lista fixa
  sem `rubricaFluxoCaixa`, `mapeamentoContaFluxo` nem `versaoMapeamentoFluxo`, e `cliente()` só cria delegados para
  ela. Alargá-lo é tocar num helper de `compras/__tests__` (fora do âmbito deste nó); por isso o 2.2 usa um duplo
  próprio da cópia de trabalho, em memória, cuja única decisão é a do núcleo. No `config-v` o verificador terá de
  alargar as `TABELAS` (e as `RELACOES` para `contaPGC ↔ mapeamentoContaFluxo`) ou de fazer um duplo novo.

## Observações para o orquestrador (não bloqueiam este nó)

- **Errata ao ADR-0037 E2** continua pendente (o `contratos` já a pediu): a letra diz `saldoContabilAte`, o contrato e
  este oráculo usam os saldos dos MESMOS balancetes (`FILTRO_LANCAMENTO_MAPA`). Acto humano.
- **Quirk da DRE que o `servico-v` vai encontrar**: `calcularLinhasDRE` selecciona por prefixo (`'6'`, `'7'`) e assina
  pela natureza. Uma conta de classe 7 com natureza DEVEDORA (ex.: uma «717 Devoluções» criada pelo tenant) entra na
  DRE com o sinal ao contrário, e nesse tenant I9 (resultado = DRE) e I6 (articulação) não podem ser ambos verdadeiros.
  O seed não tem nenhuma (verificado: 0 desvios em 6/7); o oráculo puro não legisla sobre isto. Fica registado para a
  golden do `servico-v` e, se um dia aparecer, é defeito da DRE, não da DFC.
- `periodoHomologo` e `coerenciaContasCaixa` não são invariantes: os seus «TEM de lançar» são guardas de domínio
  (conta repetida; V4 é quem lança por E3). Os invariantes I6, I8, V1, V2 e V4 têm todos pelo menos um caso que lança.
- A base local não foi tocada; a golden do WS-1 continua no estado descrito em `dfc-adr.md`.
