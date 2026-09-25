# Handoff — grafo `dfc`, nó `seed` (tickets 4.1 e 4.2; o 4.3 ⚙ `22c` é do orquestrador)

- **Data**: 2026-09-25 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `servico-v`
  (depois do ⚙ `22c`)
- **Depende de**: `seed-v` (FEITO — [`dfc-seed-v.md`](dfc-seed-v.md), oráculo em `aab9176`)
- **Agente**: `feat-dfc`, worktree `wt/feat-dfc` (ramo `ws-2-dfc`, base `02b2f17`). Sem commit; sem migração; sem
  `db:seed`; a base local não foi tocada.
- **Gate do nó**: `npx vitest run src/server/provisioning/__tests__/tenant-bootstrap.test.ts` → **31/31** sem
  alterações ao ficheiro ✅ · `npx tsc --noEmit -p .` → 0 ✅ · `pnpm check && pnpm gates` — ver «Verificação» ✅
  (único vermelho: `projecao.golden.test.ts`, resíduo conhecido da base) · **1 volta** (o oráculo passou à primeira)
  + **FIX volta 1/3** da revisão (2 MAJOR, 1 MINOR, 2 NIT) — ver «FIX (volta 1)».
- **Estado**: 4.1 e 4.2 entregues; a 22c já foi aplicada pelo orquestrador. FIX da revisão aplicado.

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/prisma/seed/data/rubricas-fluxo-caixa.json` | **4.1.** 19 rubricas `SISTEMA` (1 CAIXA · 11 OPERACIONAL · 4 INVESTIMENTO · 3 FINANCIAMENTO) e a rubrica de **cada** uma das 435 contas folha de `plano-contas-pgc.json` (`conta`, `nome`, `rubrica`). Uma conta, uma rubrica. |
| `apps/erp/src/server/provisioning/tenant-bootstrap.ts` | **4.2.** `semearRubricasFluxo(tx, tenantId)` exportada; chamada no fim de `bootstrapContabilidade`. Ids uuid pelo bootstrap; `createMany` + `skipDuplicates`; relê as rubricas por código; versão 1 `PENDING` com `instantaneoDe` lido **depois** dos mapeamentos; lança sem plano de contas; **tenant que já tem versão ⇒ devolve `{0, 0, false}` sem escrever nada** (FIX volta 1); conta do JSON ausente do plano → sem linha. |
| `apps/erp/prisma/seed/financas.ts` | `seedPlanoContas` chama `semearRubricasFluxo` a seguir às naturezas de ND (log com contagens; na 2.ª corrida «o tenant já tem versão do mapeamento — nada escrito»). |
| `apps/erp/prisma/seed/volume/base.ts` | `seedTenantBase` chama `semearRubricasFluxo` depois do bootstrap partilhado e **antes** das contas `9.n` (que ficam por mapear de propósito — não são do plano canónico; a DFC de um tenant `perf-*` di-lo como impedimento, que é o comportamento certo para contas do tenant). |
| `apps/erp/package.json` | `db:seed:volume` passa a `tsx -C react-server …`: o `tenant-bootstrap.ts` importa agora `mapeamento-versao.model.ts` (`server-only`), que sem a condição rebenta no import (verificado: `npx tsx` → `throw new Error(…)` em `server-only/index.js`; com `-C react-server` → OK). O `db:seed` já corria assim. |
| `apps/erp/src/server/services/plataforma/__tests__/provisionamento-integracao.test.ts` | `limpar()` apaga `MapeamentoContaFluxo`, `VersaoMapeamentoFluxo` e `RubricaFluxoCaixa` antes de `ContaPGC` (FK `RESTRICT` da 22b, avisado em `dfc-contratos.md`). Não é protegido. |
| `apps/erp/src/server/provisioning/__tests__/rubricas-fluxo-caixa.json.test.ts` | Teste **acessório** (novo, fora dos protegidos): tranca a forma do JSON contra o plano — cobertura exacta e única das 435 folhas, rubricas referidas existem, `nome` igual ao do plano, CAIXA só folhas da classe 1 e **menos** do que a classe 1 (Q6), classes 6/7 numa rubrica OPERACIONAL, uma só rubrica CAIXA, `ordem` única por actividade. 8 casos. |
| `apps/erp/src/server/provisioning/__tests__/semear-rubricas-versionado.test.ts` | Teste **acessório** (novo, FIX volta 1): 2.ª corrida sobre tenant com versão e uma conta desmapeada ⇒ a conta continua desmapeada e **zero escritas** (duplo com estado que regista create/createMany); idem para uma rubrica SISTEMA apagada. Vermelho com o comportamento anterior (`mapeamentos: 1` — remapeou), verde com o FIX. 2 casos. |
| `.github/workflows/perf.yml` | Passo «Seed de volume»: `VOLUME_PROFILE=ci npx tsx prisma/seed/volume/index.ts` → `VOLUME_PROFILE=ci pnpm db:seed:volume` (o passo corre em `apps/erp`, onde o script já leva `-C react-server`). Sem isto o `server-only` transitivo rebentava o job de perf. |
| `docs/handoff/dfc-seed.md` | Este ficheiro. |

Ficheiros protegidos: `git diff aab9176..HEAD -- apps/erp/src/server/provisioning/__tests__/tenant-bootstrap.test.ts
apps/erp/src/server/services/financas/__tests__/` está **vazio** (e o working tree também não os toca).

## INSPECT (resumo)

- O oráculo (`seed-v`) não conhece o conteúdo do JSON: mede cobertura exacta das folhas, idempotência com duplo com
  estado (P2002 sem `skipDuplicates`), V1 (`instantaneoDe` do vivo `toEqual` ao gravado), E2 (≥1 conta CAIXA, sem
  impedimentos **nem avisos** ⇒ CAIXA só folhas activas da classe 1), I10, ids uuid, `origem: SISTEMA`, sem SQL cru, e
  **tem de lançar** sem plano. O caso existente «`bootstrapContabilidade` encadeia os três passos» corre com um plano de
  3 contas (711/781/769) ⇒ o seed não pode lançar por conta em falta.
- O núcleo (`dfc.model.ts`) exclui das secções as contas de `tipo` GASTO/RENDIMENTO (classes 6/7, representadas pelo
  `resultadoLiquido`) e as `CAIXA`; **tudo o resto** flui como `−Δ` em termos de débito. A DRE deixa a classe 8 a
  zero (`impostos = 0`), logo 851/852 (`tipo` RESULTADO) **têm** de fluir como variação — `dfc.property.test.ts`
  fixa-o. É por isso que 851/852 estão numa rubrica real (OP-07) e não na OP-00.
- `mapeamento-versao.model.ts` tem `import 'server-only'`; o `tenant-bootstrap.ts` não tem, de propósito, porque corre
  no `tsx`. Reutilizar `instantaneoDe` (instrução do orquestrador) obrigou a confirmar a cadeia: `db:seed` já corre com
  `-C react-server`; `db:seed:volume` não corria → corrigido.
- `ContaNaturezaNotaDebito.contaId` é escalar (sem FK) — o `limpar()` não precisa dele.

## PLAN (resumo)

1. Tabela 4.1 gerada por listas **explícitas de códigos** (num script descartável fora do repo; nenhum prefixo sobrevive
   em código de produção), com verificação de cobertura exacta antes de escrever o JSON.
2. `semearRubricasFluxo` pela forma de `bootstrapContasNaturezaNotaDebito`; chamada nos três sítios do ticket.
3. Teste acessório do JSON; `limpar()`; script do seed de volume.
4. Oráculo → `tsc` → `pnpm check && pnpm gates` → handoff com a tabela de justificação e a proposta da 22c.

## Decisões do autor

1. **Contas CAIXA = 111, 121, 122, 123** (4 das 7 folhas da classe 1). Q6/E2 dizem «não a classe 1 inteira»: as três de
   `13 Outros instrumentos financeiros` (131 Derivados, 132 Detidos para negociação, 133 Justo valor por resultados) não
   são caixa nem equivalentes (IAS 7 §7: equivalentes são aplicações de curto prazo, prontamente convertíveis, sem risco
   significativo de alteração de valor — derivados e títulos para negociação falham os dois critérios) e vão para
   INV-03. Já `11 Caixa` + `12 Bancos` (à ordem, com pré-aviso, a prazo) são o que o balanço do PGC-NIRF apresenta como
   «Caixa e equivalentes de caixa». **123 Depósitos a prazo** fica em CAIXA por três razões: (a) o demo tem o Standard
   Bank como `DEPOSITO_PRAZO` em 123 e o WS-1 (`saldoTesourariaAte`, ADR-0036 §2-bis) conta-o como tesouraria — pô-lo em
   INV faria o mesmo saldo ser tesouraria na projecção e investimento na DFC; (b) o PGC-NIRF agrupa 12 inteiro em
   equivalentes; (c) é configuração: um tenant com um depósito a mais de 3 meses move-o com `definirContasCaixa`. **Dúvida
   para o parecer** (§Tabela, marcada).
2. **Todas as rubricas com `sinal: VARIACAO`.** No método indirecto cada linha é a variação de saldos entre dois
   balancetes, com o sentido que o núcleo lhe dá conta a conta pela natureza; `ENTRADA`/`SAIDA` («sentido fixo») ficam
   para rubricas `TENANT` e para o método directo (ADR-0037 §8). Uma rubrica `ENTRADA` que num mês saísse negativa
   seria uma mentira de apresentação.
3. **Classes 6 e 7 inteiras numa única rubrica OP-00 «Contas de resultados (incluídas no resultado líquido)»**, `ordem 0`.
   O núcleo exclui-as das secções pelo `tipo`; a rubrica existe porque o I7 exige mapeamento a toda a conta com
   movimento, e uma só chega — reparti-las por «amortizações», «juros» etc. sugeriria um ajustamento que o núcleo não
   faz (ver 5).
4. **Princípio de classificação para as contas de balanço**: a actividade é a do fluxo de caixa que a conta liquida
   (PGC-NIRF, modelo da DFC; IAS 7 §14–17), **excepto** quando a contrapartida habitual da conta é uma conta de
   resultados — aí fica OPERACIONAL, porque o resultado líquido é operacional e o núcleo não «adiciona de volta»
   itens não-caixa. É o caso dos acréscimos (491x, 493x), diferimentos (492x salvo 4924, 494x salvo 4941/4942) e das
   contas de amortizações/imparidades/provisões acumuladas (38x, 39x, 29x, 47x, 48x), cuja variação **é** o
   ajustamento não-caixa do método indirecto (Dr 65x Cr 38x ⇒ RL −X em OP e OP-01 +X: soma 0, como deve ser).
5. **Limitação estrutural a registar para o parecer**: o núcleo é puramente de balanço; não reclassifica gastos/rendimentos
   entre actividades. Consequências: (a) juros pagos/recebidos ficam em OPERACIONAL (IAS 7 §33 permite; o modelo
   PGC-NIRF põe juros pagos em FIN e recebidos em INV) — e por isso 4911/4931 estão em OP-10, não em FIN/INV, senão o
   acréscimo e a sua liquidação apareceriam em actividades diferentes com soma zero (artefacto); (b) mais-valias de
   alienação (763/683) ficam no RL (OP) e o abate ao valor contabilístico em INV — o total articula, a repartição
   OP/INV difere da IAS 7 estrita; (c) para 4924, 4921/4922/4941/4942, 4614 e 56x/58x escolhi a actividade do fluxo de
   caixa (INV/FIN), aceitando que o reconhecimento posterior em resultados apareça nessa actividade com sinal contrário
   (soma sempre zero). Estão todas **marcadas** na tabela.
6. **Reexecução do seed num tenant que já tem versão** — ~~o `createMany` com `skipDuplicates` volta a mapear uma conta
   desmapeada~~ **corrigido na FIX volta 1** (MAJOR 1 da revisão, decisão do orquestrador): `semearRubricasFluxo` lê
   `versaoMapeamentoFluxo.findFirst({ where: { tenantId } })` **antes de qualquer escrita** e, havendo versão, devolve
   `{ rubricas: 0, mapeamentos: 0, versaoCriada: false }` sem escrever nada — nem mapeamentos desmapeados, nem rubricas
   SISTEMA novas do JSON (que também seriam escrita do mapeamento sem versão n+1, V2). Ordem das guardas: primeiro
   «sem plano ⇒ lança» (defeito de ordem de bootstrap, seja qual for a versão), depois «já versionado ⇒ nada».
   Consequência: uma rubrica SISTEMA acrescentada ao JSON no futuro **não** chega a tenants existentes pelo seed — chega
   por migração de dados que crie a versão n+1 (ver «FIX (volta 1)»).
7. **Acoplamento a vigiar**: no dia em que a DRE incluir a classe 8 no `lucroLiquido` (ADR-0035 §4), o núcleo tem de
   passar a excluir também `tipo: RESULTADO`, senão 851/852 contam duas vezes — o `verificarArticulacao` apanha-o
   (`DFC_NAO_ARTICULA`), não passa em silêncio. 851 tem natureza `CREDORA` no seed (nota da própria DRE); o núcleo é
   consistente pela natureza, por isso articula na mesma.
8. **`ordem` é por actividade** (índice `[tenantId, atividade, ordem]`; `montarSeccoesDFC` ordena por `ordem` dentro
   da secção). Numeração 0..n por secção.

## FIX (volta 1) — revisão do code-reviewer

- **MAJOR 1** (V1/V2 partidos em silêncio numa 2.ª corrida): corrigido — Decisão 6 acima + teste acessório
  `semear-rubricas-versionado.test.ts`. O caso 3 do oráculo («o seed não é uma escrita do mapeamento») continua verde e
  agora é verdade por inteiro, não só para contas movidas.
- **MAJOR 2** (`perf.yml` com `npx tsx` sem `-C react-server`): corrigido para `pnpm db:seed:volume`. Procurados com
  `git grep -n "prisma/seed/volume/index.ts\|tsx prisma/seed"` os outros chamadores directos: só havia esse no CI.
  Restam dois **comentários** — o cabeçalho de `tenant-bootstrap.ts` (alinhado: diz agora que os seeds correm sempre
  com `-C react-server`) e um em `compras/__tests__/wave3-integration.test.ts:8` (`npx tsx prisma/seed/index.ts`),
  **não tocado** por estar em `__tests__/`; é só texto, mas quem o seguir à letra rebenta no `server-only` — usar
  `pnpm db:seed`. `perf/README.md` e o `CLAUDE.md` já mandam `pnpm db:seed:volume`.
- **MINOR — 22c e tenants já versionados.** A 22c aplicada condiciona o passo 3 (versão 1) a tenants sem versão, mas
  **não** os passos de rubricas e mapeamentos. Sem efeito hoje (quando correu não havia tenant nenhum com versão —
  a 22b acabava de criar a tabela). **Regra para qualquer migração de dados futura da DFC** (rubricas SISTEMA novas,
  remapeamentos): ou leva `AND NOT EXISTS (SELECT 1 FROM "VersaoMapeamentoFluxo" v WHERE v."tenantId" = c."tenantId")`
  em cada `INSERT … SELECT`, ou cria ela própria a versão n+1 com o instantâneo novo (V2). Escrever no mapeamento de um
  tenant versionado sem nenhuma das duas deixa o vivo a divergir da última versão (V1) sem ninguém saber.
- **NIT (a) — tenants `perf-*`.** As contas `9.n` que o `seed:volume` cria não são do plano canónico e ficam por
  mapear de propósito: `gerarDFC` num tenant `perf-*` devolve `impedimentos`. Quando a DFC entrar nos cenários k6
  (`perf/k6`), o gerador de volume tem de mapear essas contas (ou o cenário mede o caminho do impedimento, que não é o
  que interessa medir).
- **NIT (b)** — para o parecer, acrescentado em «⚠ Estrutura do plano» abaixo.
- **Verificação do FIX**: `tenant-bootstrap.test.ts` 31/31 (intacto) + acessório 2/2 · `tsc --noEmit` 0 ·
  `pnpm check`: 137 ficheiros verdes, 1 vermelho (`projecao.golden.test.ts`, `compromissosManuais` 1 vs 0 — resíduo
  conhecido), `Tests 1908 passed | 3 skipped` · `pnpm gates` 5/5 OK, `gate-periodo` a zero.

## Tabela 4.1 — justificação conta a conta (material do nó `parecer`)

Uma linha por grupo homogéneo (o grupo é evidente pela agregadora do PGC); **⚠** marca dúvida para o contabilista.
Método indirecto (IAS 7 §18(b)); actividades pelo modelo da DFC do PGC-NIRF (Decreto 70/2009). Códigos, nomes e
agregadoras são os de `plano-contas-pgc.json`.

| Rubrica | Contas (folhas) | Justificação | ⚠ |
|---|---|---|---|
| **CX-01** Caixa e equivalentes | 111 Caixa · 121 Dep. à ordem · 122 Dep. com pré-aviso · 123 Dep. a prazo | 11 + 12 = «Caixa e equivalentes de caixa» do balanço PGC-NIRF; 123 é conta bancária de tesouraria no ERP (ver Decisão 1). | ⚠ 123 se o prazo for > 3 meses (IAS 7 §7) — o tenant pode movê-lo. |
| **INV-03** (parte) | 131 Derivados · 132 Detidos para negociação · 133 Justo valor por resultados | Não são equivalentes de caixa (IAS 7 §7); são aplicações financeiras. | ⚠ IAS 7 §15: títulos detidos **para negociação** podem ser OPERACIONAIS («semelhantes a inventários»). |
| **OP-03** Inventários e activos biológicos | 21 Compras (211–218) · 22 Mercadorias (221, 222) · 23 (231) · 24 (241, 242) · 26 Matérias (261–264) · 27 Activos biológicos (271–2722) · 28 Regularização de inventários (282–287) | Capital circulante: o aumento de inventários consome caixa. 21x são contas de compras (transitórias no PGC) — a sua variação líquida é variação de inventário; 28x regulariza contagens contra 684/764 (resultado) e fica no mesmo lado. | — |
| **OP-02** (parte) | 29 Ajustamentos p/ valor realizável líquido (292–297) | Contra-conta de imparidade de inventários: variação = ajustamento não-caixa (Dr 641 Cr 29x). | — |
| **INV-03** (parte) | 31 Investimentos financeiros (311–316) | Aquisição/alienação de participações e títulos: IAS 7 §16(c)(d); PGC «pagamentos/recebimentos de investimentos financeiros». | — |
| **INV-01** | 32 Activos tangíveis (321–329) · 342 Investimentos em curso — tangíveis · 461 Fornecedores de investimentos (4611, 4612, 4613, 4619) | Compra/venda de tangíveis: IAS 7 §16(a)(b). O fornecedor de investimentos liquida a compra do activo: fica na mesma actividade para que a aquisição a crédito some zero e o pagamento apareça como «pagamento respeitante a activos tangíveis». | — |
| **INV-02** | 33 Activos intangíveis (331–334) · 343 Investimentos em curso — intangíveis | Idem, intangíveis (331 Despesas de desenvolvimento capitalizadas incluídas). | — |
| **OP-01** Amortizações e depreciações | 38 Amortizações acumuladas (382, 383, 386, 387) | O ajustamento não-caixa por excelência do método indirecto: a variação da contra-conta é a amortização do período (Dr 65x Cr 38x). Abates (Dr 38x) são compensados pelo activo em INV-01 ao valor líquido. | — |
| **OP-02** (parte) | 39 Imparidade acumulada de investimentos de capital (391–397) · 47 Perdas por imparidade acumuladas de contas a receber (471, 472) · 48 Provisões (481–489) | Ajustamentos não-caixa: contra-contas cujas variações espelham 64x/66x/74x. | ⚠ 395 (imparidade de ANC detidos para venda): a alienação do activo é INV; a imparidade é OP. Consistente com 39x. |
| **OP-04** Clientes | 411, 412, 418, 419 Adiantamentos de clientes | Capital circulante operacional (IAS 7 §14(a)); 419 é passivo operacional (recebimento antecipado). | — |
| **OP-05** Fornecedores | 421, 422, 429 Adiantamentos a fornecedores | Capital circulante operacional (IAS 7 §14(c)). 421 tem natureza DEVEDORA no seed — o núcleo assina pela natureza, conta a conta, e articula na mesma. | — |
| **OP-06** Estado e outros entes públicos | 442 Retenções na fonte (4421–4425) · 443 IVA (4431–4439 e subcontas) · 444 Restantes impostos (4441, 4442) · 445 Rectificações · 449 INSS | Impostos e contribuições da actividade corrente (IVA, retenções, INSS): pagamentos operacionais. 44331 IVA liquidado com natureza DEVEDORA no seed — mesma nota que 421. | — |
| **OP-07** Imposto sobre o rendimento | 441 IRPC (4411 Estimativa, 4412 Pag. por conta, 4413 PEC) · 446 Impostos diferidos (4461, 4462) · **851 Imposto corrente · 852 Imposto diferido** | Linha própria do modelo PGC/IAS 7 §35 («imposto sobre o rendimento pago», OP salvo se identificável a INV/FIN). 851/852 são classe 8 (`tipo` RESULTADO): a DRE não os inclui no resultado, por isso fluem aqui como variação e a estimativa (Dr 851 Cr 4411) soma zero até ser paga. | ⚠ Ver Decisão 7 (acoplamento à DRE). |
| **OP-08** Pessoal | 451 Pessoal — devedores (4511–4519) · 462 Pessoal — credores (4621–4629) · 463 Sindicatos | Adiantamentos e remunerações a pagar: «pagamentos ao pessoal» (IAS 7 §14(d)). | — |
| **OP-09** Outros devedores e credores | 455 Subsídios a receber (4551, 4552) · 459 Devedores diversos · 466 Consultores, assessores · 469 Credores diversos | Capital circulante residual da exploração. 455: o subsídio à exploração (762) é rendimento operacional. | ⚠ 455 se o subsídio a receber for ao investimento (contrapartida 4924) — seria INV-04. |
| **OP-10** Acréscimos e diferimentos | 491 Acréscimos de gastos (4911 Juros a pagar, 4912 Remunerações, 4919) · 492 Rendimentos diferidos (492, 4923, 4929) · 493 Acréscimos de rendimentos (4931 Juros a receber, 4933, 4939) · 494 Gastos diferidos (494, 4949) | Contrapartida de gastos/rendimentos do período: a variação é a diferença entre o reconhecido (no RL) e o pago/recebido — é o ajustamento de capital circulante. | ⚠ 4911/4931: o modelo PGC põe juros pagos em FIN e recebidos em INV; IAS 7 §33 permite OP. Ficam em OP pela Decisão 5(a). |
| **INV-04** Subsídios ao investimento | 4924 Subsídios para investimentos | Recebimento de subsídio ao investimento: linha do modelo PGC em INV. | ⚠ O reconhecimento em 761 aparece em INV com sinal contrário (soma zero) — Decisão 5(c). |
| **FIN-01** Financiamentos obtidos | 43 Empréstimos obtidos (431, 4311, 4312, 432, 4321, 4322, 433, 439) · 453 Obrigacionistas (devedores) · 465 Obrigacionistas (credores) · 4671 Empréstimos de sócios · 4614 Locação financeira · 4921, 4922 Prémios de emissão · 4941, 4942 Descontos de emissão | Obtenção e reembolso de financiamentos (IAS 7 §17(c)(d)); prémios/descontos de emissão são parte do encaixe da emissão; locação financeira: §17(e). | ⚠ 4614: o reconhecimento inicial (Dr 32x Cr 4614) sai INV −X / FIN +X — IAS 7 §43 exclui-o como não-caixa; o núcleo não o consegue excluir. ⚠ 4921/4922/4941/4942: amortização posterior em resultados aparece em FIN com sinal contrário. ⚠ 465: juros vencidos a obrigacionistas — mesmo tema de 4911. |
| **FIN-02** Capital próprio e reservas | 52 Acções ou quotas próprias (521, 522) · 55 Reservas (551–553) · 56 Excedentes de revalorização (561, 5611, 5612, 562) · 58 Outras variações no capital próprio (581, 582, 589) · 452 Subscritores de capital (4521, 4522, 4529) | Realizações e reduções de capital, aquisição de acções próprias (IAS 7 §17(a)(b)). 452 fica com 52/51 para que a subscrição some zero e a realização apareça como entrada. | ⚠ 55x/56x/58x são quase sempre **não-caixa** (aplicação de resultados, revalorização): a sua variação aparece em FIN com contrapartida em INV (revalorização) ou em 59 (que não tem folha no plano). ⚠ **51 Capital e 59 Resultados transitados não têm contas folha** no plano canónico — o seed não pode mapear o que não existe; se o tenant as criar, nascem por mapear (I7). |
| **FIN-03** Dividendos e operações com sócios | 454 Devedores — sócios (4542 Adiant. por conta de lucros, 4543, 4544, 4549) · 467 Credores — sócios (4673 Resultados atribuídos, 4674 Lucros disponíveis) | Dividendos pagos (IAS 7 §31, §34: FIN). 454/467 (as próprias folhas) idem. | ⚠ 4541 Empréstimos **concedidos** a sócios está em INV-03 (empréstimo feito a terceiros, §16(e)), não aqui. |
| **INV-03** (parte) | 4541 Empréstimos concedidos · 464 Credores por subscrições não liberadas | 4541: adiantamento/empréstimo feito a terceiros (IAS 7 §16(e)). 464: dívida por participações subscritas — liquida em INV com 31x. | — |
| **OP-00** Contas de resultados | Classes 6 e 7 inteiras (135 + 78 = 213 folhas) | Representadas pelo `resultadoLiquido` da DRE (I9); o núcleo exclui-as das secções pelo `tipo`. A rubrica existe para o I7 (toda a conta com movimento tem mapeamento). | — |

### ⚠ Estrutura do plano (para o parecer; NIT (b) da revisão)

- **Contas-mãe com `aceitaLancamento: true`** no `plano-contas-pgc.json` (ex.: 492, 461, 454, 467, 494) — são
  simultaneamente agregadoras e folhas, e o seed mapeia-as como folhas. A revisão contou 65; a contagem por prefixo de
  código (folha que é prefixo de outra folha) dá **64** — a diferença não foi reconciliada, o parecer deve recontar.
  Quatro estão numa **actividade diferente da de alguma filha**: 492 (OP-10) vs 4921/4922 (FIN-01) e 4924 (INV-04);
  494 (OP-10) vs 4941/4942 (FIN-01); 461 (INV-01) vs 4614 (FIN-01); 454 (FIN-03) vs 4541 (INV-03). A 467 (FIN-03) tem
  4671 noutra rubrica (FIN-01) mas na mesma actividade. Não parte a articulação (cada conta conta uma vez), mas um
  lançamento na mãe em vez da filha cai na actividade da mãe. O contabilista deve dizer se estas mães devem aceitar
  lançamento e, se sim, em que actividade.
- **5611 e 5612 aparecem duplicadas** no plano JSON; o `bootstrapPlanoContas` deduplica pelo código (a primeira
  ganha) e o JSON das rubricas tem uma linha só para cada. Defeito de dados do plano, a corrigir no JSON.

Contagens: 19 rubricas (CAIXA 1 · OPERACIONAL 11 · INVESTIMENTO 4 · FINANCIAMENTO 3); 435 contas mapeadas = 435
folhas; por rubrica: OP-00 213 · OP-03 36 · OP-06 33 · OP-02 22 · INV-01 18 · FIN-01 16 · FIN-02 16 · OP-08 13 ·
OP-10 13 · INV-03 11 · OP-07 9 · FIN-03 8 · OP-09 6 · INV-02 5 · CX-01 4 · OP-01 4 · OP-04 4 · OP-05 3 · INV-04 1.

## Verificação

- `cd apps/erp && npx vitest run src/server/provisioning/__tests__/tenant-bootstrap.test.ts` → **31 passed (31)**,
  ficheiro intacto (`git diff aab9176..HEAD -- …tenant-bootstrap.test.ts` vazio; sem alterações no working tree).
- `npx vitest run src/server/provisioning/__tests__/rubricas-fluxo-caixa.json.test.ts` → 8 passed (acessório).
- `npx tsc --noEmit -p .` → 0 erros. `npx eslint` nos ficheiros tocados → limpo.
- `pnpm check && pnpm gates` (raiz da worktree): ver a secção «Resultado de check/gates» abaixo.
- Smoke de resolução do `server-only` no `tsx` (ficheiro temporário, apagado): sem `-C react-server` → lança no
  import; com `-C react-server` → «import OK». É a razão da alteração ao script `db:seed:volume`.

### Resultado de check/gates

`pnpm check` (raiz): `prisma validate` ✅ · `tsc --noEmit` ✅ · `eslint .` ✅ (0 erros; 109 avisos pré-existentes
`react-hooks/error-boundaries`, nenhum nos ficheiros deste nó) · `vitest run` → **136 ficheiros verdes, 1 vermelho**:
`projecao.golden.test.ts`, «a base tem resíduos» com `compromissosManuais: 1` vs fixture `0` — o resíduo conhecido
(`dfc-adr.md`, `dfc-contratos.md`), alheio a este nó. `Tests 1906 passed | 3 skipped (1909)`; `CHECK_EXIT=1` só por
esse ficheiro.

`pnpm gates` (raiz): `dialog` ✅ · `use-client` ✅ · `data-imports` ✅ · `leitura` ✅ · `periodo` ✅ («nenhum ficheiro
fora de contabilidade.service.ts escreve directamente em Lancamento/PartidaLancamento») — `GATES_EXIT=0`.

`provisionamento-integracao.test.ts` a correr sozinho contra o Postgres local (a 22b está aplicada): **3 passed (3)**
— `provisionarTenant` → `bootstrapContabilidade` → `semearRubricasFluxo` numa transacção real, e o `limpar()` novo
respeita as FKs `RESTRICT`.

### Prova fora do duplo: duas corridas no Postgres real, com rollback

Script descartável (`tsx -C react-server`, dentro de `apps/erp/`, apagado no fim; tenant efémero criado e revertido
com `throw` dentro de `$transaction` — `tenants smoke restantes: 0`):

```
run1: { rubricas: 19, mapeamentos: 435, versaoCriada: true }
run2: { rubricas: 0,  mapeamentos: 0,   versaoCriada: false }   ← skipDuplicates nos índices reais; sem P2002
rubricas 19 · mapeamentos 435 · folhas 435 · versoes [[1, 'PENDING']]
contasCaixa (pela actividade da rubrica): ['111', '121', '122', '123']
mudou(gravado, vivo): false · isDeepStrictEqual(gravado, vivo): true
JSON.stringify(gravado) === JSON.stringify(vivo): false        ← ver nota
arrays do instantâneo gravado em ordem canónica (rubricas por codigo, mapeamentos por contaId): true
```

**Nota para o nó `config` (V1/V2 na base real):** o JSONB do Postgres **reordena as chaves dos objectos**
(comprimento, depois bytes: `id, ativo, ordem, sinal, codigo, origem, atividade, designacao`) e preserva a ordem dos
arrays. O instantâneo lido da base é estruturalmente igual ao vivo (`mudou` → `false`, `toEqual` passa), mas
**nunca** se compara por `JSON.stringify` — isso diria «mudou» em toda a escrita e criaria uma versão a cada toque.
`mudou()` é a única igualdade legítima, e é por isso que existe.

## O que o nó NÃO fez

- ⚙ **22c** (4.3): migração do orquestrador. A proposta de SQL está abaixo. Não corri `db:seed`, `migrate diff` nem
  `migrate deploy`; a base local continua sem a 22c.
- Nenhuma golden (`servico-v`). Nenhuma alteração a `__tests__/` protegidos nem a `fixtures/`.
- O grafo não foi marcado.

## Proposta de SQL para a ⚙ 22c (`22c_semear_rubricas_fluxo`)

Gerada a partir do JSON (ficheiro-fonte único). Idempotente pelos `@@unique` da 22b; ids `gen_random_uuid()`
(Postgres 17); só tenants **com** plano de contas (a guarda do seed); a versão 1 só para tenants **sem** versão, com o
instantâneo na forma canónica de `instantaneoDe` (rubricas por `codigo`, mapeamentos por `contaId`; `COLLATE "C"` =
ordem por ponto de código; `jsonb` normaliza a ordem das chaves, o que `toEqual` ignora). O `migrate diff` da 22c deve
sair **vazio** (a 22b já criou tudo) — o ficheiro é só este SQL.

```sql
-- 22c_semear_rubricas_fluxo — tenants que JÁ existem (o tenant-bootstrap trata dos futuros).
-- Espelha semearRubricasFluxo (src/server/provisioning/tenant-bootstrap.ts) e
-- prisma/seed/data/rubricas-fluxo-caixa.json: rubricas SISTEMA, mapeamento de
-- cada conta folha, versão 1 PENDING com o instantâneo. Idempotente pelos
-- @@unique da 22b (ON CONFLICT DO NOTHING). Ids uuid como no bootstrap.
-- Só tenants COM plano de contas (a guarda do seed: sem plano, nada — nunca
-- uma versão 1 com zero mapeamentos).

