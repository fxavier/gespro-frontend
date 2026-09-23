# Prompts de execução — Spec 22 (Fluxo de Caixa)

> Um bloco por nó do grafo, copiável tal como está. Modo **manual**: corres um nó de cada vez no
> Claude Code, na raiz do repositório. Substitui apenas o que está entre `<…>`.
>
> Grafo: [`grafo-22-fluxo-de-caixa.md`](./grafo-22-fluxo-de-caixa.md) ·
> Doutrina: [`00-doutrina-loop-e-grafo.md`](./00-doutrina-loop-e-grafo.md) ·
> Spec: [`.kiro/specs/22-fluxo-de-caixa/`](../../.kiro/specs/22-fluxo-de-caixa/)

## Índice e ordem de execução

| # | Prompt | Nó | Agente | Verificador |
|---|---|---|---|---|
| 1 | `P1` | L1 contratos WS-1 | `feat-tesouraria` | `pnpm check` + `PR` |
| 2 | `PM` | migração 22a + merge | tu (orquestrador) | `pnpm check` |
| 3 | `P2v` | oráculo de L2 | `verificador-fluxo-caixa` | tem de **falhar** |
| 4 | `P2` | L2 núcleo puro | `feat-tesouraria` | `projecao.property.test.ts` |
| 5 | `P3` | L3 saldo de abertura | `feat-tesouraria` | `I1` + `grep saldoAtual` |
| 6 | `P4` | L4 agregações | `feat-tesouraria` | golden fixture |
| 7 | `P5` | L5 CRUD e isolamento | `feat-tesouraria` | `pnpm test:integration` |
| 8 | `P6` | L6 actions e RBAC | `feat-tesouraria` | `pnpm gates` |
| 9 | `P7` | L7 UI `/tesouraria` | `feat-tesouraria` | `pnpm build` + `e2e:a11y` |
| 10 | `P8` | L8 saída do WS-1 | `feat-tesouraria` | `pnpm e2e` + k6 |
| 11 | `P9` | L9 contratos WS-2 | `feat-dfc` | `pnpm check` + `PR` |
| 12 | `P10` | L10 seed de rubricas | `feat-dfc` | `tenant-bootstrap.test.ts` |
| 13 | `P11v` | oráculo de L11 | `verificador-fluxo-caixa` | tem de **falhar** |
| 14 | `P11` | L11 núcleo puro DFC | `feat-dfc` | `dfc.property.test.ts` |
| 15 | `P12` | L12 `gerarDFC` | `feat-dfc` | golden fixture + `I9` |
| 16 | `P13` | L13 actions e export | `feat-dfc` | `pnpm gates` |
| 17 | `P14` | L14 UI DFC | `feat-dfc` | `pnpm build` + `e2e:a11y` |
| 18 | `P15` | L15 saída do WS-2 | `feat-dfc` | `pnpm e2e` + `PH` |

Transversais, a usar quando a situação o pedir: **`PR`** (revisão, depois de cada nó) ·
**`PV`** (verificação anti-adulteração do oráculo) · **`PF`** (reentrada após falha) ·
**`PH`** (validação humana, task 15.3).

---

# WS-1 — Projecção de Tesouraria

## P1 — L1 · Contratos

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria.
Tasks 1.1 a 1.4 de .kiro/specs/22-fluxo-de-caixa/tasks.md.

Antes de escrever uma linha, lê:
- .kiro/specs/22-fluxo-de-caixa/design.md §2 (schema) e §3 (validações)
- docs/decisions/ADR-0036-projecao-tesouraria.md §Decisão
- .claude/skills/prisma-conventions/SKILL.md e api-conventions/SKILL.md
- .claude/skills/domain-modeling/SKILL.md — fixa o vocabulário antes das assinaturas
- src/server/services/financas/caixa.interface.ts — é o padrão de interface desta casa

Entrega, e nada além disto:
1. CompromissoTesouraria + enums TipoCompromisso e RecorrenciaCompromisso em
   prisma/schema/financas.prisma, exactamente como o design §2.
2. src/lib/validations/tesouraria.ts — ficheiro NOVO. Não estendas validations/contabilidade.ts,
   que é ponto de conflito com o spec 04.
3. src/server/services/financas/projecao.interface.ts — tipos Bucket, Ocorrencia,
   ProjecaoTesouraria, PerfilAtraso e as assinaturas das funções. ZERO implementação.
4. docs/handoff/feat-22-fluxo-de-caixa.md, secção "Contratos WS-1".

Armadilhas deste repositório que te apanham se não tiveres cuidado:
- Ids em Zod por idEntidade() de src/lib/validations/common.ts, NUNCA z.string().cuid(). O
  tenant-bootstrap atribui uuid às contas PGC; um .cuid() rejeita todas as contas reais, em
  produção inclusive.
- Dinheiro é Prisma.Decimal @db.Decimal(18,2). Nunca Float, nunca number.
- Datas vindas de searchParams levam z.coerce.date(). Um z.string().optional() sobreposto foi o
  que manteve a DRE morta durante uma campanha inteira (ADR-0018 §6, defeito D2).
- import 'server-only' no topo do .interface.ts.
- Índice @@index([tenantId, dataPrevista, ativo]) — a projecção agrega por data.

NÃO geres migração. NÃO implementes serviço. NÃO faças merge.
Termina com pnpm check verde e PÁRA para revisão.
```

## PM — Migração 22a e merge do nó de contratos (corres tu)

```
Age como orquestrador. Os contratos do L1 estão revistos e sem BLOCKERs.

