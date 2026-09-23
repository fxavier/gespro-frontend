# Prompt — Tesouraria: contas a receber e fluxo de caixa (ADR-0036/0037) com subagentes

> Cola o bloco abaixo no Claude Code, a partir da raiz do repositório `gespro/`.
> Põe o Claude Code a agir como orquestrador de um programa novo — o ciclo de tesouraria —
> com subagentes em worktrees separados, a skill `grill-with-docs` a abrir cada fase e os
> gates do `CLAUDE.md` como oráculo do laço.
>
> **Nome da skill**: é `grill-with-docs` (mattpocock/skills), não `drill-with-docs` — o
> `docs/prompt-ciclo-contabilistico-claude-code.md` tem o nome trocado. Instalação:
> `claude plugins install mattpocock-skills` e, uma vez por repositório,
> `/setup-matt-pocock-skills` (já corrido: a secção «Agent skills» do `CLAUDE.md` tem o
> tracker, as labels e o sítio dos domain docs).
>
> **Pré-requisito humano**: nenhum para a fase 0 — ela é que escreve os ADR-0036 e ADR-0037.
> A fase 1 **depende** de esses dois ADRs serem aceites por ti, não pelo agente.

---

```text
Age como o agente `w8-orchestrator` do GestPro, num programa novo: TESOURARIA — contas a
receber e fluxo de caixa. Não escreves código de features — coordenas, congelas contratos,
geras migrations e decides gates.

## REGRA ZERO — o design é o ADR, e o trabalho é um grafo
Os ADR-0036 (contas a receber) e ADR-0037 (fluxo de caixa) ainda não existem; a FASE 0
escreve-os. A partir daí são a especificação: um agente que contrarie o seu ADR está errado
mesmo que os testes passem. Se um ADR estiver errado, PÁRA e escreve outro (ADR-0023: nunca
se reescreve um aceite; próximo número livre em `docs/decisions/README.md`).

O trabalho NÃO é uma lista de tarefas. É um grafo dirigido acíclico, e cada aresta é uma
dependência declarada — quem lê uma coluna depende de quem a escreve, quem projecta depende
de quem grava. Antes de lançar qualquer fase, escreve o grafo em
`docs/handoff/tesouraria-grafo.md` no formato: `<nó> --[o que atravessa a aresta]--> <nó>`.
Fan-out só acontece depois do contrato da aresta estar CONGELADO e escrito. Se dois nós
escrevem o mesmo ficheiro, não são paralelos — são um nó só.

## SKILL DE ABERTURA — `grill-with-docs`
Antes de lançar cada fase, e em cada subagente antes da primeira linha de código, invoca
`grill-with-docs`. LÊ A SKILL PRIMEIRO e segue-a à letra; o que se segue é o âmbito a
passar-lhe, não uma substituição do procedimento dela. Documentos de entrada, por ordem:
  1. o ADR da fase (é o design);
  2. `CLAUDE.md` — regras invioláveis, migrations não-interactivas, os cinco gates;
  3. `.claude/skills/{prisma-conventions,api-conventions,ui-conventions}`;
  4. `docs/decisions/ADR-0033|0034|0035` — período, IVA e encerramento já mandam nesta área;
  5. os ficheiros reais, com números de linha, por `git grep` — NUNCA `find` a partir da raiz
     (`wt/` tem 30 worktrees pré-monorepo e devolve o ficheiro certo no sítio errado; o ERP
     real está em `apps/erp/`).
Skills de disciplina, invocadas pelo modelo dentro das fases: `tdd` (todo o código novo),
`domain-modeling` (fase 0), `codebase-design` (fronteira serviço/projecção),
`diagnosing-bugs` (só quando um teste vermelho não cede à primeira hipótese),
`estado-com-escritor` (qualquer coluna de estado nova), `engineering:architecture` (ADRs).

## OS QUATRO ACHADOS — verificados no código, não são decisões
Confirmados em `apps/erp/src/server/services/financas/faturacao.service.ts` e
`src/lib/validations/faturacao.ts`. São a razão de a fase 1 existir antes de tudo:
  A. `registarPagamento` (`:560-597`) NÃO chama `registarLancamentoContabilistico`. A emissão
     lança (`:499`), a nota de crédito lança (`:677`), a nota de débito lança (`:822`) — o
     recebimento não. Consequência: a conta 411 acumula tudo o que se facturou e nunca desce;
     o balancete e a DRE dão o cliente eternamente em dívida. É o espelho exacto do defeito
     que o ADR-0034 corrigiu em `conta-pagar.service.ts`.
  B. `RegistarPagamentoFaturaSchema` aceita `sessaoCaixaId` e a implementação ignora-o
     (`:560-597` não o referencia). Recebe-se dinheiro ao balcão e o caixa não sabe.
  C. `registarPagamento` faz UPDATE de `Fatura.totalPago` — valor mutado num documento
     transaccional que o `CLAUDE.md` declara append-only — e não grava linha nenhuma de
     recebimento: não há quem, quando, por que meio, com que referência. O histórico do
     recebimento não existe, logo não é auditável nem estornável.
  D. `valor: z.number().multipleOf(0.01)` põe dinheiro em Float na fronteira (o `.toFixed(2)`
     mascara, não resolve) e `faturaId: z.string().cuid()` contraria a regra inviolável do
     `idEntidade()`.
Exige um teste por achado, a trancar o comportamento correcto, ANTES da correcção, e que cada
um falhe primeiro. Sem isso não se sabe se o defeito era o que se julgava.

## SETUP
  git switch -c tesouraria
Um worktree por agente paralelo, criado só quando a fase arranca:
  git worktree add wt/tes-<nome> -b tes-<nome>
Ninguém faz merge senão tu, e só com parecer do `code-reviewer` sem BLOCKERs.
Migrations Prisma NUNCA são geradas por agentes — só por ti, no fim de cada fase, pelo
procedimento não-interactivo do `CLAUDE.md` (`migrate diff --from-config-datasource
--to-schema prisma/schema --script` + `migrate deploy`), e o `migrate diff` final tem de
devolver *empty migration*.

## FASE 0 — descoberta e decisão. Sem código. Sozinha.
Agente: tu, com `grill-with-docs` + `domain-modeling` + `research` + `engineering:architecture`.
Entregas: `docs/decisions/ADR-0036-contas-a-receber.md` e
`docs/decisions/ADR-0037-fluxo-de-caixa.md`, ambos em `Proposto`, mais o grafo em
`docs/handoff/tesouraria-grafo.md`.

O ADR-0036 tem de decidir, e justificar, exactamente isto:
  §1 **Quantos caminhos de recebimento existem.** Hoje há dois que não se conhecem:
     `faturacao.service.registarPagamento` e `PagamentoVenda` (`comercial.prisma:415`, escrito
     por `venda.service.ts`, sem ligação à contabilidade nem ao caixa). Um terceiro modelo
     novo sem decidir o destino destes dois é dívida, não feature. Opções: (a) `Recebimento`
     como único escritor e os dois caminhos passam a delegar; (b) `PagamentoVenda` fica como
     detalhe de POS e converte-se em `Recebimento` na emissão da factura. Decide uma.
  §2 **Livro de partidas em aberto ou projecção sobre `Fatura`.** A projecção é mais barata e
     parte quando entram notas de crédito, adiantamentos e um recebimento que liquida várias
     facturas. Se decidires `ContaReceber` + `Recebimento`, a forma é simétrica de
     `ContaPagar`/`Pagamento` (`compras.prisma`) — e essa simetria é o argumento, porque é o
     que permite um fluxo de caixa previsional com um só formato de linha dos dois lados.
     `Fatura` continua append-only; `totalPago` passa a derivado, nunca fonte.
  §3 **O par contabilístico do recebimento**, conferido contra o que a emissão já lança em
     `:499`: D 111/121 (caixa ou banco, conforme o meio) / C 411. Escreve os códigos reais
     lidos de `prisma/seed/data/plano-contas-pgc.json`, não de memória.
  §4 **Meio de recebimento → destino**: numerário exige `sessaoCaixaId` e gera
     `MovimentoCaixa`; transferência/cheque exige `contaBancariaId` e fica disponível à
     `ReconciliacaoBancaria`. Sem destino não há recebimento.
  §5 **Estorno**, nunca UPDATE: o recebimento errado corrige-se por contra-lançamento, com
     motivo e autor, como o ADR-0033 já obriga ao estorno contabilístico.
  §6 **Excesso**: hoje `pendente.lessThanOrEqualTo(0)` engole o troco e marca PAGA. Decide se
     é `BusinessRuleError('RECEBIMENTO_EXCEDE_SALDO')` ou adiantamento em conta própria.
  §7 **Período**: um recebimento cai no período do ADR-0033 e não entra em período fechado.
  §8 Máquina de estados de `ContaReceber` e o seu escritor, pela skill `estado-com-escritor`.
  §9 Permissões novas em `prisma/seed/rbac.ts`. Nenhuma leva `permiteEmLeitura` — receber é
     escrita (ADR-0032 §2).

O ADR-0037 tem de decidir:
  §1 Que o fluxo de caixa é **read-model, sem escritor** — projecção, zero escrita em
     `Lancamento`/`PartidaLancamento` (o `gate-periodo` fá-lo falhar se tentar).
  §2 **Realizado**: de `MovimentoCaixa` + movimentos de `ContaBancaria`, por período do
     ADR-0033, e a igualdade que o prova — o realizado do período tem de bater com a variação
     dos saldos das contas 11/12 no balancete. É este o teste que distingue relatório de
     adivinha.
  §3 **Previsional**: `ContaReceber.dataVencimento` menos `ContaPagar.dataVencimento`, em
     escalões de idade (corrente, 1-30, 31-60, 61-90, +90), com a data de referência
     explícita e em `Africa/Maputo`.
  §4 Directo ou indirecto, e porquê. Não os dois na primeira entrega.
  §5 Que a agregação corre em SQL com `tenantId` no WHERE, não em JS sobre páginas.

GATE DA FASE 0: os dois ADRs existem, citam ficheiros com linha, e o grafo está escrito.
Nenhum ficheiro de `src/` mexido.

## PARAGEM OBRIGATÓRIA 1 — aceitação humana
PÁRA. Marcar um ADR como `Aceite` é acto humano. Não avances com nenhum dos dois em
`Proposto`. Se o humano não responder, abre issue no `fxavier/gespro-frontend` via `gh` com a
label `ready-for-human` e fica parado.

## FASE 1 — achados + livro de partidas em aberto. Sozinha, mergida isolada.
Vai sozinha porque toda a escrita de recebimento passa a atravessar o mesmo caminho:
paralelizar isto é garantir conflito em `faturacao.service.ts`.
Agente: `domain-financas` (é o dono de `faturacao.service.ts` e de `contabilidade.service.ts`).
Skills: `grill-with-docs`, `tdd`, `prisma-conventions`, `api-conventions`,
`estado-com-escritor`.
Âmbito: os quatro achados A-D primeiro, cada um com o seu teste vermelho; depois o §2 do
ADR-0036 (modelos), o §3 (lançamento), o §4 (destino), o §5 (estorno), o §6 (excesso).
Declara que é o `domain-financas` que toca em `venda.service.ts` para o §1 — são poucas linhas
em `comercial` e não vale um segundo worktree — e avisa o `domain-comercial` de que não mexe
nesse ficheiro nesta fase.
MIGRATION (só tu): `ContaReceber` nasce a partir das facturas em aberto — backfill de
`Fatura` com `status` em EMITIDA/PARCIALMENTE_PAGA/VENCIDA, `valorRecebido` = `totalPago`
actual — e só depois as colunas ficam `NOT NULL`. O histórico de recebimentos anteriores não é
reconstituível por meio nem por data: nasce como um `Recebimento` de abertura, marcado como
tal, ou fica fora — decide no ADR, não na migration.
GATE: `pnpm check`, `pnpm gates` (cinco a zero), `pnpm e2e` verdes; os quatro testes dos
achados vermelhos antes e verdes depois; um teste de concorrência a provar que dois
recebimentos simultâneos não pagam a mesma factura duas vezes; um teste de que o recebimento
não entra em período fechado; `prisma migrate diff` a devolver *empty migration*.
Merge isolado.

## CONTRATO CONGELADO — escreve-o antes de lançar a FASE 2
É a fronteira entre os dois agentes paralelos. Nenhum dos dois o altera; quem precisar de
mudança vem ter contigo e a fase pára.
  - a forma de linha do read-model (uma só, para realizado e previsional):
    { data, tipo: 'ENTRADA'|'SAIDA', origem, referencia, valor: Decimal, contaId, periodoId }
  - as assinaturas em `fluxo-caixa.interface.ts` e o módulo que as exporta;
  - que tudo sai serializado (`Decimal` → `string`) pela convenção do `createSafeAction`;
  - os escalões de idade e a data de referência, do ADR-0037 §3.

## FASE 2 — dois agentes em paralelo (Task tool, as duas chamadas na MESMA mensagem)
  - `domain-financas` em `wt/tes-projecoes`: `fluxo-caixa.service.ts` +
    `fluxo-caixa.interface.ts`, agregação em SQL, mapa de idades, o teste de igualdade do
    ADR-0037 §2. Skills: `grill-with-docs`, `tdd`, `codebase-design`, `api-conventions`.
  - `ui-financas` em `wt/tes-ui`: ecrãs de contas a receber (lista, detalhe, registar
    recebimento, mapa de idades) e de fluxo de caixa, contra o contrato congelado — com dados
    de teste, não à espera do outro agente. Skills: `grill-with-docs`, `ui-conventions`.
    Sem modais: criar/editar/detalhar são rotas. Zero cores hardcoded, dark mode. Datas por
    `src/lib/format-date.ts` e dinheiro por `formatMZN` — nunca `toLocaleString`.
GATE: `pnpm check`, `pnpm gates`, `pnpm e2e` e `pnpm build` (o standalone apanha
`useSearchParams` sem `Suspense`, que o check não apanha) verdes nos dois worktrees. Merge um
de cada vez, o segundo rebaseado sobre o primeiro.

## FASE 3 — fecho
`qa-e2e`: um percurso ponta a ponta — emitir factura, receber parcial por numerário com sessão
de caixa aberta, receber o resto por transferência, estornar um recebimento, e o balancete da
411 a bater no fim. `w8-docs`: `docs/status.md`, `CONTEXT.md` e um runbook em
`docs/runbooks/` para o fecho de tesouraria. Issue de programa fechada via `gh`.

## LOOP OBRIGATÓRIO — em cada subagente, em cada nó do grafo
Não entregues por inspecção. O laço é: teste vermelho → código mínimo → `pnpm check` →
`pnpm gates` → verde → refactor → `code-reviewer`. O oráculo é o comando, não a tua leitura
do diff. Se o mesmo teste falhar duas vezes pela mesma razão, PÁRA de tentar variantes e
invoca `diagnosing-bugs`: minimiza, instrumenta, forma hipótese, só então corrige. Se um gate
te parecer errado, não o contornes — escreve no handoff e devolve-me a decisão.

## O QUE NÃO SE FAZ
Não escreves em `Lancamento`/`PartidaLancamento` fora do `contabilidade.service.ts`. Não fazes
UPDATE de valores em documentos emitidos. Não pões `tenantId` a vir do cliente. Não geras
migrations. Não marcas ADRs como `Aceite`. Não abres um terceiro caminho de recebimento sem o
ADR-0036 §1 o decidir. Não fazes merge sem parecer limpo do `code-reviewer`.

Começa pela FASE 0. Escreve-me o grafo antes de escrever os ADRs.
```
