# Issue #78 — oráculo do nó N1 (verificador)

Pagamento a fornecedor: o crédito sai do meio por onde se pagou. Hoje `registarPagamento` lança sempre
421 D / 121 C no diário BANCO, não cria `MovimentoCaixa` e usa `Number()`. Este ficheiro regista o oráculo
e a prova de que está **vermelho pela razão certa** contra o código actual (worktree `wt/issue-78`, base
`347c8e6`). Nenhum código de produção foi alterado.

## Ficheiros

Criados:

| Ficheiro | Casos |
|---|---|
| `apps/erp/src/server/services/compras/__tests__/helpers/duplo-prisma.ts` | duplo COM ESTADO do Prisma (não é teste) |
| `apps/erp/src/server/services/compras/__tests__/helpers/cenario-pagamento.ts` | cenário semeado partilhado (não é teste) |
| `apps/erp/src/server/services/compras/__tests__/pagamento-meio.test.ts` | T1, T2, T3, T4, T5 |
| `apps/erp/src/server/services/compras/__tests__/pagamento-meio.property.test.ts` | T7 (fast-check 4.9, `numRuns: 1000`) |
| `apps/erp/src/server/services/financas/__tests__/caixa-pagamento.test.ts` | T8 |
| `apps/erp/src/lib/validations/__tests__/pagamento-forma.test.ts` | T6 |
| `apps/erp/e2e/16-pagamento-fornecedor.spec.ts` | T9 |

Alterados (decisão humana C1, só estes dois):

- `apps/erp/src/server/services/compras/__tests__/conta-pagar.service.test.ts`
- `apps/erp/src/server/services/compras/__tests__/wave3-integration.test.ts`

### O duplo

- As tabelas `contaBancaria`, `contaPGC`, `sessaoCaixa`, `movimentoCaixa`, `pagamento`, `contaPagar`,
  `fornecedor` e `lancamento` vivem em memória.
- `findFirst`, `findUnique`, `findMany` e `count` filtram por todos os campos de `where`: igualdade,
  `in`/`not`/`lt`…, e filtros de relação. `include`/`select` resolvem as relações conhecidas
  (`contaBancaria.contaContabil`, `sessaoCaixa.movimentos`, `contaPagar.pagamentos`…). Os campos de dinheiro
  são normalizados para `Prisma.Decimal`, como no Prisma real, e `update` aceita `increment`/`decrement`.
- `$transaction(fn)` tira um snapshot e repõe-o se a callback lançar. É por isso que «nada escrito» se afirma
  sem ditar a ordem das operações.
- `prisma` emula a tenant-extension: injecta `tenantId` em `findFirst`, `findMany`, `count`, `updateMany` e
  `create`, mas não em `findUnique`/`update`, como a real. `prismaBase` não injecta nada.
- `registarLancamentoContabilistico` e `proximoNumeroSerie` estão mockados. O mock do lançamento **grava no
  duplo pelo `tx` que recebe**, e assim o rollback também o apanha. `registarMovimentoCaixa` e
  `resumoSessao`/`fecharSessao` correm a sério sobre o duplo.
- Não se importa o contrato novo de financas: tudo passa por `contaPagarService.registarPagamento`.

### Prova de que o oráculo é satisfazível (fora do repo)

- Escrevi uma implementação de referência mínima **no scratchpad** (nunca no repo), com três partes:
  - `conta-pagar.service`: resolve a sessão/conta, aplica as regras de erro e chama `registarMovimentoCaixa`;
  - `caixa.service`: `PAGAMENTO` passa a contar nas saídas;
  - `CreatePagamentoSchema`: enum, `idEntidade` e `refine`.
- Um `vitest.config` de scratch redirecciona os três módulos com um plugin `resolveId`.
- Resultado: **12 ficheiros, 188/188 verdes**, com todos os `compras/__tests__`, `validations/__tests__`,
  `caixa.test.ts` e `caixa-pagamento.test.ts`, incluindo os dois testes antigos adaptados.