1. Confirma que o diff de wt/feat-tesouraria toca apenas em:
   prisma/schema/financas.prisma, src/lib/validations/tesouraria.ts,
   src/server/services/financas/projecao.interface.ts, docs/handoff/feat-22-fluxo-de-caixa.md.
   Qualquer outro ficheiro é âmbito a mais: reverte-o.

2. Gera a migração TU, a partir do schema aprovado:
   pnpm --filter erp exec prisma migrate dev --name 22a_compromisso_tesouraria --create-only
   Lê o SQL gerado antes de aplicar. Confirma que não há DROP nem ALTER destrutivo em tabelas
   existentes — este delta é puramente aditivo.

3. Aplica: pnpm db:migrate:dev && pnpm db:generate

4. pnpm check && pnpm gates na branch de integração. Verde ⇒ merge do L1.

Migrações nunca são geradas por agentes feat-*. É esta regra que impede migrations paralelas
divergentes.
```

## P2v — Oráculo de L2 · **corre ANTES de P2**

```
Usa o agente verificador-fluxo-caixa. Worktree: wt/feat-tesouraria.
Escreves o oráculo, não a solução. Não tocas em nada fora de __tests__/.

Lê os invariantes I2, I3 e I5 em docs/decisions/ADR-0036-projecao-tesouraria.md §Consequências, e
as assinaturas em src/server/services/financas/projecao.interface.ts.

Escreve src/server/services/financas/__tests__/projecao.property.test.ts com fast-check:

- I2 conservação: ∀ conjunto de compromissos e saldo de abertura,
  saldoFinal(n) == saldoFinal(n−1) + entradas(n) − saidas(n), para todo o n.
- I3 monotonia de cenário: ∀ perfil de atraso,
  saldo_PESSIMISTA(d) ≤ saldo_BASE(d) ≤ saldo_OTIMISTA(d), para todo o d do horizonte.
- I5 idempotência: expandirRecorrencia(c, ate) chamada duas vezes produz conjuntos iguais.

Requisitos de qualidade:
- numRuns ≥ 1000 por propriedade.
- Comparação de dinheiro por Decimal.equals(). NUNCA number, NUNCA toBeCloseTo. Uma asserção
  monetária com tolerância é uma asserção que não asserta.
- Geradores cobrem: valor zero, datas em fronteira de mês, 31 de Dezembro, 29 de Fevereiro,
  recorrência com dataFimRecorrencia anterior à dataPrevista, horizonte 0 e horizonte 365,
  compromissos todos vencidos.
- Datas construídas em Africa/Maputo. new Date('aaaa-mm-dd') lê como UTC e a leste de Greenwich
  cai no dia anterior — usa new Date(ano, mes-1, dia, 12).
- Cada invariante tem pelo menos um caso que TEM de lançar. Um teste que só percorre o caminho
  feliz não prova que a guarda existe.

Corre agora:
  npx vitest run src/server/services/financas/__tests__/projecao.property.test.ts

TEM de falhar — as funções ainda não existem. Se passar, o teste está mal escrito: um oráculo que
passa contra código inexistente não prova nada; reescreve-o.

Cola a saída vermelha em docs/handoff/feat-22-fluxo-de-caixa.md §Oráculos e pára.
```

## P2 — L2 · Núcleo puro

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria. Tasks 2.1 a 2.4.

O teste que te julga já existe e está vermelho:
src/server/services/financas/__tests__/projecao.property.test.ts
NÃO LHE TOCAS. Se achares que está errado, escreves porquê no handoff e páras — não o alteras.

Implementa em src/server/services/financas/projecao.service.ts, como funções puras exportadas
(sem I/O, sem Prisma, sem Date.now() lá dentro — a data de referência é sempre parâmetro):

  montarBuckets(inicio, horizonteDias, granularidade): Bucket[]
  expandirRecorrencia(compromisso, ate): Ocorrencia[]
  distribuirCompromissos(buckets, ocorrencias, cenario, perfilAtraso): Bucket[]
  acumularSaldos(buckets, saldoAbertura): Bucket[]

Disciplina — invoca a skill tdd. Uma propriedade de cada vez:
  npx vitest run src/server/services/financas/__tests__/projecao.property.test.ts
Verde numa propriedade antes de avançares para a seguinte. Não implementes as quatro funções e
corras o teste no fim.

Regras de cálculo:
- Fronteiras de bucket em Africa/Maputo, via diaCivilEmMaputo. O servidor corre em UTC e um +2 à
  mão é uma decisão de fuso escondida numa soma.
- Tudo em Prisma.Decimal. Nenhuma passagem por number, nem sequer intermédia.
- distribuirCompromissos desloca ENTRADAS conforme o cenário; SAÍDAS nunca se deslocam — o
  fornecedor não atrasa o recebimento dele por simpatia (ADR-0036 §6).
- Compromissos com data anterior ao início do horizonte entram no primeiro bucket, marcados como
  vencidos. Nunca omitidos.

Cobertura ≥ 95 % neste módulo. pnpm check verde. Devolve e pára.
```

## P3 — L3 · Saldo de abertura e perfil de atraso

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria. Tasks 3.1 a 3.3.

Implementa saldoTesourariaAte(data, ctx) e perfilAtraso(ctx) em projecao.service.ts.

