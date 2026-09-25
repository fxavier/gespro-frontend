# Handoff — grafo `dfc`, nó `nucleo` (ticket 3)

- **Data**: 2026-09-25 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `seed-v`
- **Depende de**: `oraculos` (FEITO — [`dfc-oraculos.md`](dfc-oraculos.md), base `cd48052`; HEAD deste nó `16a22a3`)
- **Agente**: `feat-dfc`, na worktree `wt/feat-dfc` (ramo `ws-2-dfc`). Sem commit (é do orquestrador, depois do PV e da
  revisão).
- **Gate do ticket**: os três oráculos do ticket 2 verdes **sem alterações** (44/44) ✅ · três mutações à mão, todas
  mortas ✅ · `pnpm check` com o único vermelho aceite (resíduo da base no `projecao.golden`) ✅ · `pnpm gates` 5/5,
  `gate-periodo` a zero ✅.
- **Voltas**: 1 de IMPLEMENT (verde à primeira) + **FIX volta 1 de 3** após revisão (sem BLOCKER; 2 MAJOR + 2 NIT —
  ver «Correcções da revisão»).

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/services/financas/dfc.model.ts` | `classificarVariacoes`, `montarSeccoesDFC`, `verificarArticulacao`, `verificarMesmoExercicio`, `periodoHomologo`, `coerenciaContasCaixa` — cada uma declarada com o tipo `*Fn` do contrato (`const f: XFn = …`), por isso uma assinatura divergente é erro de `tsc` aqui e no oráculo. Mais `saldoCaixaDe(balancete, contasCaixa)` (FIX, M2): o saldo de caixa de um balancete em termos de débito, para `caixaInicial`/`caixaFinal`. |
| `apps/erp/src/server/services/financas/mapeamento-versao.model.ts` | `instantaneoDe` e `mudou` (`InstantaneoDeFn`, `MudouFn`). |
| `apps/erp/src/server/services/financas/__tests__/dfc-saldo-caixa.test.ts` | Teste **acessório** (ficheiro novo, fora dos protegidos): `saldoCaixaDe` e `efeitoCaixa` usam a mesma regra de sinal, com contas de caixa CREDORAS e DEVEDORAS. |
| `apps/erp/src/server/services/financas/dfc.interface.ts` | **Só o JSDoc** de `ColunaDFC.caixaInicial` (autorizado pelo orquestrador na FIX): «saldo em termos de débito, via `saldoCaixaDe`». Nenhum tipo nem assinatura alterados. |
| `docs/handoff/dfc-nucleo.md` | Este ficheiro. |

`import 'server-only'` na primeira linha dos dois modelos (precedente `dfc.interface.ts:1`; o vitest faz alias para
`test/server-only-stub.ts`, confirmado — os oráculos continuam verdes). Sem Prisma client, sem I/O, sem
`Date.now()`. Imports de valor: `Prisma.Decimal`, `BusinessRuleError`/`ValidationError`, `ERROS_DFC` (de
`dfc.interface.ts`), e os enums Zod `AtividadeFluxoEnum`/`AtividadeSeccaoEnum` (de `validations/fluxo-caixa.ts`,
client-safe) — o conjunto de actividades tem uma fonte só. **Não** toquei em `__tests__/` protegidos nem em `fixtures/`.

## INSPECT (resumo)

Leitura: grafo (`nucleo` + regras + leitura obrigatória), ticket 3 inteiro, Emenda 2026-09-25 do ADR-0037 (E1–E6,
V1–V4), `dfc-contratos.md` (decisões 4, 9, 10; correcções M1, M2, m1), `dfc-oraculos.md` («O que o nó `nucleo`
assume», pontos 1–10), o contrato `dfc.interface.ts`, os três oráculos protegidos, `montarLinhasBalancete` e
`calcularLinhasDRE` (forma de `ContaBalancete`, `saldoAtual` pela natureza), e as guardas puras do WS-1
(`validarCoerenciaCompromisso` lança `ValidationError`).

O que o oráculo fixa além da letra do contrato, e que a implementação segue:

- as contas de resultado chegam ao núcleo (o balancete traz classes 6 e 7) e **não pesam** nas secções — são o
  `resultadoLiquido` (I9); a distinção é por `tipo` (`GASTO`/`RENDIMENTO`), que é dado da conta;
- a classe 8 (`tipo` RESULTADO, ex.: 851) **flui** como variação — a DRE ignora-a (`impostos = 0`);
- `Δcaixa` esperado = Σ Δ(débitos − créditos) das contas `CAIXA` nos mesmos balancetes (M2);
- `montarSeccoesDFC` é total sobre o enum: actividade desconhecida lança;
- `instantaneoDe` lança com conta repetida ou rubrica apagada/inexistente; `mudou` compara em ordem canónica;
- `coerenciaContasCaixa([])` ⇒ exactamente um impedimento; conta repetida ⇒ lança.

## PLAN (resumo) e decisões de implementação

A aritmética que garante I6, escrita no cabeçalho de `dfc.model.ts` para quem vier mexer: seja Δ(c) a variação do
saldo «em termos de débito» (débitos − créditos) da conta c. Por partida dobrada, Σ_c Δ(c) = 0. Conta de caixa:
`efeitoCaixa = +Δ(c)`; conta de resultado: representada por `resultadoLiquido = −Σ Δ(c)`; qualquer outra:
`efeitoCaixa = −Δ(c)`. Logo `resultadoLiquido + Σ_outras efeitoCaixa = Σ_caixa Δ(c) = Δcaixa`. O sinal traduz-se
pela **natureza** porque `saldoAtual` já vem assinado por ela (`variacao = Δ(c)` numa DEVEDORA, `−Δ(c)` numa
CREDORA). É conta a conta (421 e 44331 DEVEDORAS no seed; 3281 ATIVO e CREDORA) — nunca por `tipo`, nunca por prefixo.

1. **`emTermosDeDebito(natureza, valor)` é a única função onde a regra do sinal vive** (DEVEDORA: o valor;
   CREDORA: o simétrico). `efeitoCaixaDe` (DEVEDORA `−variacao`, CREDORA `+variacao`; numa conta `CAIXA` o inverso —
   um descoberto CREDORA entra negativo) e `saldoCaixaDe` (Σ do `saldoAtual` em termos de débito sobre as contas
   `CAIXA`) derivam as duas daí. A UI e os testes não a reimplementam (decisão 10 do `contratos`).
2. **`classificarVariacoes` emite uma variação por conta mapeada com movimento, contas de resultado incluídas** (com
   `rubricaId`/`atividade` do mapa, `variacao` e `efeitoCaixa` pela mesma regra). É `montarSeccoesDFC` que decide o
   que pesa: exclui `CAIXA` (E2) e `tipo` GASTO/RENDIMENTO (I9). Alternativa rejeitada: omiti-las em
   `classificarVariacoes` — o retorno só tem `variacoes` e `naoMapeadas`, e o oráculo recusa que saiam em
   `naoMapeadas` quando estão no mapa; mantê-las nas `variacoes` deixa os dados disponíveis para o bloco de
   reconciliação com a DRE (ticket 8.4) sem inventar um terceiro retorno. Ordem das `variacoes`: por código.
3. **`montarSeccoesDFC` valida três coisas antes de agrupar, e lança `ValidationError`** (precedente WS-1) em
   qualquer uma: actividade fora do enum; `rubricaId` ausente de `rubricas`; actividade da variação diferente da da
   rubrica. Um mapa com uma destas inconsistências é dinheiro a desaparecer antes da articulação. Ordem de
   apresentação: `rubricas` por (`ordem`, `codigo`); contas dentro da linha por código; rubricas sem contas com
   movimento não aparecem; `operacional.total` abre com `resultadoLiquido`.
4. **`verificarArticulacao` compara só `seccoes.somaAtividades` com `variacaoCaixa`**, como o contrato manda, por
   `Decimal.equals`, sem tolerância. `details` em `toFixed()` (sem argumento): notação posicional completa —
   `toString()` passa a exponencial a partir de 1e21, e uma string com expoente num `details` que a UI mostra é
   uma armadilha.
5. **Guardas de domínio lançam `ValidationError`** (conta repetida nas contas de caixa; conta em dois mapeamentos;
   mapeamento para rubrica apagada/inexistente; actividade desconhecida). São input fora do domínio — estados que o
   `@@unique` proíbe — não regras de negócio para o utilizador; o precedente é `validarCoerenciaCompromisso` no WS-1.
   Os `BusinessRuleError` ficam para os códigos estáveis do contrato (`DFC_NAO_ARTICULA`, `DFC_ENTRE_EXERCICIOS`,
   `DFC_INTERVALO_INVERTIDO`).
6. **Ordem canónica do instantâneo por ponto de código (`<`), não `localeCompare`**: um instantâneo gravado hoje
   tem de comparar igual a si próprio quando for lido noutra máquina. Desempate por `id` (rubricas) e `rubricaId`
   (mapeamentos), inócuo com os `@@unique`. `mudou` canoniza os dois lados antes de comparar campo a campo.
7. **`verificarMesmoExercicio`**: o exercício decide antes da ordem (Dez-2025 → Jan-2026 é `ENTRE_EXERCICIOS`).
   **`periodoHomologo`**: `find` por `ordem` nos dois limites; `null` com `null`, `[]` ou se faltar um — nunca parcial.
8. **Mensagens em PT-PT** com o código da conta (o oráculo só fixa a presença do código). O impedimento de
   `coerenciaContasCaixa([])` aponta para «Fluxo de caixa › Rubricas», que é onde o ticket 7.3 põe as contas de caixa.

## Correcções da revisão (FIX, volta 1 de 3 — 2026-09-25)

Revisão do code-reviewer sem BLOCKER; PV limpo. Quatro achados, todos fechados:

- **MAJOR 1** — `import 'server-only';` na primeira linha de `dfc.model.ts` e `mapeamento-versao.model.ts`. O vitest
  faz alias de `server-only` para `test/server-only-stub.ts` (`vitest.config.ts`), por isso os oráculos não partem —
  confirmado: 44/44 depois da alteração.
- **MAJOR 2** — **Sinal da caixa no serviço.** O handoff mandava o `servico` usar Σ `saldoAtual` das contas `CAIXA`
  para `caixaInicial`/`caixaFinal`; `saldoAtual` vem assinado pela natureza e, numa conta `CAIXA` CREDORA (129
  Descobertos), fica com o sinal trocado face ao `efeitoCaixa` (Δ em débito): descoberto +100 e depósito +100 ⇒
  Δcaixa real 0, Σ `saldoAtual` +200 ⇒ `DFC_NAO_ARTICULA` em produção. O seed não tem conta `CAIXA` CREDORA, por
  isso a golden não o apanharia. Correcção decidida pelo orquestrador: `saldoCaixaDe(balancete, contasCaixa)`
  exportado de `dfc.model.ts` (DEVEDORA `saldoAtual`, CREDORA `saldoAtual.negated()`), com a regra de sinal
  **partilhada** com `efeitoCaixaDe` por `emTermosDeDebito` — uma só fonte. Teste acessório novo
  `dfc-saldo-caixa.test.ts` (fora dos protegidos): (i) `[property]` `saldoCaixaDe(fim) − saldoCaixaDe(ini)` ==
  Σ `efeitoCaixa` das variações `CAIXA` de `classificarVariacoes`, com 111/121 DEVEDORAS e 129 CREDORA na caixa,
  `numRuns 1000`, `Decimal.equals`; (ii) o caso concreto descoberto +100 / depósito +100 ⇒ 0 (e afirma que Σ
  `saldoAtual` daria +200, o defeito que tranca); (iii) só olha para o conjunto recebido. Discriminação
  verificada: com `saldoCaixaDe` mutado para Σ `saldoAtual` tal qual, (i) e (ii) morrem (`2 failed | 1 passed`);
  revertido. JSDoc de `ColunaDFC.caixaInicial` no contrato clarificado (só comentário). Parágrafo «O que o nó
  `servico` vai encontrar» corrigido abaixo.
- **NIT 1** — `porCodigo` passou a comparação por ponto de código (`<`), como no ficheiro irmão; o comentário
  dizia «independente da locale» e o corpo usava `localeCompare`.
- **NIT 2** — `PeriodoContabil` importado e não usado em `dfc.model.ts`: removido.

## VERIFY (depois da FIX)

### 1. Oráculo (os três protegidos), sem alterações — mais o acessório

`cd apps/erp && npx vitest run` sobre os três protegidos + `dfc-saldo-caixa.test.ts`:

```
 Test Files  4 passed (4)
      Tests  47 passed (47)
   Duration  7.62s