- Conclusão: o oráculo não exige nada de impossível, e os testes antigos adaptados ficam verdes com uma
  implementação correcta.

## Justificação das alterações a testes antigos

### `conta-pagar.service.test.ts`

1. **Novo helper `meioBancario()` e constantes `CONTA_BANCARIA_ID`, `contaBancariaMock` (CORRENTE, activa) e
   `contaPGCBancoMock` (codigo `'123'`).**
   - O helper devolve delegados lenientes `contaBancaria.findFirst/findUnique/*OrThrow` e
     `contaPGC.findFirst/findUnique`. Com a correcção, uma forma não-numerário tem de resolver uma
     ContaBancaria. Sem estes delegados os testes antigos rebentariam com `undefined is not a function`, e
     não pela regra que afirmam.
   - Não se muda nenhuma asserção.
2. **Blocos `registarPagamento() — validação` (2 testes) e `registarPagamento() — conta VENCIDA` (2 testes).**
   - Só a entrada muda: `formaPagamento: 'TRF'` passa a `'TRANSFERENCIA_BANCARIA'`, com
     `contaBancariaId: CONTA_BANCARIA_ID` (e `as any` enquanto o tipo não tem o campo).
   - `...meioBancario()` entra no `tx` do mock.
   - As asserções ficam iguais: excesso → `BusinessRuleError`; liquidação → `PAGA`; parcial numa `VENCIDA`
     mantém `VENCIDA` com 200/300; liquidação de `VENCIDA` → `PAGA`.
   - Hoje continuam verdes. Não discriminam o #78, e é esse o objectivo: são regressão.
3. **O teste «liquidação (registarPagamento) continua D 421 / C 121 sem tocar em IVA» foi SUBSTITUÍDO** por
   «liquidação por transferência: D 421 / C <PGC da conta bancária>, sem tocar em IVA».
   - Fica a intenção original: 2 partidas e nenhum 4432x.
   - O crédito passa a ser `contaPGCBancoMock.codigo` (`'123'`), no diário `BANCO`, e afirma-se que o `121`
     não aparece.
   - O comportamento de referência foi para T1/T3 em `pagamento-meio.test.ts`.
   - **Vermelho hoje**: `expected undefined to be defined`, porque não há crédito em 123.

### `wave3-integration.test.ts`

1. **O mesmo helper `meioBancario()` e as constantes**, mais `inputPagamento` (`TRANSFERENCIA_BANCARIA` +
   `contaBancariaId`).
   - `...meioBancario()` entra no `$transaction` global do mock e no `mockImplementationOnce` do teste do
     `lancamentoId`.
2. **As cinco chamadas `registarPagamento` com `formaPagamento: 'Transferência'`** passam a
   `{ ...inputPagamento, dataPagamento: new Date() } as any`.
   - `'Transferência'` deixa de ser forma válida.
   - As asserções de equilíbrio, débito 421, origem/diário/documento e `lancamentoId` ficam iguais e verdes.
3. **«lançamento usa conta 121 (Depósitos à ordem) como CRÉDITO» passa a «lançamento credita a conta PGC da
   ContaBancaria escolhida (123 no mock)»**, com `expect(credito?.contaCodigo).toBe(contaPGCBancoMock.codigo)`.
   - **Vermelho hoje**: `expected '121' to be '123'`.
4. Os `pagamentoMock` que o mock *devolve* ainda dizem `'Transferência'`/`'TRF'`. São dados de retorno, não
   de entrada, e ficaram como estavam.

### `plataforma/__tests__/provisionamento-integracao.test.ts` (pedido do coordenador, depois do N2)