-- 1. Rubricas SISTEMA, por tenant com plano de contas.
INSERT INTO "RubricaFluxoCaixa"
  ("id", "tenantId", "codigo", "designacao", "atividade", "sinal", "ordem", "origem", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", r.codigo, r.designacao,
       r.atividade::"AtividadeFluxo", r.sinal::"SinalFluxo", r.ordem, 'SISTEMA'::"OrigemRubrica", true, now(), now()
FROM "Tenant" t
CROSS JOIN (VALUES
  ('CX-01', 'Caixa e equivalentes de caixa', 'CAIXA', 'VARIACAO', 1),
  ('OP-00', 'Contas de resultados (incluídas no resultado líquido)', 'OPERACIONAL', 'VARIACAO', 0),
  ('OP-01', 'Amortizações e depreciações', 'OPERACIONAL', 'VARIACAO', 1),
  ('OP-02', 'Imparidades, ajustamentos e provisões', 'OPERACIONAL', 'VARIACAO', 2),
  ('OP-03', 'Variação de inventários e activos biológicos', 'OPERACIONAL', 'VARIACAO', 3),
  ('OP-04', 'Variação de clientes', 'OPERACIONAL', 'VARIACAO', 4),
  ('OP-05', 'Variação de fornecedores', 'OPERACIONAL', 'VARIACAO', 5),
  ('OP-06', 'Variação do Estado e outros entes públicos', 'OPERACIONAL', 'VARIACAO', 6),
  ('OP-07', 'Imposto sobre o rendimento', 'OPERACIONAL', 'VARIACAO', 7),
  ('OP-08', 'Variação de pessoal', 'OPERACIONAL', 'VARIACAO', 8),
  ('OP-09', 'Variação de outros devedores e credores', 'OPERACIONAL', 'VARIACAO', 9),
  ('OP-10', 'Variação de acréscimos e diferimentos', 'OPERACIONAL', 'VARIACAO', 10),
  ('INV-01', 'Activos tangíveis e investimentos em curso', 'INVESTIMENTO', 'VARIACAO', 1),
  ('INV-02', 'Activos intangíveis', 'INVESTIMENTO', 'VARIACAO', 2),
  ('INV-03', 'Investimentos financeiros e empréstimos concedidos', 'INVESTIMENTO', 'VARIACAO', 3),
  ('INV-04', 'Subsídios ao investimento', 'INVESTIMENTO', 'VARIACAO', 4),
  ('FIN-01', 'Financiamentos obtidos', 'FINANCIAMENTO', 'VARIACAO', 1),
  ('FIN-02', 'Capital próprio e reservas', 'FINANCIAMENTO', 'VARIACAO', 2),
  ('FIN-03', 'Dividendos e outras operações com sócios', 'FINANCIAMENTO', 'VARIACAO', 3)
) AS r(codigo, designacao, atividade, sinal, ordem)
WHERE EXISTS (SELECT 1 FROM "ContaPGC" c WHERE c."tenantId" = t."id" AND c."aceitaLancamento" AND c."ativo")
ON CONFLICT ("tenantId", "codigo") DO NOTHING;

-- 2. Mapeamento conta folha → rubrica (uma linha por folha activa do plano do
--    tenant; conta ausente do plano fica sem linha, nunca uma conta inventada).
INSERT INTO "MapeamentoContaFluxo" ("id", "tenantId", "contaId", "rubricaId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."tenantId", c."id", r."id", now(), now()
FROM (VALUES
  ('CX-01', ARRAY['111','121','122','123']),
  ('OP-00', ARRAY['611','6112','6116','61161','61162','61163','6117','612','6121','6122','6123','621','622','623','624','625','6251','6252','626','6261','6262','627','628','629','631','632','63211','63212','63213','632131','6321311','6321312','632132','6321321','6321322','632133','6321331','6321332','63214','63215','632151','632152','63216','63217','63218','63221','63222','63223','63224','63225','63226','63227','632271','632272','63228','632281','632282','63229','63231','63232','632321','63233','632331','63234','63235','63236','63237','63299','641','642','643','644','645','646','647','648','6481','6482','651','652','653','654','661','662','663','664','665','666','667','669','671','672','673','681','682','6821','6822','6823','6824','6825','683','6831','6832','6833','684','6841','6842','6849','689','6891','6892','6893','6894','6895','68951','68952','6896','6899','691','6911','6912','6913','6914','6915','6916','69161','69162','6919','694','6941','6942','695','698','6981','6989','711','712','713','714','715','716','717','721','726','731','732','733','734','741','7411','7412','7413','7414','7415','7416','7417','7418','742','7421','7422','7423','7424','743','7431','7432','7433','7434','7435','7436','7437','7439','751','752','753','754','755','756','757','759','761','7611','7619','762','7621','7629','763','7631','7632','764','7641','7642','7649','769','7691','7692','7693','7699','781','7811','7812','7813','7814','7819','782','783','784','7841','7842','785','789','791','792','793']),
  ('OP-01', ARRAY['382','383','386','387']),
  ('OP-02', ARRAY['292','293','294','295','296','297','391','392','393','395','396','397','471','472','481','482','483','484','485','486','487','489']),
  ('OP-03', ARRAY['211','212','2121','2122','2123','21231','21232','21233','21239','217','218','221','222','231','241','242','261','262','263','2631','2632','2633','2639','264','271','2711','2712','272','2721','2722','282','283','284','285','286','287']),
  ('OP-04', ARRAY['411','412','418','419']),
  ('OP-05', ARRAY['421','422','429']),
  ('OP-06', ARRAY['442','4421','4422','4423','4424','4425','443','4431','44311','44312','44313','4432','44321','44322','44323','4433','44331','44332','44333','4434','44341','44342','44343','4435','4436','4437','4438','4439','444','4441','4442','445','449']),
  ('OP-07', ARRAY['441','4411','4412','4413','446','4461','4462','851','852']),
  ('OP-08', ARRAY['451','4511','4512','4513','4518','4519','462','4621','4622','4623','4628','4629','463']),
  ('OP-09', ARRAY['455','4551','4552','459','466','469']),
  ('OP-10', ARRAY['491','4911','4912','4919','492','4923','4929','493','4931','4933','4939','494','4949']),
  ('INV-01', ARRAY['321','3211','3212','3213','3216','322','323','324','325','326','327','329','342','461','4611','4612','4613','4619']),
  ('INV-02', ARRAY['331','332','333','334','343']),
  ('INV-03', ARRAY['131','132','133','311','312','313','314','315','316','4541','464']),
  ('INV-04', ARRAY['4924']),
  ('FIN-01', ARRAY['431','4311','4312','432','4321','4322','433','439','453','4614','465','4671','4921','4922','4941','4942']),
  ('FIN-02', ARRAY['452','4521','4522','4529','521','522','551','552','553','561','5611','5612','562','581','582','589']),
  ('FIN-03', ARRAY['454','4542','4543','4544','4549','467','4673','4674'])
) AS m(rubrica, contas)
CROSS JOIN LATERAL unnest(m.contas) AS conta(codigo)
JOIN "ContaPGC" c
  ON c."codigo" = conta.codigo AND c."aceitaLancamento" AND c."ativo"
JOIN "RubricaFluxoCaixa" r
  ON r."tenantId" = c."tenantId" AND r."codigo" = m.rubrica AND r."deletedAt" IS NULL
ON CONFLICT ("tenantId", "contaId") DO NOTHING;

-- 3. Versão 1 PENDING com o instantâneo do mapeamento vivo (V1), na forma
--    canónica de instantaneoDe (rubricas por codigo, mapeamentos por contaId;
--    ordem por ponto de código = COLLATE "C"). Só para tenants sem versão.
INSERT INTO "VersaoMapeamentoFluxo" ("id", "tenantId", "numero", "estado", "instantaneo", "createdAt")
SELECT gen_random_uuid()::text, t."id", 1, 'PENDING'::"EstadoVersaoMapeamento",
  jsonb_build_object(
    'rubricas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r."id", 'codigo', r."codigo", 'designacao', r."designacao",
               'atividade', r."atividade", 'sinal', r."sinal", 'ordem', r."ordem",
               'origem', r."origem", 'ativo', r."ativo")
             ORDER BY r."codigo" COLLATE "C", r."id" COLLATE "C")
      FROM "RubricaFluxoCaixa" r WHERE r."tenantId" = t."id" AND r."deletedAt" IS NULL), '[]'::jsonb),
    'mapeamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('contaId', m."contaId", 'rubricaId', m."rubricaId")
             ORDER BY m."contaId" COLLATE "C", m."rubricaId" COLLATE "C")
      FROM "MapeamentoContaFluxo" m WHERE m."tenantId" = t."id"), '[]'::jsonb)
  ),
  now()
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "ContaPGC" c WHERE c."tenantId" = t."id" AND c."aceitaLancamento" AND c."ativo")
  AND NOT EXISTS (SELECT 1 FROM "VersaoMapeamentoFluxo" v WHERE v."tenantId" = t."id")
ON CONFLICT ("tenantId", "numero") DO NOTHING;
```

Verificação sugerida depois do `migrate deploy` (gate do ticket 4): no tenant `demo`, 0 folhas sem mapeamento e 1
versão `PENDING`:

```sql
SELECT count(*) AS folhas_sem_mapeamento
FROM "ContaPGC" c JOIN "Tenant" t ON t."id" = c."tenantId" AND t."slug" = 'demo'
LEFT JOIN "MapeamentoContaFluxo" m ON m."tenantId" = c."tenantId" AND m."contaId" = c."id"
WHERE c."aceitaLancamento" AND c."ativo" AND m."id" IS NULL;
SELECT v."numero", v."estado", jsonb_array_length(v."instantaneo"->'rubricas') AS rubricas,
       jsonb_array_length(v."instantaneo"->'mapeamentos') AS mapeamentos
FROM "VersaoMapeamentoFluxo" v JOIN "Tenant" t ON t."id" = v."tenantId" AND t."slug" = 'demo';
```

Esperado: `0` · `1 | PENDING | 19 | 435`. E `pnpm db:seed` duas vezes sem erros, com a segunda a registar «o tenant
já tem versão do mapeamento — nada escrito».
