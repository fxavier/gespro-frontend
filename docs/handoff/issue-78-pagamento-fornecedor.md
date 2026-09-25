# Issue #78 — pagamento a fornecedor por meio de pagamento

Grafo segundo `docs/agentic/00-doutrina-loop-e-grafo.md`: N0 inspect → N1 oráculo (verificador) → N2
migração (orquestrador) → N3 implementação (autor) → N4 revisão em dois eixos (revisor novo) → N5 verify
→ N6 docs e PR. Oráculo e prova de vermelho em [`issue-78-oraculo.md`](issue-78-oraculo.md).

## O que mudou

`contaPagarService.registarPagamento` lançava sempre D 421 / C 121 no diário BANCO, não criava
movimento de caixa e fazia as contas em `Number()`. Agora o crédito e o diário dependem do meio de
pagamento:

| formaPagamento | Crédito | Diário | MovimentoCaixa |
|---|---|---|---|
| `NUMERARIO` | `111` Caixa | CAIXA | `PAGAMENTO` na sessão ABERTA do próprio utilizador |
| `TRANSFERENCIA_BANCARIA`, `CHEQUE` | `ContaBancaria.contaContabilId` (CORRENTE, POUPANCA, DEPOSITO_PRAZO) | BANCO | nenhum |
| `M-PESA`, `E-MOLA` | `ContaBancaria.contaContabilId` (CARTEIRA_MOVEL) | BANCO | nenhum |

- O débito é sempre `421`, num só lançamento equilibrado.
- O movimento de caixa leva `documentoOrigemTipo 'Pagamento'` e `documentoOrigemId = pagamento.id`.
- Tudo corre numa só transacção. O resolvedor corre antes de qualquer escrita, por isso uma recusa não
  deixa nada gravado.

Erros (`BusinessRuleError`, salvo indicação):

| Situação | Código |
|---|---|
| Numerário sem sessão aberta do próprio utilizador | `SESSAO_CAIXA_NECESSARIA` |
| Conta bancária de outro tenant ou inexistente | `NotFoundError` (404) |
| Conta bancária inactiva | `CONTA_BANCARIA_INATIVA` |
| Tipo de conta que não serve para a forma | `CONTA_BANCARIA_INCOMPATIVEL` |
| Conta bancária em falta fora de numerário (o Zod já a pede) | `CONTA_BANCARIA_OBRIGATORIA` |
| Forma desconhecida, vinda de um chamador que contorne o Zod | `FORMA_PAGAMENTO_INVALIDA` |

Com `NUMERARIO`, um `contaBancariaId` enviado é ignorado.

### Peças

- **Migração** `20260925110121_pagamento_fornecedor_meio`:
  - `TipoMovimentoCaixa += PAGAMENTO` e `TipoContaBancaria += CARTEIRA_MOVEL`, com `ADD VALUE`.
  - Conta `111 Caixa` (filha de `11`, DEVEDORA, lançável) para os tenants existentes, por
    `INSERT … SELECT … ON CONFLICT DO NOTHING`.
  - Os tenants futuros recebem-na do `plano-contas-pgc.json` pelo tenant-bootstrap, que não precisou de
    código novo.
- **Contrato** `financas/meio-pagamento.service.ts → resolverContaMeioPagamento(tx, { forma, contaBancariaId? }, ctx)
  → { contaCodigo, diarioTipo, sessaoCaixaId? }`. Usa só `findFirst` com `tenantId` explícito e não
  importa nada de compras.
- **Constantes client-safe:**
  - `src/lib/meios-pagamento.ts`: `FORMAS_PAGAMENTO` e `TIPOS_CONTA_POR_FORMA`, partilhadas pelo Zod, pelo
    resolvedor e pelo formulário.
  - `src/lib/caixa-movimentos.ts`: `MOVIMENTOS_ENTRADA` e `MOVIMENTOS_SAIDA`, usados por `resumoSessao`,
    `fecharSessao`, pelo KPI de despesa (`analytics.service`) e pela tabela de movimentos. Antes eram
    quatro cópias literais.
- **Zod** `CreatePagamentoSchema`:
  - `formaPagamento` é um enum.
  - `contaBancariaId: idEntidade()` é obrigatório fora de numerário.
  - `contaPagarId` passou a `idEntidade()`.
  - A coluna `Pagamento.formaPagamento` continua `String`.
- **UI:**
  - O formulário `/fornecedores/contas-pagar/[id]/pagar` mostra o campo «Conta bancária» filtrado pela
    forma.
  - Em numerário, mostra a sessão aberta ou, sem ela, um aviso com ligação para `/caixa/abertura`, e o
    botão fica inactivo.
  - As contas bancárias aceitam o tipo «Carteira móvel (M-Pesa, e-Mola)».
- **Seed:**
  - A carteira `M-Pesa 841234567` fica ancorada na `121` (decisão C2), para o razão da demo não mudar.
  - Os pagamentos do seed passam `contaBancariaId`: Millennium bim para transferência e cheque, a carteira
    para M-Pesa.
- **Leitura (ADR-0032):**
  - `registarPagamentoAction` continua sem `permiteEmLeitura`. Pagar a um fornecedor é escrita e fica
    travado em Leitura.
  - O «pagar nunca se trava» do ADR diz respeito à subscrição (decisão C3).

## Decisões

- **D1.** Nova conta `111` Caixa. Tornar a `11` lançável partia a hierarquia e os agregados do balancete.
- **D2.** M-Pesa e e-Mola são `ContaBancaria` do tipo `CARTEIRA_MOVEL`. Assim reconciliam (ADR-0038) e
  entram na tesouraria (ADR-0036).