1. **`expect(contas).toBe(502)` passa a `toBe(503)`.** Os comentários mudam em conformidade: linha 71,
   «502 contas» → «503 contas»; linha 108, «504 entradas no JSON» → «505 entradas».
   - É consequência directa da decisão humana D1: o N2 acrescentou a conta `111 Caixa` (filha de `11`) a
     `prisma/seed/data/plano-contas-pgc.json`.
   - Confirmei o ficheiro: tem 505 entradas e 503 códigos distintos.
   - O número conta as linhas do plano que o bootstrap cria. Não é comportamento do pagamento, e a
     alteração não enfraquece nada: continua a ser uma igualdade exacta.
   - `npx vitest run src/server/services/plataforma/__tests__/provisionamento-integracao.test.ts`:
     **1 ficheiro, 3/3 verdes** (nenhum saltado).

### `financas/__tests__/fixtures/projecao-seed-demo.json` — golden fixture da spec 22 (BLOCKER B1 da revisão)

1. **A sentinela `contasBancarias` passa de `3` para `4`.** A `$nota` das sentinelas acrescenta a M-Pesa na
   121. Mais nada mudou (diff: 2 linhas).
   - É consequência directa da decisão humana C2: o seed cria no tenant demo a ContaBancaria «M-Pesa»
     841234567, CARTEIRA_MOVEL, ancorada na conta PGC **121**.
   - Derivei à mão, só com SELECT, na base local `gespro` (a 25/09, depois do seed novo). Resultado: **nenhum
     número de `esperado` muda.**
   - Contas bancárias do demo, as 4 activas:
     - Millennium bim → 121;
     - BCI → 121;
     - Standard Bank (DEPOSITO_PRAZO) → 123;
     - M-Pesa (CARTEIRA_MOVEL, criada a 2026-09-25 10:54) → 121.
   - Contas PGC distintas: continuam a ser {121, 123}. A soma do saldo é por conta PGC distinta
     (`saldoTesourariaAte`, §2-bis), portanto a 121 continua a contar **uma** vez.
   - A M-Pesa não tem nenhuma linha própria: 0 em `MovimentoBancario`, `MovimentoContabilistico`,
     `CorrespondenciaBancaria`, `PeriodoReconciliacao`, `ImportacaoExtracto` e `RegraSugestaoLancamento`.
   - PGC 121: 99 partidas, todas LANCADO, com datas entre 2026-01-20 e 2026-09-17, todas ≤
     `instanteReferencia` (2026-09-23T16:30Z). Dão 4 624 081,20 D − 388 100,00 C = **4 235 981,20**, igual à
     fixture.
   - PGC 123: 3 partidas, todas fora do filtro. Duas vêm de lançamentos RASCUNHO, que estão fora de
     `FILTRO_LANCAMENTO_MAPA`. A terceira é LANCADO mas tem data 2026-10-31, depois do instante. Saldo:
     **0,00**, igual à fixture.
     - São resíduos manuais de 23–24/09 («Comissão de manutenção…», «Juros credores»). Hoje não afectam a
       fixture, mas convém limpá-los.
   - PGC 111: 0 partidas.
   - Sessão ABERTA CXS/2026/000008: 5 000,00 + 719 106,60 − 0,00 = **724 106,60**, lido de `totalEntradas`/
     `totalSaidas` gravados. Igual à fixture.
   - `saldoAbertura` = 4 235 981,20 + 0,00 + 724 106,60 = **4 960 087,80**, inalterado.
2. `npx vitest run src/server/services/financas/__tests__/projecao.golden.test.ts`: falha no `beforeAll`
   das sentinelas, e a **única** divergência restante é `compromissosManuais`:
   ```
   observado: {"totalFaturas":106,"faturasEmAberto":20,"contasPagarEmAberto":10,"payrollProcessado":0,"compromissosManuais":1,"contasBancarias":4,"sessoesAbertas":1,"vencimentoCivilDaFAT92":"2026-09-27"}
   fixture:   {"totalFaturas":106,"faturasEmAberto":20,"contasPagarEmAberto":10,"payrollProcessado":0,"compromissosManuais":0,"contasBancarias":4,"sessoesAbertas":1,"vencimentoCivilDaFAT92":"2026-09-27"}
   Test Files 1 failed (1) · Tests 3 skipped (3)
   ```
   - O compromisso «Pagamento da Internet» foi criado à mão em 2026-09-24 01:20 e não está apagado. É um
     resíduo alheio a esta issue, e cabe ao humano limpá-lo.
   - Enquanto existir, os 3 testes numéricos ficam saltados. A igualdade de `esperado` está provada pela
     derivação acima, **não** por uma corrida verde. Volta a correr o golden depois da limpeza.

