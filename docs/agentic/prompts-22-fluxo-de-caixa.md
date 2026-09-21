# Prompts de execução — Spec 22 (Fluxo de Caixa)

> Cada bloco é copiável tal como está. Substitui apenas o que está entre `<…>`.
> Grafo: [`grafo-22-fluxo-de-caixa.md`](./grafo-22-fluxo-de-caixa.md) · Doutrina:
> [`00-doutrina-loop-e-grafo.md`](./00-doutrina-loop-e-grafo.md).

---

## P0 — Arranque do programa (para o `orchestrator`)

```
Abre o programa da spec 22 (Fluxo de Caixa).

Lê, por esta ordem:
1. docs/decisions/ADR-0036-projecao-tesouraria.md
2. docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md
3. .kiro/specs/22-fluxo-de-caixa/{requirements,design,tasks}.md
4. docs/agentic/00-doutrina-loop-e-grafo.md e grafo-22-fluxo-de-caixa.md

Confirma antes de delegar o que quer que seja:
- Os dois worktrees existem (wt/feat-tesouraria, wt/feat-dfc) e apontam para branches novas.
- docker compose up -d, pnpm db:migrate:dev e pnpm db:seed correram nesta máquina.
- pnpm check e pnpm gates estão verdes na branch de integração ANTES de começar.

Executa apenas o épico WS-1. O WS-2 fica bloqueado até o WS-1 estar integrado e verde — partilham
prisma/schema/financas.prisma e a FK CompromissoTesouraria.rubricaId.

Sequência do WS-1: L1 → (verificador escreve o oráculo de L2) → L2 → L3 → L4 → L5 → L6 → L7 → L8.

Regras que não negoceias:
- Migrações Prisma são geradas por ti e só por ti, depois de os contratos passarem pelo code-reviewer.
- Nenhum agente feat-* toca em ficheiros sob __tests__/ nem em fixtures. Se o git diff mostrar que
  tocou, reverte e marca BLOCKER.
- Tecto de 3 iterações por nó. À terceira falha o nó pára e escreve o bloqueio no handoff.

Começa por delegar L1 ao feat-tesouraria com o prompt P1 e mantém
docs/handoff/feat-22-fluxo-de-caixa.md actualizado a cada nó fechado.
```

---

## P1 — L1 · Contratos do WS-1 (para `feat-tesouraria`)

```
Worktree: wt/feat-tesouraria. Tasks 1.1 a 1.4 de .kiro/specs/22-fluxo-de-caixa/tasks.md.

Antes de escrever uma linha, lê:
- .kiro/specs/22-fluxo-de-caixa/design.md §2 (schema) e §3 (validações)
- docs/decisions/ADR-0036-projecao-tesouraria.md §Decisão
- .claude/skills/prisma-conventions/SKILL.md e api-conventions/SKILL.md
- src/server/services/financas/caixa.interface.ts — é o padrão de interface desta casa

Entrega, e nada além disto:
1. CompromissoTesouraria + enums TipoCompromisso e RecorrenciaCompromisso em
   prisma/schema/financas.prisma, exactamente como o design §2.
2. src/lib/validations/tesouraria.ts — ficheiro NOVO. Não estendas validations/contabilidade.ts.
3. src/server/services/financas/projecao.interface.ts — tipos e assinaturas, zero implementação.
4. docs/handoff/feat-22-fluxo-de-caixa.md, secção "Contratos WS-1".

Armadilhas deste repositório que te vão apanhar se não tiveres cuidado:
- Ids em Zod por idEntidade() de src/lib/validations/common.ts, NUNCA z.string().cuid(). O
  tenant-bootstrap atribui uuid às contas PGC; um .cuid() rejeita todas as contas reais.
- Dinheiro é Prisma.Decimal @db.Decimal(18,2). Nunca Float, nunca number.
- Datas que venham de searchParams levam z.coerce.date(). Um z.string().optional() sobreposto foi
  o que manteve a DRE morta durante uma campanha inteira (ADR-0018 §6, D2).
- import 'server-only' no topo do .interface.ts.

NÃO geres migração. NÃO implementes serviço. NÃO faças merge.
Termina com pnpm check verde e PÁRA para revisão.
```