saldoTesourariaAte(data, ctx) =
    Σ saldoContabilAte(conta.contaContabilId, data)  ∀ ContaBancaria com ativo = true
  + Σ (fundoInicial + totalEntradas − totalSaidas)   ∀ SessaoCaixa com status ABERTA

PROIBIDO ler ContaBancaria.saldoAtual, em qualquer ponto. Essa coluna não tem escritor em
produção: existe com DEFAULT 0 desde a migração inicial e nenhum código lhe escreve. Uma projecção
que abrisse com ela começaria em zero em TODOS os tenants, sem erro nenhum — é o defeito que a
skill estado-com-escritor existe para apanhar. Ver ADR-0036 §Decisão-2.
O gate deste nó é literalmente:
  grep -c "saldoAtual" apps/erp/src/server/services/financas/projecao.service.ts   # tem de dar 0

perfilAtraso(ctx):
- Média e desvio padrão de (dataPagamento − dataVencimento) sobre Fatura com status PAGA nos
  últimos 180 dias do tenant.
- Menos de 20 facturas na amostra ⇒ devolve { amostraInsuficiente: true } e o cenário BASE degrada
  para OTIMISTA (requisito R5.3).
- Atraso nunca é negativo para efeitos de projecção: um cliente que pagou adiantado não antecipa o
  próximo recebimento. Trunca em zero.

Escreve APENAS um teste neste nó — o de I1, e é de integração, não property:
src/server/services/financas/__tests__/projecao.integracao.test.ts
  Com horizonte zero, o saldoAbertura da projecção iguala, ao cêntimo, o saldo calculado
  independentemente pelo balancete para a mesma data, no tenant demo.
Se o verificador-fluxo-caixa já o tiver escrito, não lhe tocas — só implementas até passar.

pnpm check verde. Devolve e pára.
```

## P4 — L4 · Agregações, orquestração e golden fixture

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria. Tasks 4.1 a 4.6.

Implementa as quatro agregações e projetarTesouraria, pelo pipeline do design §4.1.

Estados que contam (requisito R2 — cumpre, não interpretes):
- Fatura: EMITIDA, PARCIALMENTE_PAGA, VENCIDA → ENTRADA de (total − totalPago) em dataVencimento.
  RASCUNHO, PAGA e CANCELADA ficam de fora. RASCUNHO é deliberado: uma factura por emitir não é
  um direito de cobrança.
- ContaPagar: ABERTA, PARCIALMENTE_PAGA, VENCIDA → SAÍDA de valorRestante em dataVencimento.
- Payroll: PROCESSADO → SAÍDA de custoTotalEntidade — não salarioLiquido; o INSS patronal (4 %) é
  encargo da entidade e sai da mesma conta. Data: dataPagamento, ou o último dia útil do
  mês/anoReferencia calculado em Africa/Maputo quando for nula.
- CompromissoTesouraria activo e não eliminado, expandido por expandirRecorrencia.

Orquestração:
- As quatro agregações em Promise.all.
- Cada uma TEM de usar um índice existente. Confirma com EXPLAIN e guarda os planos em
  perf/explain/22-projecao.sql. Uma agregação em seq scan sobre Fatura num tenant real é o
  orçamento de latência estourado antes de sequer o medires.
- saldoAbertura por saldoTesourariaAte(hoje, ctx).
- No fim: primeiroDiaNegativo (Date | null) e menorSaldoProjetado (Decimal).

Depois, apura a GOLDEN FIXTURE:
1. Base limpa + pnpm db:seed.
2. Deriva os números esperados À MÃO, a partir do balancete e das listagens de facturas, contas a
   pagar e payroll do tenant demo, para horizonte 90 / granularidade SEMANAL / cenário BASE.
3. Grava src/server/services/financas/__tests__/fixtures/projecao-seed-demo.json.
4. Escreve o teste que compara ao cêntimo.

A fixture é prova: os números saem do estado do seed, não da tua implementação. Se a implementação
discordar da fixture, é a implementação que está errada até prova documentada em contrário.
NUNCA corras vitest -u neste directório.

pnpm check verde. Devolve e pára.
```

## P5 — L5 · CRUD de compromissos e isolamento multi-tenant

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria. Tasks 5.1 e 5.2.

Implementa em projecao.service.ts:
  listarCompromissos(filtro, ctx)   — paginação por cursor, FilterSchema próprio
  criarCompromisso(input, ctx)
  atualizarCompromisso(input, ctx)
  eliminarCompromisso(id, ctx)      — soft delete (deletedAt), nunca DELETE

Multi-tenancy — é aqui que este repositório já sangrou uma vez, na Wave 2:
- tenantId NUNCA vem do input. Vem sempre do Ctx.
- A extensão de tenant injecta em create/findMany, mas findUnique/update/delete/upsert NÃO são
  scoped. Filtras tenantId EXPLICITAMENTE em todos eles.
- Cross-tenant devolve NotFoundError (404). Nunca 403 — um 403 confirma a existência do registo a
  quem não devia saber que ele existe.
- Dentro de prismaBase.$transaction (client cru) incluis sempre tenantId nas escritas.

Validação de negócio:
- dataFimRecorrencia anterior a dataPrevista ⇒ ValidationError (requisito R3.4).
- recorrencia UNICA com dataFimRecorrencia preenchida ⇒ ValidationError.
- valor ≤ 0 ⇒ ValidationError.
- Regras de negócio lançam BusinessRuleError com código estável, não Error cru.