## Saída VERMELHA

Comando, a partir de `apps/erp`:

```
npx vitest run src/server/services/compras/__tests__/pagamento-meio.test.ts \
  src/server/services/compras/__tests__/pagamento-meio.property.test.ts \
  src/server/services/financas/__tests__/caixa-pagamento.test.ts \
  src/lib/validations/__tests__/pagamento-forma.test.ts \
  src/server/services/compras/__tests__/conta-pagar.service.test.ts \
  src/server/services/compras/__tests__/wave3-integration.test.ts
```

Saída, filtrada aos casos que falham:

```
     × para toda a forma × valor (2 casas, parcial ≤ restante) 97ms
     × D 421 / C 111, diário CAIXA, movimento PAGAMENTO na sessão própria, lancamentoId gravado 27ms
     × nenhuma sessão aberta → SESSAO_CAIXA_NECESSARIA e nada escrito 10ms
     × só a sessão de outro utilizador → SESSAO_CAIXA_NECESSARIA e nada escrito 2ms
     × uma sessão própria FECHADA não conta como aberta 2ms
     × TRANSFERENCIA_BANCARIA com conta CORRENTE (PGC 123) → C 123, diário BANCO, zero movimentos de caixa 2ms
     × CHEQUE com conta CORRENTE (PGC 123) → C 123, diário BANCO, zero movimentos de caixa 2ms
     × TRANSFERENCIA_BANCARIA com conta POUPANCA credita a sua PGC (1231), não um código fixo 2ms
     × M-PESA com CARTEIRA_MOVEL → C na PGC da carteira (1241), diário BANCO 2ms
     × E-MOLA com CARTEIRA_MOVEL → C na PGC da carteira (1241), diário BANCO 3ms
     × M-PESA com conta corrente → CONTA_BANCARIA_INCOMPATIVEL e nada escrito 2ms
     × E-MOLA com conta corrente → CONTA_BANCARIA_INCOMPATIVEL e nada escrito 1ms
     × TRANSFERENCIA_BANCARIA com conta carteira → CONTA_BANCARIA_INCOMPATIVEL e nada escrito 1ms
     × CHEQUE com conta carteira → CONTA_BANCARIA_INCOMPATIVEL e nada escrito 1ms
     × contaBancariaId de outro tenant → NotFoundError, nada escrito 1ms
     × contaBancariaId inexistente → NotFoundError 2ms
     × conta bancária com ativo=false → CONTA_BANCARIA_INATIVA, nada escrito 2ms
     × lançamento credita a conta PGC da ContaBancaria escolhida (123 no mock) 8ms
     × liquidação (registarPagamento) por transferência: D 421 / C <PGC da conta bancária>, sem tocar em IVA 8ms
     × acrescentar PAGAMENTO de 0.01 desce saldoEsperado e sobe totalSaidas exactamente por esse valor 48ms
     × acrescentar PAGAMENTO de 250.50 desce saldoEsperado e sobe totalSaidas exactamente por esse valor 2ms
     × acrescentar PAGAMENTO de 1234567.89 desce saldoEsperado e sobe totalSaidas exactamente por esse valor 2ms
     × com/sem um PAGAMENTO de V: totalSaidas gravado difere V, diferenca difere V (fundoFinal igual) 3ms
     × TRANSFERENCIA_BANCARIA sem contaBancariaId é recusado 14ms
     × CHEQUE sem contaBancariaId é recusado 1ms
     × M-PESA sem contaBancariaId é recusado 1ms
     × E-MOLA sem contaBancariaId é recusado 1ms
     × forma fora do enum ("TRF") é recusada, mesmo com conta bancária 1ms
     × forma fora do enum ("Transferência") é recusada, mesmo com conta bancária 1ms
     × forma fora do enum ("numerario") é recusada, mesmo com conta bancária 1ms
     × forma fora do enum ("MPESA") é recusada, mesmo com conta bancária 1ms
     × TRANSFERENCIA_BANCARIA com contaBancariaId e contaPagarId em uuid passa 1ms
     × CHEQUE com contaBancariaId e contaPagarId em uuid passa 1ms
     × M-PESA com contaBancariaId e contaPagarId em uuid passa 1ms
     × E-MOLA com contaBancariaId e contaPagarId em uuid passa 1ms
     × contaBancariaId que não é id é recusado 1ms
     × NUMERARIO com contaPagarId em uuid passa 1ms
 Test Files  6 failed (6)
      Tests  37 failed | 48 passed (85)

Razões (contagem por mensagem; o vitest agrupa falhas idênticas de it.each):
   1 AssertionError: expected '121' to be '111'                          ← T1
  10 AssertionError: promise resolved "{ …(8) }" instead of rejecting    ← T2 (3), T4 incompat. (4), T5 (3)
   2 AssertionError: expected '121' to be '123'                          ← T3 (TRANSF., CHEQUE)
   1 AssertionError: expected [ '121' ] to deeply equal [ '1231' ]       ← T3 POUPANCA
   1 AssertionError: expected [ '121' ] to deeply equal [ '1241' ]       ← T4 M-PESA/E-MOLA
   1 Caused by: AssertionError: expected [ '121' ] to deeply equal [ '123' ]   ← T7
   1 Counterexample: ["TRANSFERENCIA_BANCARIA",{"restanteCent":1,"valorCent":1}]
   4 AssertionError: expected '0.00' to be '<V>'                          ← T8 (resumo ×3, fecho ×1)
   3 AssertionError: expected true to be false                            ← T6 recusas
   2 AssertionError: expected false to be true                            ← T6 aceitações uuid
   1 AssertionError: expected '121' to be '123'  (wave3, crédito)         ← antigo adaptado
   1 AssertionError: expected undefined to be defined (conta-pagar, C 123) ← antigo substituído
```