---

## P2v — Oráculo de L2 (para `verificador-fluxo-caixa`) — **corre ANTES de P2**

```
Worktree: wt/feat-tesouraria. Escreves o oráculo, não a solução.

Lê os invariantes I2, I3 e I5 em docs/decisions/ADR-0036-projecao-tesouraria.md §Consequências e as
assinaturas em src/server/services/financas/projecao.interface.ts.

Escreve src/server/services/financas/__tests__/projecao.property.test.ts com fast-check:

- I2 conservação: ∀ conjunto de compromissos e saldo de abertura,
  saldoFinal(n) == saldoFinal(n−1) + entradas(n) − saidas(n) para todo o n. Comparação em
  Decimal exacto (.equals()), nunca em number, nunca com tolerância.
- I3 monotonia: ∀ perfil de atraso,
  saldo_PESSIMISTA(d) ≤ saldo_BASE(d) ≤ saldo_OTIMISTA(d) para todo o d do horizonte.
- I5 idempotência: expandirRecorrencia(c, ate) chamada duas vezes produz conjuntos iguais.

Requisitos do teste:
- numRuns ≥ 1000 por propriedade.
- Geradores cobrem: valores 0, datas em fronteira de mês, fim de ano, 29 de Fevereiro, recorrências
  com dataFimRecorrencia anterior à dataPrevista, horizonte 0 e horizonte 365.
- Todas as datas construídas em Africa/Maputo. new Date('aaaa-mm-dd') lê como UTC e a leste de
  Greenwich cai no dia anterior — usa new Date(ano, mes-1, dia, 12).

Corre o teste agora. Ele TEM de falhar — as funções ainda não existem. Se passar, o teste está mal
escrito: um oráculo que passa contra código inexistente não prova nada. Cola a saída vermelha no
handoff e só então devolve ao orquestrador.

Não escrevas nada fora de __tests__/.
```

---

## P2 — L2 · Núcleo puro (para `feat-tesouraria`)

```
Worktree: wt/feat-tesouraria. Tasks 2.1 a 2.4.

O teste que te julga já existe e está vermelho:
src/server/services/financas/__tests__/projecao.property.test.ts. Não lhe tocas. Se achares que
está errado, escreves porquê no handoff e páras — não o alteras.

Implementa em src/server/services/financas/projecao.service.ts, como funções puras exportadas
(sem I/O, sem Prisma, sem Date.now() lá dentro — a data de referência é sempre parâmetro):

  montarBuckets(inicio, horizonteDias, granularidade): Bucket[]
  expandirRecorrencia(compromisso, ate): Ocorrencia[]
  distribuirCompromissos(buckets, ocorrencias, cenario, perfilAtraso): Bucket[]
  acumularSaldos(buckets, saldoAbertura): Bucket[]

Disciplina (skill tdd): uma propriedade de cada vez. Corre
  npx vitest run src/server/services/financas/__tests__/projecao.property.test.ts
depois de cada passo. Verde antes de avançar para a propriedade seguinte.

Fronteiras de bucket em Africa/Maputo via diaCivilEmMaputo — o servidor corre em UTC e um +2 à mão
é uma decisão de fuso escondida numa soma.

Cobertura ≥ 95 % neste módulo. Termina com pnpm check verde e devolve ao orquestrador.
```

---

## P3 — L3 · Saldo de abertura (para `feat-tesouraria`)