Teste (se o verificador ainda não o escreveu, escreve-o tu — é de integração, não property):
src/server/services/financas/__tests__/projecao.tenant.test.ts, com Testcontainers e DOIS tenants:
obter, actualizar e eliminar um compromisso do tenant A com o Ctx do tenant B devolve NotFoundError
nos três casos. É o invariante I4.

Gate: pnpm test:integration verde. pnpm check verde. Devolve e pára.
```

## P6 — L6 · Server Actions e permissões

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria. Tasks 6.1 e 6.2.

1. Permissões em prisma/seed/rbac.ts, no bloco de financas:
     financas:tesouraria:leitura  — Consultar a projecção de tesouraria e os compromissos
     financas:tesouraria:escrita  — Criar e editar compromissos de tesouraria
   Liga-as aos papéis conforme o padrão das restantes financas:*.
   ATENÇÃO: acrescentar ao catálogo NÃO as liga a papel nenhum nos tenants que já existem. Corre
   pnpm db:seed (é aditivo, não destrói nada). Sem isso a funcionalidade fica completa e o
   utilizador — o ADMIN inclusive — vê «Sem permissão».

2. src/server/actions/tesouraria.actions.ts — ficheiro NOVO, 'use server'.
   Todas via createSafeAction({ schema, permission, revalidate, permiteEmLeitura, handler }):

     projetarTesourariaAction    financas:tesouraria:leitura   permiteEmLeitura: true
     listarCompromissosAction    financas:tesouraria:leitura   permiteEmLeitura: true
     obterCompromissoAction      financas:tesouraria:leitura   permiteEmLeitura: true
     criarCompromissoAction      financas:tesouraria:escrita   revalidate: ['/tesouraria', '/tesouraria/compromissos']
     atualizarCompromissoAction  financas:tesouraria:escrita   revalidate: idem + '/tesouraria/compromissos/[id]'
     eliminarCompromissoAction   financas:tesouraria:escrita   revalidate: idem

   Uma action de leitura sem permiteEmLeitura: true é recusada pelo gate-leitura — e, pior, deixa o
   cliente em modo de Leitura sem conseguir ver o que é dele (ADR-0032). A omissão não é decisão.
   revalidate não declarado = cache stale = bug.
   Retorno é sempre ActionResult<T>. Nunca lances para o cliente.

Gate: pnpm gates verde, com atenção ao gate-leitura. pnpm check verde. Devolve e pára.
```

## P7 — L7 · UI /tesouraria

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria. Tasks 7.1 a 7.6.
Lê primeiro .claude/skills/ui-conventions/SKILL.md e o golden standard em
src/app/(dashboard)/compras/requisicoes.

Rotas (design §6):
  /tesouraria                              page.tsx — Server Component
  /tesouraria/compromissos                 listagem
  /tesouraria/compromissos/novo            formulário
  /tesouraria/compromissos/[id]/editar     formulário

Regras que o gate apanha e que já partiram coisas nesta casa:
- SEM MODAIS. Criar/editar/detalhar são rotas dedicadas. AlertDialog só para confirmar eliminação
  (confirmar, não recolher dados). Dialog fora disso é BLOCKER no gate-dialog.
- page.tsx de listagem e detalhe são Server Components. 'use client' num page.tsx destes é BLOCKER
  no gate-use-client.
- Definições de coluna com render/rowHref vivem num módulo 'use client' — funções não atravessam a
  fronteira RSC.
- useSearchParams()/usePathname() SEMPRE dentro de <Suspense>. Sem isso o build standalone parte o
  prerender, e nem pnpm check nem pnpm dev o apanham.
- Datas por src/lib/format-date.ts (fuso fixo Africa/Maputo), dinheiro por formatMZN. Um
  toLocaleDateString directo causa falha de hidratação: o React descarta a árvore, leva os handlers
  com ela, e o clique nas linhas da tabela deixa de navegar SEM ERRO VISÍVEL.
- Formulários: RHF + zodResolver com o schema partilhado, UnsavedChangesGuard, erros de servidor
  mapeados por campo. Se a action redirecciona, envolve em startTransition — um redirect() numa
  action chamada pelo handleSubmit não é aplicado, a escrita acontece e o utilizador fica no
  formulário a achar que falhou.
- Zero cores hardcoded (só tokens @theme); dark mode obrigatório.
- Não reimplementes o comportamento de type="number": o ui/Input base já trata disso.

Conteúdo:
- Filtros de horizonte, granularidade e cenário em searchParams.
- tabela-buckets.tsx é a FONTE; grafico-projecao.tsx é o resumo. A tabela nunca é substituída pelo
  gráfico — usa ChartContainer/ChartTooltip partilhados.
- Saldo negativo destacado sem depender apenas da cor (ícone ou peso tipográfico também).
- aviso-ambito.tsx, Server Component, visível na página: a projecção não inclui vendas futuras não
  facturadas, logo é conservadora do lado das entradas. Isto vai na página, não só na documentação.
- Se perfilAtraso devolver amostraInsuficiente, a página diz que o cenário BASE está a usar a
  hipótese optimista por falta de histórico.
- Entradas novas em AppSidebar.tsx (grupo Finanças), Breadcrumbs.tsx e CommandPalette.tsx.

Gates: pnpm build (standalone) verde + pnpm e2e:a11y AA nos dois temas + pnpm gates verde.
Devolve e pára.
```

## P8 — L8 · Saída do épico WS-1

```
Usa o agente feat-tesouraria. Worktree: wt/feat-tesouraria. Tasks 8.1 a 8.3.