Os 48 que passam são os testes antigos não relacionados, os antigos adaptados que não tocam no crédito, e
os três casos «verde já hoje» abaixo. Nenhuma falha vem de import, compilação ou `TypeError`.

Nota sobre T7:

- Antes de lhe acrescentar a 4.ª propriedade («fora do numerário, o crédito é a PGC da ContaBancaria»), a
  primeira corrida já encolhia para `Counterexample: ["NUMERARIO",{"restanteCent":1,"valorCent":1}]`, com
  `expected false to be true` em «crédito em 111 ⇔ NUMERARIO».
- As duas metades da propriedade discriminam.

### Casos verdes já hoje (não discriminantes)

- T6 «NUMERARIO sem contaBancariaId passa (contaPagarId cuid)».
- T6 «contaBancariaId em cuid também passa»: hoje a chave é descartada e CHEQUE é string válida.
- T6 «forma fora do enum ("")»: hoje o `min(1)` já recusa.

Cada Tn tem pelo menos um caso discriminante vermelho: T1 1/1, T2 3/3, T3 3/3, T4 6/6, T5 3/3, T6 14/17,
T7 1/1, T8 4/4.

## T9 — E2E (`e2e/16-pagamento-fornecedor.spec.ts`)

Como corri:

- `next dev --turbopack -p 3010` da worktree, com `NEXTAUTH_URL=AUTH_URL=http://localhost:3010` no ambiente.
  A porta 3000 da outra checkout ficou intacta.