```
Worktree: wt/feat-tesouraria. Tasks 3.1 a 3.3.

Implementa saldoTesourariaAte(data, ctx) e perfilAtraso(ctx).

saldoTesourariaAte:
  Σ saldoContabilAte(conta.contaContabilId, data) ∀ ContaBancaria com ativo = true
+ Σ (fundoInicial + totalEntradas − totalSaidas) ∀ SessaoCaixa com status ABERTA

PROIBIDO ler ContaBancaria.saldoAtual. Essa coluna não tem escritor em produção — verifiquei:
existe desde a migração inicial com DEFAULT 0 e nenhum código lhe escreve. Uma projecção que abrisse
com ela começaria sempre em zero, em todos os tenants, sem erro nenhum. O ADR-0036 §Decisão-2 e a
skill estado-com-escritor tratam disto. O verificador vai correr
  grep -c "saldoAtual" src/server/services/financas/projecao.service.ts
e o resultado tem de ser 0.

perfilAtraso: média e desvio padrão do atraso (dataPagamento − dataVencimento) sobre Fatura com
status PAGA nos últimos 180 dias do tenant. Menos de 20 facturas ⇒ devolve amostraInsuficiente: true
e o cenário BASE degrada para OTIMISTA.

Escreve o teste de I1 (horizonte zero == saldo do balancete para a mesma data) contra o seed demo.
Este é o único teste que escreves neste nó, e é de integração, não property.

pnpm check verde. Devolve.
```

---

## P4 — L4 · Agregações e fixture (para `feat-tesouraria`)

```
Worktree: wt/feat-tesouraria. Tasks 4.1 a 4.6.

Implementa as quatro agregações e projetarTesouraria, pelo pipeline do design §4.1.

Estados que contam (requirements R2 — não interpretes, cumpre):
- Fatura: EMITIDA, PARCIALMENTE_PAGA, VENCIDA → entrada de (total − totalPago) em dataVencimento.
  RASCUNHO, PAGA e CANCELADA ficam de fora. RASCUNHO é deliberado: uma factura por emitir não é
  um direito de cobrança.
- ContaPagar: ABERTA, PARCIALMENTE_PAGA, VENCIDA → saída de valorRestante em dataVencimento.
- Payroll: PROCESSADO → saída de custoTotalEntidade (não salarioLiquido — o INSS patronal é custo
  da entidade) em dataPagamento, ou no último dia útil do mês/ano de referência se for nula.
- CompromissoTesouraria activo e não eliminado, expandido por expandirRecorrencia.

Compromissos vencidos e ainda em aberto entram no PRIMEIRO bucket, assinalados. Nunca omitidos:
omitir dívida vencida é a forma mais eficaz de tornar a projecção optimista e inútil.

Quatro agregações em Promise.all. Cada uma tem de usar um índice existente — confirma com
EXPLAIN e guarda o plano em perf/explain/22-projecao.sql.

Depois, apura a golden fixture:
1. pnpm db:seed numa base limpa.
2. Deriva à mão, do balancete e das listagens, os números esperados para horizonte 90/SEMANAL/BASE.
3. Grava src/server/services/financas/__tests__/fixtures/projecao-seed-demo.json.
4. Escreve o teste que a compara ao cêntimo.

A fixture é prova: os números saem do estado do seed, não da tua implementação. Se a implementação
discordar da fixture, a implementação está errada até prova documentada em contrário. Não corras
vitest -u neste directório.

pnpm check verde. Devolve.
```

---

## P5–P8 — restantes nós do WS-1 (para `feat-tesouraria`)

Mesma estrutura; o que muda é o objectivo e o verificador. Molde:

```
Worktree: wt/feat-tesouraria. Tasks <N.x> de .kiro/specs/22-fluxo-de-caixa/tasks.md.

Objectivo: <uma frase>.
Lê antes: <skills e ficheiros>.
Verificador que te julga: <comando>.

<3 a 6 restrições específicas, todas verificáveis>

Não tocas em __tests__/ nem em fixtures. Tecto de 3 iterações: à terceira falha, escreves o que
tentaste em docs/handoff/feat-22-fluxo-de-caixa.md §Bloqueios e páras.
pnpm check verde antes de devolver.
```

Restrições por nó, a colar no molde:

**L5 (CRUD e isolamento, tasks 5.x)** — verificador `pnpm test:integration`
```
- tenantId NUNCA vem do input; vem do Ctx.
- findUnique/update/delete NÃO são scoped pela extensão: filtra tenantId explicitamente em todos.
- Cross-tenant devolve NotFoundError (404), nunca 403.
- Eliminar é soft delete (deletedAt), nunca DELETE.
- Teste de integração com dois tenants a provar I4.
```

**L6 (actions e RBAC, tasks 6.x)** — verificador `pnpm gates`
```
- financas:tesouraria:leitura e :escrita em prisma/seed/rbac.ts, ligadas aos papéis. Acrescentar ao
  catálogo não liga a papel nenhum nos tenants existentes: corre pnpm db:seed (é aditivo).
- Toda a action por createSafeAction. As de consulta declaram permiteEmLeitura: true — sem isso o
  gate-leitura recusa e o cliente em modo Leitura não vê o que é dele.
- revalidate declarado com os paths afectados.
- Retorno é ActionResult<T>; nunca lances para o cliente.
```

**L7 (UI, tasks 7.x)** — verificador `pnpm build` + `pnpm e2e:a11y`
```
- Sem modais: criar/editar/detalhar são rotas. AlertDialog só para confirmar eliminação.
- page.tsx de listagem e detalhe são Server Components.
- Colunas com render/rowHref vivem num módulo 'use client' — funções não atravessam a fronteira RSC.
- useSearchParams() dentro de <Suspense>, senão o build standalone parte o prerender e nem
  pnpm check nem pnpm dev o apanham.
- Datas por src/lib/format-date.ts, dinheiro por formatMZN. toLocaleDateString directo causa falha
  de hidratação e mata os handlers sem erro visível.
- Zero cores hardcoded; dark mode; saldo negativo distinguível sem depender só da cor.
- aviso-ambito.tsx na página: a projecção não inclui vendas futuras não facturadas.
```

**L8 (saída do épico, tasks 8.x)** — verificador `pnpm e2e` + k6
```
- e2e/14-tesouraria.spec.ts com asserções sobre VALORES, não sobre presença de elementos.
  Antes de correr, npx playwright test --project=setup (a sessão versionada está expirada); depois,
  git checkout -- apps/erp/playwright/.auth/admin.json.
- perf/k6/22-projecao.js contra perf-medio; p95 < 400 ms, horizonte 90/diária.
- Requisito 14: corrige docs/DOCUMENTACAO.md linhas 93, 104 e 165 — hoje afirmam que o módulo
  "gere fluxo de caixa", o que era falso quando foi escrito.
```

---

## P9 — Abertura do WS-2 (para o `orchestrator`)

```
WS-1 está integrado e verde na branch de integração. Abre o épico WS-2 (DFC).

Confirma primeiro, na branch de integração: pnpm check, pnpm gates, pnpm e2e verdes, e a migração
22a aplicada. Se algum falhar, o WS-2 não abre.

Sequência: L9 → L10 → (verificador escreve o oráculo de L11) → L11 → L12 → L13 → L14 → L15.

Atenção ao único ponto de risco real deste épico: o L10 toca em
src/server/provisioning/tenant-bootstrap.ts, que é código crítico partilhado. Exige que o delta
venha isolado numa função semearRubricasFluxo() própria e que o teste em
tenant-bootstrap.test.ts prove que um tenant novo fica com zero contas não mapeadas.

A task 15.3 é [HUMANO] e não tem substituto. Não fechas o épico sem o parecer registado.
```

---

## P11v — Oráculo de L11 (para `verificador-fluxo-caixa`)