```

19 (`dfc.property`) + 13 (`mapeamento-versao.property`) + 12 (`dfc-coerencia-caixa`) + 3 (`dfc-saldo-caixa`, acessório).
`git diff --stat cd48052..HEAD -- <os três protegidos>` vazio e `git status` limpo neles. `npx tsc --noEmit -p .` → 0
erros; `npx eslint` nos dois modelos, no contrato e no teste acessório → limpo.

### 2. Mutações à mão (cada uma revertida a seguir; os modelos confirmados byte a byte iguais ao original com `diff`)

| Mutação | Onde | Mortos | Testes que a mataram (nome → asserção) |
|---|---|---|---|
| (a) `verificarArticulacao` sem efeito (`if (… \|\| true) return;`) | `dfc.model.ts` | **3** | `I6 › [property] TEM de lançar: somaAtividades ≠ variacaoCaixa ⇒ DFC_NAO_ARTICULA com o delta em details` → `expected undefined to be an instance of BusinessRuleError` · `I6 › TEM de lançar: um cêntimo a mais de 1 000 000 000 000 000 — onde um number já não o vê` → `expected null to be 'DFC_NAO_ARTICULA'` · `I6 › TEM de lançar, de ponta a ponta: um diário que articula deixa de articular com um cêntimo a mais na caixa` → `expected null to be 'DFC_NAO_ARTICULA'` |
| (b) `CAIXA` contada na operacional (retirado o `continue` de E2 em `montarSeccoesDFC` e a rubrica `CAIXA` admitida na secção operacional) | `dfc.model.ts` | **4** | `I6 › [property] OP + INV + FIN == Δcaixa …` → `expected 'CAIXA' to be 'OPERACIONAL'` · `I6 › [property] estorno numa conta de caixa …` → idem · `I6 › TEM de lançar, de ponta a ponta …` → `expected [Function] to not throw … 'BusinessRuleError: A DFC não articula…' was thrown` (o `verificarArticulacao` real a acusar em produção) · `I8 › [property] DFC(de..ate) == Σ DFC(m) …` → idem |
| (c) `mudou` sempre `true` (`if (anterior === null \|\| true) return true;`) | `mapeamento-versao.model.ts` | **4** | `V2 › [property] mudou(x, x′) é false quando x′ é o mesmo mapeamento lido por outra ordem` → `expected true to be false` · `V1 + V2 › [property] depois de cada escrita, a versão mais recente é igual ao vivo e há versão nova ⇔ o vivo mudou` → idem · `V1 + V2 › escrita que não muda nada não cria versão: mapear a conta à rubrica onde já está` → idem · `V1 + V2 › as contas de caixa fazem parte da versão (E1/E2) …` → idem |

Bate com a tabela de discriminação do `dfc-oraculos.md` (3 / 4 / 4). Depois de repostas: `grep -c MUTAÇÃO` = 0 nos
dois ficheiros; oráculo 44/44 outra vez.

### 3. `pnpm check && pnpm gates` (raiz da worktree)

- `pnpm check` (pós-FIX): `prisma validate` ✅ · `tsc --noEmit` ✅ · `eslint .` ✅ (0 erros; 109 avisos pré-existentes,
  nenhum nos ficheiros deste nó) · `vitest run` → **135 ficheiros verdes, 1 vermelho; 1888 testes verdes, 3 saltados**.
  O único vermelho é o aceite: `projecao.golden.test.ts` com «a base tem resíduos» (`compromissosManuais` observado 1
  vs fixture 0 — o «Pagamento da Internet» de `dfc-adr.md`). Nenhum outro.
- `pnpm gates`: `dialog` OK · `use-client` OK · `data-imports` OK · `leitura` OK · `periodo` OK («nenhum ficheiro fora
  de contabilidade.service.ts escreve directamente em Lancamento/PartidaLancamento»).

## O que o nó `seed-v`/`seed` vai encontrar

- `instantaneoDe` **lança** se o seed produzir um mapeamento para uma rubrica que não esteja viva ou a mesma conta duas
  vezes — a versão 1 do `semearRubricasFluxo` tem de nascer de um par (rubricas, mapeamentos) já coerente.
- `coerenciaContasCaixa` avisa (não bloqueia) se uma conta `CAIXA` do seed for de agregação, inactiva ou fora da
  classe 1; recusa com impedimento se não houver nenhuma. A tabela 4.1 deve mapear pelo menos uma folha activa de
  classe 1 à rubrica `CX-01`.
- A ordem das rubricas nas secções é (`ordem`, `codigo`) da lista que o serviço passar — o seed decide a ordem por
  `ordem`; o `codigo` só desempata.

## O que o nó `servico` vai encontrar

- `classificarVariacoes` recebe os dois balancetes de `montarLinhasBalancete` tal como saem (todas as contas com
  movimento, classes 6/7/8 incluídas) e o `MapaConta` (`contaId → RubricaResumo`) montado a partir de
  `MapeamentoContaFluxo` + `RubricaFluxoCaixa`. Uma conta em `naoMapeadas` é um impedimento — todas de uma vez.
- `caixaInicial = saldoCaixaDe(balanceteInicio, contasCaixa)` e `caixaFinal = saldoCaixaDe(balanceteFim, contasCaixa)`
  (`contasCaixa` = ids das contas mapeadas a rubricas `CAIXA`), sobre esses **mesmos** balancetes (M2). **NÃO** Σ
  `saldoAtual` tal qual: numa conta `CAIXA` CREDORA (descoberto) o sinal fica trocado face ao `efeitoCaixa` e a DFC
  não articula em produção sem nenhum erro de classificação (FIX, MAJOR 2). `variacaoCaixa = caixaFinal −
  caixaInicial`; `verificarArticulacao(seccoes, variacaoCaixa)` corre nas duas colunas antes de o mapa sair.
- As `variacoes` incluem as contas de resultado (decisão 2): o serviço não precisa de as filtrar para o mapa
  (`montarSeccoesDFC` já o faz), e pode usá-las no bloco da DRE (8.4).
- `ValidationError` de `montarSeccoesDFC` (rubrica ausente/actividade incoerente) só acontece se o serviço montar o
  `MapaConta` e a lista `rubricas` de fontes diferentes — passe as mesmas rubricas aos dois.

## Fora deste nó

- Errata humana ao ADR-0037 E2 (`saldoContabilAte` → saldos dos mesmos balancetes, M2) — continua pendente desde o
  `contratos`; o núcleo já segue o contrato (M2), não a letra da E2.
- Nenhum serviço, action, UI, seed, permissão, migração. Nenhum ficheiro protegido tocado. Sem commit.