- **D3.** Novo tipo de movimento `PAGAMENTO`, que conta como saída. Não reutiliza `SANGRIA`, que é uma
  transferência caixa→cofre.
- **D4.** Numerário exige a sessão aberta do próprio utilizador.
- **D5.** Transferência e cheque creditam a PGC da conta bancária escolhida; deixa de haver 121 fixo.
- **D6.** O histórico não se corrige: os pagamentos antigos em numerário lançados contra a `121` ficam
  como estão (documentos append-only). A correcção, se se quiser, é um estorno manual pelo contabilista.
- **C1.** O verificador adaptou só as entradas dos testes antigos que pagavam com `'TRF'`, e substituiu
  o teste «D 421 / C 121».
- **C2.** A carteira do seed fica na `121`.
- **C3.** O pagamento a fornecedor continua travado em Leitura.

## Alterações a oráculos existentes (todas feitas pelo verificador, com justificação no handoff do oráculo)

- `conta-pagar.service.test.ts` e `wave3-integration.test.ts`: C1.
- `provisionamento-integracao.test.ts`: o bootstrap passa de 502 para 503 contas PGC, por causa da `111`
  (D1).
- `fixtures/projecao-seed-demo.json`: a sentinela `contasBancarias` passa de 3 para 4, por causa da
  carteira do seed.
  - Nenhum número de `esperado` muda: a carteira está na `121`, que já é contada uma vez
    (ADR-0036 §2-bis). A derivação está no handoff do oráculo.
  - Nada foi feito com `vitest -u`.

## Verificação (N5)

| Verificador | Resultado |
|---|---|
| Oráculo (6 ficheiros) | 85/85 verde. Antes: 37 vermelhos, todos por asserção |
| `pnpm gates` | 5/5 |
| `pnpm build` | verde |
| `pnpm check` | tsc e eslint limpos. vitest: 1768 verdes e 1 vermelho, o golden da spec 22, que pára na sentinela `compromissosManuais: 1` |
| E2E `16-pagamento-fornecedor.spec.ts` | 3/3 verdes, contra uma base isolada (`gespro_e2e78`, migrate deploy + seed) num dev server na porta 3010. Na base: numerário → `111 C / 421 D`, diário CAIXA, 1 movimento `PAGAMENTO`; transferência → `121 C / 421 D`, diário BANCO, sem movimento |
| Smoke manual | Cheque, M-Pesa e e-Mola → diário BANCO, crédito na PGC da conta escolhida. Numerário sem sessão (utilizador gestor) → aviso «Não há sessão de caixa aberta…» com a ligação «Caixa › Abertura», e o botão inactivo |
| `pnpm test:integration` | O Testcontainers correu a sério: 29 verdes, 7 saltados, 3 ficheiros vermelhos. Essas falhas são anteriores: os testes escrevem dados que o schema de `main` já não aceita (`PrismaClientValidationError`, por exemplo `User.passwordHash`, que saiu com o Keycloak). Nenhum ficheiro de `test/integration/` foi tocado |

O vermelho do golden **não vem deste trabalho**. A base local tem um compromisso de tesouraria criado à
mão («Pagamento da Internet», 24/09). O golden fica verde depois de alguém o apagar pela UI, ou de lhe
pôr o `deletedAt`.

O E2E corre numa base separada por uma razão: a fixture do golden foi derivada sobre um seed corrido a
23/09 com datas relativas. Semear de novo a base principal noutro dia, ou gravar pagamentos nela,
invalida-a.

## Fora de âmbito (vistos, não tocados)

- **#16:** o fecho de caixa conta o fundo inicial duas vezes. Os testes de caixa desta issue afirmam
  **deltas**, nunca saldos absolutos.
- **#21:** o payroll `marcarPaga` ainda regista `SANGRIA` numa sessão escolhida e credita `121`.
  - Pode reutilizar `resolverContaMeioPagamento(tx, { forma, contaBancariaId }, ctx)` tal como está: o
    resultado dá a conta de crédito, o diário e a sessão.
  - Com `forma: 'NUMERARIO'`, basta passar o `sessaoCaixaId` devolvido a
    `registarMovimentoCaixa(tx, { tipo: 'PAGAMENTO', … })`.
- **#38:** o FINANCEIRO não tem `compras:pagamento:registar`.
- **#4 / #79:** contas vencidas.
- **`Number()` → Decimal fora de `registarPagamento`:**
  - Ainda dentro de `registarPagamento`, o update da `ContaPagar` grava `.toNumber()` (achado M2 da
    revisão). A aritmética é toda em Decimal; só a escrita converte, porque um teste antigo da conta
    VENCIDA afirma números. Fica para quem mexer nesse teste.
  - `valor` continua a entrar como `z.number()`.
- **Tesouraria (ADR-0036):** uma sessão aberta entra por `fundoInicial + totalEntradas − totalSaidas`,
  mas esses totais só são gravados no fecho. Por isso um `PAGAMENTO` numa sessão aberta, tal como uma
  `VENDA`, não mexe na projecção até ao fecho. Além disso, a `111` não está ancorada em conta bancária
  nenhuma. É assim por desenho; nada foi alterado.
- **UI:**
  - O campo «Conta bancária» é um `Select`, não um `Combobox` (achado M5). Chega para poucas contas.
  - O formulário de conta bancária continua a pedir «agência» para uma carteira; no seed ficou
    «Vodacom».