1. e2e/14-tesouraria.spec.ts (Playwright):
   criar compromisso recorrente mensal → confirmar que aparece nos buckets certos com o valor certo
   → editar o valor → confirmar a alteração nos buckets → eliminar → confirmar que saiu.
   ASSERÇÕES SOBRE VALORES, não sobre presença de elementos. Um E2E que só verifica que o elemento
   existe passa com a aritmética toda errada.
   Antes de correr: npx playwright test --project=setup (a sessão versionada está expirada).
   Depois de correr: git checkout -- apps/erp/playwright/.auth/admin.json.
   Sem sleeps arbitrários — expect com auto-retry.

2. perf/k6/22-projecao.js contra o tenant perf-medio de pnpm db:seed:volume.
   Orçamento: p95 < 400 ms, horizonte 90 / granularidade DIARIA.
   Se estourar, corriges a QUERY. Não introduzes cache nem materialização — está decidido no
   ADR-0036 §Alternativas e a razão é correcção, não desempenho.
   Regista o resultado em perf/README.md.

3. Requisito 14 — corrige docs/DOCUMENTACAO.md:
   - linhas 93 e 104 afirmam que o módulo Finanças «gere fluxo de caixa» e «integrações bancárias».
     Era falso quando foi escrito. Descreve o que existe de facto, agora incluindo /tesouraria.
   - linha 165 lista «projectar fluxo de caixa» como trabalho futuro: aponta para a spec 22.
   - as referências a Supabase/PostgREST e ao layout pré-monorepo (src/services/comissao.service.ts)
     descrevem uma arquitectura que já não existe: remove-as ou marca-as como históricas.

Gate de épico: pnpm check + pnpm gates + pnpm e2e verdes, orçamento p95 cumprido.
Actualiza docs/handoff/feat-22-fluxo-de-caixa.md §Estado. Devolve e pára.
```

---

# WS-2 — Demonstração de Fluxos de Caixa

> **Só abre com o WS-1 integrado e verde na branch de integração.** Partilham
> `prisma/schema/financas.prisma`, `prisma/seed/rbac.ts` e a FK `CompromissoTesouraria.rubricaId`.
> Antes do P9: `git worktree add wt/feat-dfc -b feat/22-dfc` e `pnpm check && pnpm gates` verdes.

## P9 — L9 · Contratos da DFC

```
Usa o agente feat-dfc. Worktree: wt/feat-dfc. Tasks 9.1 a 9.4.

Antes de escrever, lê:
- docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md §Decisão (inteiro)
- .kiro/specs/22-fluxo-de-caixa/design.md §2 e §4.2
- .claude/skills/fluxo-de-caixa-conventions/SKILL.md e fiscalidade-mz/SKILL.md
- src/server/services/financas/contabilidade.interface.ts — os tipos Balancete e DRE que vais consumir

Entrega:
1. Em prisma/schema/financas.prisma:
   - enums AtividadeFluxo (OPERACIONAL, INVESTIMENTO, FINANCIAMENTO), SinalFluxo (ENTRADA, SAIDA,
     VARIACAO), OrigemRubrica (SISTEMA, TENANT)
   - model RubricaFluxoCaixa      @@unique([tenantId, codigo])  @@index([tenantId, atividade, ordem])
   - model MapeamentoContaFluxo   @@unique([tenantId, contaId]) @@index([tenantId, rubricaId])
   - relação em CompromissoTesouraria.rubricaId
2. src/lib/validations/fluxo-caixa.ts — ficheiro NOVO.
3. src/server/services/financas/dfc.interface.ts — DFC, SeccoesDFC, VariacaoClassificada,
   ContaNaoMapeada, FiltroDFCInput. Zero implementação.
4. docs/handoff/feat-22-fluxo-de-caixa.md §"Contratos WS-2 (DFC)".

O @@unique([tenantId, contaId]) em MapeamentoContaFluxo é a decisão estrutural deste épico: proíbe
por CONSTRUÇÃO que a mesma conta seja contada em duas actividades. A dupla contagem numa DFC não dá
erro — dá um mapa que soma certo em cada secção e errado no total. Não o relaxes por conveniência
de modelação.

NÃO geres migração. NÃO implementes serviço. NÃO faças merge.
pnpm check verde. Devolve e pára.
```

**Depois do P9, corre o `PM` adaptado:** migração `22b_rubricas_fluxo_caixa`, gerada por ti, aplicada
e verificada antes de abrir o L10.

## P10 — L10 · Seed de rubricas e mapeamento

```
Usa o agente feat-dfc. Worktree: wt/feat-dfc. Tasks 10.1 a 10.4.

Este é o nó de maior risco do épico: toca em src/server/provisioning/tenant-bootstrap.ts, que é
código crítico partilhado por todos os provisionamentos.

1. semearRubricasFluxo(tx, tenantId) — função PRÓPRIA e isolada, num ficheiro seu, chamada pelo
   tenant-bootstrap. Não espalhes o delta pelo corpo do bootstrap.
   - Cria as rubricas origem: SISTEMA, com codigo, designacao, atividade, sinal e ordem.
   - Idempotente: re-executar o bootstrap não duplica rubricas nem mapeamentos.