- Depois `BASE_URL=http://localhost:3010 npx playwright test --project=setup`. O login passou.

**Transferência bancária: vermelho pela razão certa, e sem escrever nada** (falha antes do submit):

```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('combobox', { name: /Conta bancária/ })
Expected: visible
Error: element(s) not found
  > 119 |   await expect(campoConta).toBeVisible({ timeout: 10_000 });
```

**Numerário: NÃO corri contra o código actual, de propósito.**

- Hoje o submit teria sucesso e gravaria um Pagamento real (421/121) numa conta do seed do tenant `demo`,
  na base partilhada.
- Isso alteraria o restante das contas a pagar que a golden fixture da spec 22
  (`projecao.golden.test.ts`) usa, e o `pnpm check` ficaria vermelho para toda a gente.
- Em vez disso, corri uma sonda temporária (`e2e/zz-sonda-78.spec.ts`, já apagada), que faz todo o caminho
  do teste até antes do submit:
  - encontra a sessão ABERTA do admin (`CXS/2026/000008` → `/caixa/<id>`);
  - encontra uma conta a pagar em aberto e abre `/pagar`;
  - escolhe «Numerário»;
  - abre o detalhe da sessão e vê «Movimentos».
- A sonda **passou**, portanto os seletores e a navegação estão certos.
- Hoje a asserção que falharia é a do movimento «Pagamento» na sessão: não há movimento, e o
  `movimentos-table.tsx` nem tem rótulo para `PAGAMENTO`.

Limpeza:

- Parei o dev server da 3010.
- Corri `git checkout -- apps/erp/playwright/.auth/admin.json`.

## tsc / eslint

- `npx tsc --noEmit -p .` (em `apps/erp`): **zero erros**. As entradas com campos novos (`contaBancariaId`,
  formas do enum) vão como `as any`, para o check não depender do tipo novo.
- `npx eslint` nos ficheiros tocados: limpo.

## Pontos ambíguos da especificação

1. **O E2E grava no tenant `demo` partilhado** e o nome de ficheiro pedido (`16-…`) põe-no na suite normal.
   - Mesmo depois da correcção, cada corrida paga 1,37 + 2,41 MZN a contas do seed. Isso altera o restante
     que a golden fixture da spec 22 lê, e pode abrir uma sessão de caixa (a golden conta `sessoesAbertas`).
   - É preciso decidir: isolar o tenant, usar um fornecedor/conta criados pela própria UI, ou aceitar o
     resíduo.
2. **Código PGC da carteira móvel**: a especificação diz «idem, na sua conta».
   - O oráculo usa `1241` para a CARTEIRA_MOVEL e `1231` para a POUPANCA, só para provar que o crédito vem
     da `ContaBancaria.contaContabilId` e não de um código fixo.
   - Fica por decidir que conta PGC o seed/bootstrap dá às carteiras.
3. **`111` tem de existir** como ContaPGC (filha de 11) no bootstrap e no seed.
   - O oráculo mocka o lançamento e não o prova. Merece um teste de bootstrap no nó da implementação.
4. **`valor` continua `number`** no schema (`positivoDecimal = z.number()`). A especificação pede «não usar
   Number() para dinheiro» no serviço, mas não diz se o input passa a string.
   - O oráculo passa `number`, com 2 casas, e compara tudo como Decimal.
   - Se o schema passar a string, as entradas `as any` continuam a funcionar só se o serviço aceitar os dois.
5. **Ordem das validações**: com NUMERARIO e um `contaBancariaId` presente, ignora-se ou recusa-se?
   - A especificação não diz, e o oráculo não testa essa combinação.
6. **T5 com NotFound**: o oráculo aceita qualquer `NotFoundError`, venha de `findFirst` com `tenantId` ou de
   `findUnique` com a verificação de tenant.