```
Worktree: wt/feat-dfc. Escreve src/server/services/financas/__tests__/dfc.property.test.ts.

I6 articulação: ∀ par de balancetes e mapa de rubricas,
  operacional + investimento + financiamento == saldoCaixa(fim) − saldoCaixa(inicio), em Decimal
  exacto. Inclui um caso deliberadamente desarticulado que TEM de lançar DFC_NAO_ARTICULA — um
  invariante que só testa o caminho feliz não é um invariante.

I8 aditividade: ∀ partição de um exercício em períodos,
  DFC(exercício) == Σ DFC(período) nas três actividades.

I9 (teste de integração, não property): o resultado líquido que abre a secção operacional é, ao
cêntimo, o resultadoLiquido de gerarDRE para o mesmo período.

Geradores: contas de todas as classes PGC, incluindo os casos que já morderam esta casa —
44331 IVA liquidado e 421 Fornecedores c/c, que aparecem com o sinal ao contrário do resto da
classe 4. Não há regra única de natureza: é conta a conta.

Corre. Tem de falhar. Cola a saída vermelha no handoff e devolve.
```

---

## PR — Revisão de qualquer nó (para `code-reviewer`)

```
Revê wt/<worktree> contra a branch de integração, para o nó <Ln> da spec 22.

Além do teu checklist normal, verifica estes cinco, específicos deste programa:

1. git diff --stat sobre __tests__/ e fixtures/. Se um agente feat-* lá tocou, é BLOCKER e não
   continuas a revisão: é o oráculo a ser adaptado à solução.
2. grep -rn "saldoAtual" nos serviços novos. Qualquer ocorrência é BLOCKER (ADR-0036 §Decisão-2).
3. Toda a action de consulta declara permiteEmLeitura: true.
4. Dinheiro em Decimal de ponta a ponta; nenhuma comparação de valores monetários com == sobre
   number, nenhuma tolerância de vírgula flutuante em asserção de dinheiro.
5. Nenhuma escrita directa em Lancamento/PartidaLancamento — a DFC é só leitura. Confirma com
   pnpm gates que o gate-periodo está a zero.

Veredicto: APROVAR / APROVAR COM NITS / REJEITAR. Merge só sem BLOCKERs.
```

---

## PF — Reentrada após falha (para qualquer agente `feat-*`)

```
O nó <Ln> falhou a verificação <N> vezes. Saída do verificador:

<colar a saída completa, sem resumir>

Antes de mexeres no código, invoca a skill diagnosing-bugs e responde por escrito:
1. Qual é exactamente o comportamento observado? (número, não adjectivo)
2. Qual é o caso mínimo que o reproduz? Reduz o gerador do property test até ao caso mais pequeno
   que falha e cola-o.
3. Três hipóteses de causa, ordenadas por probabilidade. Para a primeira, qual é a observação que a
   distingue das outras duas?
4. Instrumenta e observa. Só depois corriges.

Se for a terceira iteração: NÃO corrijas. Escreve as quatro respostas em
docs/handoff/feat-22-fluxo-de-caixa.md §Bloqueios, com o caso mínimo, e devolve ao orquestrador.
Três voltas sem convergir não é falta de esforço — é sinal de que o spec ou o invariante está
errado, e continuar a insistir leva a adaptar o teste ao código.
```

---

## PH — Task 15.3, validação humana (para ti, não para um agente)

```
Contexto para o contabilista:

O GestPro passou a produzir uma Demonstração de Fluxos de Caixa pelo método indirecto. A
classificação de cada conta do plano PGC-NIRF em actividade operacional, de investimento ou de
financiamento está numa tabela (RubricaFluxoCaixa + MapeamentoContaFluxo) semeada automaticamente.

Os testes automáticos provam que o mapa FECHA — que operacional + investimento + financiamento
iguala, ao cêntimo, a variação de caixa do período. Não provam, e não podem provar, que cada conta
está na actividade CERTA face ao Decreto 70/2009.

O que é preciso: rever a tabela exportada em anexo, conta a conta, e assinalar as que estão na
actividade errada. Atenção particular às contas da classe 4, onde não há regra única por classe.

Registar o parecer em docs/handoff/feat-22-fluxo-de-caixa.md §Parecer contabilístico, com data e
nome. Sem isto a DFC não vai a cliente nenhum.
```