2. Tabela de mapeamento das contas FOLHA do PGC padrão, a partir de
   prisma/seed/data/plano-contas-pgc.json. Classificação por conta, em DADOS.
   NUNCA classifiques por prefixo de código em código-fonte (codigo.startsWith('43')): funciona no
   seed demo e falha no primeiro cliente que criar uma analítica própria, em silêncio.
   Atenção particular à classe 4: 44331 IVA liquidado e 421 Fornecedores c/c aparecem com o sinal
   ao contrário do resto da classe. Não há regra única por classe — é conta a conta, e foi por isso
   que a classificação ficou em dados.

3. Recusa de eliminação de rubrica SISTEMA ⇒ BusinessRuleError('RUBRICA_DE_SISTEMA').
   Reatribuir o mapeamento de uma conta é permitido a quem tiver financas:fluxo-caixa:configurar;
   apagar uma rubrica de sistema não é.

4. Teste em src/server/provisioning/__tests__/tenant-bootstrap.test.ts:
   um tenant acabado de provisionar fica com ZERO contas não mapeadas; e correr o bootstrap duas
   vezes não duplica nada.

pnpm check verde + tenant-bootstrap.test.ts verde. Devolve e pára.
```

## P11v — Oráculo de L11 · **corre ANTES de P11**

```
Usa o agente verificador-fluxo-caixa. Worktree: wt/feat-dfc.
Escreves o oráculo, não a solução. Nada fora de __tests__/.

Escreve src/server/services/financas/__tests__/dfc.property.test.ts com fast-check:

- I6 articulação: ∀ par de balancetes e mapa de rubricas,
  operacional + investimento + financiamento == saldoCaixa(fim) − saldoCaixa(inicio),
  em Decimal exacto.
  INCLUI um caso deliberadamente desarticulado que TEM de lançar DFC_NAO_ARTICULA. Um invariante
  que só testa o caminho feliz não é um invariante.
- I8 aditividade: ∀ partição de um exercício em períodos,
  DFC(exercício) == Σ DFC(período), nas três actividades.

E em src/server/services/financas/__tests__/dfc.integracao.test.ts:
- I7 cobertura: uma conta com movimento e sem mapeamento ⇒ o serviço devolve impedimentos e NENHUM
  mapa. Nunca um zero.
- I9 coerência: o resultado líquido que abre a secção operacional é, ao cêntimo, o resultadoLiquido
  de gerarDRE para o mesmo período.
- I10 isolamento: rubricas e mapeamentos do tenant A são invisíveis ao Ctx do tenant B;
  cross-tenant ⇒ NotFoundError.

Geradores: contas de todas as classes PGC, incluindo 44331 e 421 — as da classe 4 com sinal ao
contrário do resto da classe, que já morderam esta casa uma vez. numRuns ≥ 1000. Dinheiro por
Decimal.equals(), sem tolerância.

Corre. TEM de falhar. Cola a saída vermelha no handoff §Oráculos e pára.
```

## P11 — L11 · Núcleo puro da DFC

```
Usa o agente feat-dfc. Worktree: wt/feat-dfc. Tasks 11.1 a 11.4.

dfc.property.test.ts e dfc.integracao.test.ts já existem e estão vermelhos. NÃO LHES TOCAS.

Implementa em src/server/services/financas/dfc.service.ts, funções puras exportadas:

  classificarVariacoes(balanceteInicio, balanceteFim, mapa): VariacaoClassificada[]
  montarSeccoesDFC(resultadoLiquido, variacoes): SeccoesDFC
  verificarArticulacao(seccoes, deltaCaixa): void    // lança DFC_NAO_ARTICULA

verificarArticulacao corre SEMPRE, em produção, não só em teste. É pré-condição de saída do
serviço, não asserção de suite. Divergência ⇒ BusinessRuleError('DFC_NAO_ARTICULA') com o delta em
details. Um mapa que não articula não é um mapa com um erro: é um número inventado com aspecto de
demonstração financeira, e não sai daqui.

Segue o precedente da casa: montarLinhasBalancete e calcularLinhasDRE são funções puras exportadas
no contabilidade.service.ts, testáveis sem base de dados. Faz igual.

Método indirecto (ADR-0037 §1): parte do resultado líquido, corrige pelos não-caixa (amortizações,
provisões, imparidades) e pelas variações de capital circulante entre os dois balancetes.

Skill tdd: uma propriedade de cada vez.
  npx vitest run src/server/services/financas/__tests__/dfc.property.test.ts

pnpm check verde. Devolve e pára.
```

## P12 — L12 · gerarDFC, impedimentos e fixture

```
Usa o agente feat-dfc. Worktree: wt/feat-dfc. Tasks 12.1 a 12.4.

1. contasNaoMapeadas(periodoId, ctx): ContaNaoMapeada[]
   Devolve TODAS de uma vez, nunca uma de cada vez. É o padrão já estabelecido pelo fecharPeriodo,
   que devolve as sete pré-condições juntas — uma de cada vez obriga o utilizador a sete voltas.
   Cada entrada leva codigo, designacao e o valor movimentado no período, para a lista ser
   accionável.

2. gerarDFC(filtro, ctx), nesta ordem exacta (design §4.2):
   resolverPeriodo → contasNaoMapeadas (CURTO-CIRCUITO: havendo alguma, devolve { impedimentos } e
   NENHUM mapa) → gerarDRE → dois balancetes → classificarVariacoes → montarSeccoesDFC →
   verificarArticulacao → devolve com provisorio = (periodo.estado !== 'FECHADO').

   Delimitado por PeriodoContabil, nunca por datas livres (ADR-0033). Filtra lançamentos por
   FILTRO_LANCAMENTO_MAPA, importado do contabilidade.service.ts — nunca um literal local, que foi
   como quatro cópias divergiram.
   A DFC é SÓ LEITURA. Nenhuma escrita em Lancamento/PartidaLancamento: o gate-periodo varre src/ e
   prisma/ e falha o merge.

3. Golden fixture:
   Base limpa + pnpm db:seed. Deriva À MÃO, do balancete e da DRE do exercício semeado, os valores
   esperados das três secções. Grava
   src/server/services/financas/__tests__/fixtures/dfc-seed-demo.json e escreve o teste que compara
   ao cêntimo. vitest -u proibido neste directório.

4. Confirma que I9 passa: o resultado líquido da secção operacional é idêntico ao gerarDRE.

pnpm check + pnpm gates verdes (gate-periodo a zero). Devolve e pára.
```

## P13 — L13 · Actions, exportação e permissões

```
Usa o agente feat-dfc. Worktree: wt/feat-dfc. Tasks 13.1 a 13.3.

1. Permissões em prisma/seed/rbac.ts, bloco de financas:
     financas:fluxo-caixa:leitura     — Consultar a Demonstração de Fluxos de Caixa
     financas:fluxo-caixa:configurar  — Configurar rubricas e mapeamento conta→rubrica de fluxo
   Liga aos papéis. Corre pnpm db:seed — sem isso o ADMIN vê «Sem permissão».
   A exportação reutiliza financas:exportar, que já existe.

2. src/server/actions/fluxo-caixa.actions.ts, via createSafeAction:
     gerarDFCAction         financas:fluxo-caixa:leitura      permiteEmLeitura: true
     listarRubricasAction   financas:fluxo-caixa:leitura      permiteEmLeitura: true
     contasNaoMapeadasAction financas:fluxo-caixa:leitura     permiteEmLeitura: true
     mapearContaAction      financas:fluxo-caixa:configurar   revalidate: ['/contabilidade/fluxo-caixa/rubricas', '/contabilidade/dfc']
     criarRubricaAction     financas:fluxo-caixa:configurar   revalidate: idem
     atualizarRubricaAction financas:fluxo-caixa:configurar   revalidate: idem

3. src/app/api/contabilidade/dfc/export/route.ts, via withApi, GET, CSV e PDF (motor do ADR-0005).
   Sendo GET, passa em modo de Leitura sem declarar nada — pagar e exportar nunca se travam.
   O ficheiro exportado leva a marca «Provisório» quando provisorio = true, no cabeçalho e no nome.
   Envelope de erro { error: { code, message, details? } } com o status correcto.

pnpm gates verde. pnpm check verde. Devolve e pára.
```

## P14 — L14 · UI da DFC e das rubricas

```
Usa o agente feat-dfc. Worktree: wt/feat-dfc. Tasks 14.1 a 14.4.
Lê .claude/skills/ui-conventions/SKILL.md e
src/app/(dashboard)/contabilidade/balancete/page.tsx — é o mapa financeiro mais próximo do teu.

Rotas:
  /contabilidade/dfc                          page.tsx SC, reutiliza ../_components/seletor-periodo.tsx
  /contabilidade/fluxo-caixa/rubricas         listagem + mapeamento
  /contabilidade/fluxo-caixa/rubricas/[id]/editar

Conteúdo:
- tabela-dfc.tsx — três secções, totais por actividade, total geral, e a linha de articulação
  visível (Δcaixa do período). O utilizador tem de poder confirmar com os olhos que o mapa fecha.
- impedimentos-painel.tsx — quando gerarDFC devolve impedimentos, a página mostra a lista completa,
  cada linha ligada à conta em /contabilidade/plano-contas/[id], e NÃO mostra mapa nenhum. Não
  mostres um mapa parcial com um aviso: um mapa parcial vai para dentro de uma apresentação.
- Badge «Provisório» quando o período está aberto, na página e na exportação.
- mapeamento-tabela.tsx — reatribuição conta→rubrica, sem modais.

Regras da casa que o gate apanha: sem modais; page.tsx de listagem e detalhe são Server Components;
colunas com render em módulo 'use client'; useSearchParams dentro de <Suspense>; datas por
format-date.ts e dinheiro por formatMZN; zero cores hardcoded; dark mode.

Valores negativos em parêntesis e com text-destructive, como já faz a DRE. Tabular-nums nas colunas
de valor.

Navegação: AppSidebar.tsx (grupo Finanças & Contabilidade), Breadcrumbs.tsx (dfc, fluxo-caixa,
rubricas), CommandPalette.tsx.

pnpm build verde + pnpm e2e:a11y AA nos dois temas + pnpm gates verde. Devolve e pára.
```

## P15 — L15 · Saída do épico WS-2

```
Usa o agente feat-dfc. Worktree: wt/feat-dfc. Tasks 15.1 e 15.2.

1. e2e/15-dfc.spec.ts (Playwright), o fluxo completo:
   desmapear uma conta com movimento → gerar DFC → confirmar que aparece o impedimento e NÃO
   aparece mapa → mapear a conta → gerar → confirmar que as três secções articulam com o Δcaixa
   → exportar CSV e confirmar o conteúdo.
   Asserções sobre VALORES. npx playwright test --project=setup antes; git checkout --
   apps/erp/playwright/.auth/admin.json depois.

2. Confirma pnpm gates verde com o gate-periodo a zero — a DFC é só leitura de Lancamento.

3. Actualiza docs/handoff/feat-22-fluxo-de-caixa.md §Estado e exporta a tabela de mapeamento
   semeada (conta, designação, rubrica, actividade) para anexar ao pedido de validação humana.

NÃO fechas o épico. Falta a task 15.3, que é [HUMANO] e não tem substituto automático: a
articulação prova que o mapa FECHA, não que cada conta está na actividade CERTA face ao Decreto
70/2009. Um mapeamento coerente e errado passa em todos os gates verdes.

Devolve e pára.
```

---

# Transversais

## PR — Revisão de um nó (depois de cada entrega)

```
Usa o agente code-reviewer. Revê wt/<worktree> contra a branch de integração, para o nó <Ln> da
spec 22. Lê .kiro/specs/22-fluxo-de-caixa/requirements.md e o ADR relevante ANTES do diff — ler o
diff primeiro ancora-te na solução apresentada e deixas de ver o requisito em falta.

Além do teu checklist normal, os cinco deste programa:

1. git diff --stat -- '*__tests__/*' '*fixtures/*'
   Se um agente feat-* lá tocou, é BLOCKER e suspendes a revisão: é o oráculo a ser adaptado à
   solução. Verifica também se algum teste foi ENFRAQUECIDO — numRuns reduzido, tolerância
   introduzida, caso removido.
2. grep -rn "saldoAtual" nos serviços novos. Qualquer ocorrência é BLOCKER (ADR-0036 §Decisão-2).
3. Toda a action de consulta declara permiteEmLeitura: true; toda a mutação declara revalidate.
4. Dinheiro em Decimal de ponta a ponta. Nenhuma comparação monetária sobre number, nenhuma
   tolerância de vírgula flutuante em asserção de dinheiro.
5. Nenhuma escrita em Lancamento/PartidaLancamento. pnpm gates com gate-periodo a zero.

Cada apontamento com ficheiro, linha, problema e correcção proposta. Severidade BLOCKER/MAJOR/NIT.
Veredicto: APROVAR / APROVAR COM NITS / REJEITAR. Merge só sem BLOCKERs.
«Parece-me bem» não é parecer: se não encontraste nada, diz o que verificaste e como.
```

## PV — Verificação do oráculo (quando quiseres confirmar que ninguém o adulterou)

```
Usa o agente verificador-fluxo-caixa. Verificação de integridade do oráculo da spec 22.

1. git diff --stat <base>..HEAD -- '*__tests__/*' '*fixtures/*'
   Lista quem tocou em quê. Alterações por agentes feat-* são BLOCKER.
2. Para cada property test: confirma numRuns ≥ 1000, ausência de toBeCloseTo e de comparações de
   dinheiro sobre number, e presença de pelo menos um caso que tem de lançar.
3. Para cada golden fixture: confirma que os valores correspondem ao estado do pnpm db:seed,
   recalculando pelo menos três linhas à mão a partir do balancete.
4. Corre a suite completa: pnpm check && pnpm test:integration.

Relatório curto: o que verificaste, o que está íntegro, o que foi adulterado. Não corriges código
de produção.
```

## PF — Reentrada após falha

```
O nó <Ln> falhou a verificação <N> vezes. Saída do verificador, na íntegra:

<colar tudo, sem resumir>

Invoca a skill diagnosing-bugs. Antes de mexeres no código, responde por escrito:
1. Qual é EXACTAMENTE o comportamento observado? Um número, não um adjectivo. «A projecção está
   errada» não é observação; «o bucket 3 fecha em 12 450,00 e devia fechar em 12 400,00, delta de
   50,00» é.
2. Qual é o caso mínimo que o reproduz? Deixa o fast-check encolher e cola o contra-exemplo.
3. Três hipóteses de causa, por probabilidade. Para a primeira, qual é a OBSERVAÇÃO que a distingue
   das outras duas?
4. Instrumenta e observa. Confirma ou elimina a hipótese com dados. SÓ DEPOIS corriges.

Consulta a tabela de suspeitos habituais na skill diagnosing-bugs antes de qualquer outra coisa —
fuso horário, Decimal vs number, hidratação, serialização na fronteira SC→CC. Todos já aconteceram
aqui.

Se esta for a TERCEIRA iteração: NÃO corrijas. Escreve as quatro respostas e o caso mínimo em
docs/handoff/feat-22-fluxo-de-caixa.md §Bloqueios e pára. Três voltas sem convergir não é falta de
esforço — é sinal de que o spec ou o invariante está errado, e insistir leva ao pior resultado
disponível: adaptar o teste ao código.
```

## PH — Task 15.3, validação humana (texto para o contabilista, não para um agente)

```
O GestPro passou a produzir uma Demonstração de Fluxos de Caixa pelo método indirecto.

A classificação de cada conta do plano PGC-NIRF em actividade operacional, de investimento ou de
financiamento está numa tabela semeada automaticamente (em anexo: conta, designação, rubrica,
actividade).

Os testes automáticos provam que o mapa ARTICULA — que operacional + investimento + financiamento
iguala, ao cêntimo, a variação de caixa do período. Não provam, e não podem provar, que cada conta
está na actividade CERTA face ao Decreto 70/2009.

Pedido: rever a tabela conta a conta e assinalar as que estão na actividade errada. Atenção
particular à classe 4, onde não há regra única por classe.

Registar em docs/handoff/feat-22-fluxo-de-caixa.md §Parecer contabilístico: revisor, data, contas
reclassificadas, parecer. Sem isto a DFC não vai a cliente nenhum.
```
