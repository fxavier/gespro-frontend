# Handoff — Spec 22 (Fluxo de Caixa)

> Documento vivo. Cada nó do grafo actualiza a sua secção ao fechar.
> Spec: [`.kiro/specs/22-fluxo-de-caixa/`](../../.kiro/specs/22-fluxo-de-caixa/) ·
> Grafo: [`docs/agentic/grafo-22-fluxo-de-caixa.md`](../agentic/grafo-22-fluxo-de-caixa.md)

## Estado

| Épico | Agente | Worktree | Nó actual | Estado |
|---|---|---|---|---|
| WS-1 Projecção de Tesouraria | `feat-tesouraria` | `wt/feat-tesouraria` | L2 **fechado** → L3 | Núcleo puro entregue; oráculo `projecao.property.test.ts` 11/11 verde, intocado; cobertura do módulo 97,9 % linhas / 96,2 % ramos; caso canónico §4.1-bis confirmado por script |
| WS-2 DFC | `feat-dfc` | `wt/feat-dfc` | L9 | Bloqueado por WS-1 |

## Mapa de conflitos

| Ficheiro | WS-1 | WS-2 | Resolução |
|---|---|---|---|
| `prisma/schema/financas.prisma` | `CompromissoTesouraria` + 2 enums | `RubricaFluxoCaixa`, `MapeamentoContaFluxo` + 3 enums, relação em `rubricaId` | **Sequencial.** Migração `22a` antes de `22b`; não invertível |
| `src/lib/validations/` | `tesouraria.ts` (novo) | `fluxo-caixa.ts` (novo) | Sem conflito — ficheiros novos, `contabilidade.ts` não se toca |
| `src/server/services/financas/` | `projecao.service.ts` + `.interface.ts` | `dfc.service.ts` + `.interface.ts` | Sem conflito |
| `src/server/actions/` | `tesouraria.actions.ts` | `fluxo-caixa.actions.ts` | Sem conflito |
| `prisma/seed/rbac.ts` | `financas:tesouraria:*` | `financas:fluxo-caixa:*` | Sequencial; blocos separados |
| `src/server/provisioning/tenant-bootstrap.ts` | — | `semearRubricasFluxo()` | **Risco.** Código crítico partilhado; delta isolado em função própria |
| `AppSidebar.tsx`, `Breadcrumbs.tsx`, `CommandPalette.tsx` | 2 entradas | 2 entradas | Sequencial; conflito trivial se ocorrer |

## Contratos WS-1

> Nó L1 (tasks 1.1–1.4), entregue 2026-09-21. Schema alterado e **por migrar** — a migração `22a`
> é gerada pelo orquestrador. Nenhum teste escrito neste nó: o oráculo do L2 é do
> `verificador-fluxo-caixa`.

### Schema (`prisma/schema/financas.prisma`)

- Enums `TipoCompromisso { ENTRADA SAIDA }` e `RecorrenciaCompromisso { UNICA MENSAL TRIMESTRAL ANUAL }`
  no bloco ENUMS; modelo `CompromissoTesouraria` numa secção nova `TESOURARIA` no fim do ficheiro,
  campo a campo como o design §2 (incl. `@@index([tenantId, dataPrevista, ativo])` e
  `@@index([tenantId, deletedAt])`).
- `rubricaId` e `contaContabilId` são **escalares sem `@relation`** — a relação de `rubricaId`
  chega com a migração `22b` (WS-2). Sem série de documento: um compromisso não é documento numerado.
- `tenantId` + `deletedAt` ⇒ o modelo entra sozinho em `TENANT_MODELS`/`SOFT_DELETE_MODELS`
  (derivados do dmmf) após `prisma generate`.

### Validações (`src/lib/validations/tesouraria.ts` — ficheiro novo, client-safe)

| Export | Nota |
|---|---|
| `TipoCompromissoEnum`, `RecorrenciaCompromissoEnum`, `GranularidadeEnum`, `CenarioEnum` (+ tipos inferidos) | espelham schema/ADR-0036 |
| `TECTO_HORIZONTE_DIAS` | `{ DIARIA: 90, SEMANAL: 180, MENSAL: 365 }` — constante única do tecto |
| `FiltroProjecaoSchema` / `FiltroProjecaoInput` | literal do design §3; `superRefine` recusa horizonte acima do tecto (nunca trunca) |
| `CriarCompromissoSchema`, `AtualizarCompromissoSchema` (`.partial().extend({ id, ativo? })`), `EliminarCompromissoSchema`, `FiltroCompromissoSchema` (+ inputs) | ids por `idEntidade()`; datas por `z.coerce.date()`; `valor` como `number` positivo `multipleOf(0.01)` no formulário (padrão `caixa.ts`), Decimal só do serviço para dentro |

Regra R3.4 (`dataFimRecorrencia < dataPrevista` → erro) vive num `superRefine` partilhado pelos
schemas Criar/Atualizar; no Atualizar **parcial** só dispara com as duas datas presentes — com uma
só, a regra é reimposta pelo serviço contra o registo existente (nó L5).

### Interface (`src/server/services/financas/projecao.interface.ts` — `server-only`, zero implementação)

- Tipos: `Ctx`, `CompromissoTesouraria` (espelho pós-generate), `CompromissoBase`
  (subconjunto puro para expansão), `OrigemOcorrencia`, `Ocorrencia` (com `vencida` para R2.4),
  `Bucket` (R4.2 + `ocorrencias: Ocorrencia[]`), `PerfilAtraso`, `ProjecaoTesouraria`,
  `PaginacaoTesouraria<T>`.
- `ProjecaoTesouraria` acrescenta ao design: `dataReferencia`, `cenarioAplicado` (BASE degradado
  visível à UI, R5.3), `semOrigensDeSaldo` (R1.3 — zero sem origens ≠ zero apurado) e
  `perfilAtraso` embebido (transporta `amostraInsuficiente`).
- Núcleo puro como tipos de função: `ExpandirRecorrenciaFn`, `MontarBucketsFn`,
  `DistribuirCompromissosFn`, `AcumularSaldosFn` — o L2 implementa contra estas assinaturas.
- Serviço: `IProjecaoService` com `projetarTesouraria`, `saldoTesourariaAte` (→ `Prisma.Decimal`,
  como no design), `perfilAtraso` (task 3.2), `listarCompromissos`, `criarCompromisso`,
  `atualizarCompromisso`, `eliminarCompromisso` (soft delete).

### Decisões de interpretação (para o code-reviewer olhar)

1. `Bucket.ocorrencias` não está no design §2/§4 mas é necessário para «vencidos no primeiro
   bucket, assinalados» (R2.4) e para o detalhe na UI; R4.2 exige campos mínimos, não máximos.
2. `AtualizarCompromissoSchema` expõe `ativo` (não faz parte do Criar): desligar um compromisso
   sem o eliminar é o uso previsto do campo `ativo` do schema.
3. Filtro `ativo` em searchParams usa um union boolean|'true'|'false' — `z.coerce.boolean()`
   transformaria a string `"false"` em `true`.
4. `perfilAtraso` entrou na interface pública do serviço (o design §4.1 só o usa no pipeline,
   mas a task 3.2 trata-o como entregável testável).

### Núcleo puro (nó L2, tasks 2.1–2.4 — entregue 2026-09-21)

`projecao.service.ts` com as quatro funções puras (`montarBuckets`, `expandirRecorrencia`,
`distribuirCompromissos`, `acumularSaldos`). Oráculo 11/11 verde, **intocado**. Decisões que o
contrato não fixava, para o revisor olhar:

1. **Horizonte inclusivo nos dois extremos**: os buckets cobrem `[inicio, inicio+horizonteDias]`
   em dias civis Maputo — é o que faz `2026-01-31 + 150` alcançar `2026-06-30` (caso canónico
   §4.1-bis, confirmado por script descartável; horizonte 0 ⇒ um bucket, como o oráculo exige).
2. **MENSAL = meses civis** (primeiro e último buckets truncados ao horizonte), não janelas de
   30 dias — é a linha «Setembro» que um tesoureiro lê. SEMANAL = janelas de 7 dias a partir
   do início. O design não fixava; o oráculo não distingue.
3. **Perfil de atraso negativo LANÇA** (`PERFIL_ATRASO_INVALIDO`): o truncamento em zero é por
   observação no L3 (ADR-0036 §10), logo um perfil negativo aqui é defeito de quem chama. É a
   saída que a propriedade «ou lança, ou a monotonia mantém-se» admite e a única compatível com
   a regra 3 do design.
4. **`expandirRecorrencia` devolve `vencida: false`**: a marcação contra a data de referência é
   do L3, que é quem a conhece (a assinatura pura não recebe referência). `distribuirCompromissos`
   confia na bandeira.
5. **Deslocamento fraccionário arredonda** (`Math.round`) — o atraso médio real é fraccionário;
   `round` é monótono, logo I3 sobrevive. `amostraInsuficiente` degrada só o BASE (R5.3);
   o PESSIMISTA mantém a fórmula.
6. **Guardas de totalidade** também em `montarBuckets` (granularidade desconhecida lança) —
   mesmo racional dos «TEM de lançar» do oráculo para cenário/recorrência. São as duas únicas
   linhas não cobertas (97,9 %): não lhes posso escrever testes (`__tests__/` é do oráculo).
7. **Correcção de desempenho fora do módulo**: `diaCivilEmMaputo` construía um
   `Intl.DateTimeFormat` por chamada (~200 µs); içado a módulo em `contabilidade.service.ts`,
   no padrão do `_FMT_PERIODO` vizinho. Sem isto o oráculo estourava o timeout do vitest
   (1000 runs × ~120 chamadas). Sem mudança de comportamento; suite inteira verde.

### Casca de I/O (nó L3, tasks 3.1–3.3 + 3.2-bis — entregue 2026-09-21)

`saldoTesourariaAte` e `perfilAtraso` em `projecao.service.ts`, mais as duas funções puras
ratificadas (`marcarVencidas`, `calcularPerfilAtraso`) com assinaturas no `projecao.interface.ts`
(`MarcarVencidasFn`, `CalcularPerfilAtrasoFn`). Oráculo `projecao.integracao.test.ts` 10/10 verde
à primeira, **intocado**; property 14/14; `pnpm check` e `pnpm gates` verdes; gate literal
`grep -c "saldoAtual" projecao.service.ts` = **0**. Decisões que o contrato não fixava:

1. **`saldoTesourariaAte` NÃO chama `saldoContabilAte`** — faz um único `groupBy` por
   `(contaId, tipo)` com `FILTRO_LANCAMENTO_MAPA` importado. Motivo: o ADR-0036 §2 afirma que
   `saldoContabilAte` «já filtra por `FILTRO_LANCAMENTO_MAPA`», mas o código real filtra só
   `LANCADO`, e esse default está trancado por oráculo alheio
   (`reconciliacao.service.test.ts:83`) — alterá-lo era partir um teste que não posso tocar.
   O oráculo do I1 deriva o esperado do balancete (que filtra por MAPA), logo a projecção tem de
   filtrar igual: com um estorno na conta do banco, `LANCADO`-só contaria o estorno sem o
   original. **Fica a divergência ADR↔`saldoContabilAte` para o orquestrador arbitrar** — a
   reconciliação bancária herda hoje esse mesmo defeito latente (sem estornos semeados, nada o
   mostra).
2. **Soma por conta bancária, não por conta PGC**: duas contas bancárias activas na mesma conta
   contabilística contam-na duas vezes — letra do §2 e comportamento que o oráculo fixa
   (conta activa + inactiva na mesma 121: ignorar `ativo` duplicaria; deduplicar por PGC também
   divergiria).
3. **Saldo do razão = Σ débitos − Σ créditos**, sem consultar `natureza` — é a fórmula literal
   do `saldoContabilAte`/ADR §2 (classe 1 é DEVEDORA). Uma conta bancária ancorada numa conta
   CREDORA divergiria do balancete natureza-aware; nota para o revisor, não há caso real.
4. **`perfilAtraso` é casca fina**: janela = `Date.now() − 180 dias` (a proibição de `Date.now()`
   é do núcleo puro; a casca de I/O é quem conhece o presente), amostra = `Fatura` `PAGA` com
   `dataPagamento ≥ limite`, atrasos crus = diferença de **dias civis Maputo** (`serialCivil`),
   nunca divisão de milissegundos. Toda a aritmética delega em `calcularPerfilAtraso`.
5. **`marcarVencidas` recalcula sempre** a bandeira a partir da data (anterior **estrito**, em
   dias civis Maputo; ENTRADAS e SAÍDAS por igual): um `vencida` pré-existente não sobrevive à
   re-marcação — a bandeira depende da data, não de quem a pôs.
6. **`calcularPerfilAtraso`** segue o arbitrado em `479eaae`: truncamento em zero POR
   OBSERVAÇÃO antes de média e σ; desvio AMOSTRAL (`n − 1`); `n < 2` ⇒ σ = 0, nunca `NaN`;
   vazia ⇒ média 0, σ 0, `amostraInsuficiente: true`; `n < 20` ⇒ insuficiente (R5.3).

## Contratos WS-2 (DFC)

_A preencher pelo nó L9._

## Dependências de leitura noutros domínios

Só leitura, sem alteração de schema fora de `financas.prisma`:

| Modelo | Domínio | Campos lidos | Filtro |
|---|---|---|---|
| `ContaPagar` | Compras | `valorRestante`, `dataVencimento`, `status` | `ABERTA`, `PARCIALMENTE_PAGA`, `VENCIDA` |
| `Fatura` | Finanças | `total`, `totalPago`, `dataVencimento`, `status`, `dataPagamento` | `EMITIDA`, `PARCIALMENTE_PAGA`, `VENCIDA` (+ `PAGA` para o perfil de atraso) |
| `Payroll` | Pessoas-Projectos | `custoTotalEntidade`, `dataPagamento`, `mesReferencia`, `anoReferencia`, `status` | `PROCESSADO` |
| `ContaBancaria` | Finanças | `contaContabilId`, `ativo` | `ativo = true`. **`saldoAtual` nunca** |
| `SessaoCaixa` | Finanças | `fundoInicial`, `totalEntradas`, `totalSaidas` | `ABERTA` |

## Oráculos

| Invariante | Ficheiro | Escrito por | Estado |
|---|---|---|---|
| `I1` | `__tests__/projecao.integracao.test.ts` | `verificador-fluxo-caixa` | — |
| `I2`, `I3`, `I5` | `__tests__/projecao.property.test.ts` | `verificador-fluxo-caixa` | **Escrito e vermelho** (P2v, 2026-09-21) — ver abaixo |
| `I4` | `__tests__/projecao.tenant.test.ts` (integração) | `verificador-fluxo-caixa` | — |
| `I6`, `I8` | `__tests__/dfc.property.test.ts` | `verificador-fluxo-caixa` | — |
| `I7`, `I9`, `I10` | `__tests__/dfc.integracao.test.ts` | `verificador-fluxo-caixa` | — |
| Fixtures | `__tests__/fixtures/{projecao,dfc}-seed-demo.json` | `verificador-fluxo-caixa` | — |

### P2v — saída vermelha de `projecao.property.test.ts` (2026-09-21)

O oráculo foi escrito antes da solução e **falha porque o módulo não existe** — não por outra razão
(o `tsc --noEmit` sobre o ficheiro só acusa o mesmo `TS2307` do import em falta; zero erros de tipo
próprios). Saída literal de
`npx vitest run src/server/services/financas/__tests__/projecao.property.test.ts` (de `apps/erp/`):

```
 RUN  v4.1.10 /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-tesouraria/apps/erp

 ❯ src/server/services/financas/__tests__/projecao.property.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/server/services/financas/__tests__/projecao.property.test.ts [ src/server/services/financas/__tests__/projecao.property.test.ts ]
Error: Cannot find module '../projecao.service' imported from /Users/xavier/dev/code/workspace/2026/gespro/wt/feat-tesouraria/apps/erp/src/server/services/financas/__tests__/projecao.property.test.ts
 ❯ src/server/services/financas/__tests__/projecao.property.test.ts:27:1
     25| // BLOCKER (doutrina 00 §2).
     26| // -------------------------------------------------------------------…
     27| import {
       | ^
     28|   acumularSaldos,
     29|   distribuirCompromissos,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  02:31:34
   Duration  927ms (transform 169ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

O que o L2 tem de exportar de `projecao.service.ts` para o oráculo correr:
`montarBuckets` (`MontarBucketsFn`), `expandirRecorrencia` (`ExpandirRecorrenciaFn`),
`distribuirCompromissos` (`DistribuirCompromissosFn`), `acumularSaldos` (`AcumularSaldosFn`).

Casos que TÊM de lançar (um por invariante, escolhidos de propósito):

- **I2**: `montarBuckets` com horizonte negativo. O Zod trava `min(0)` na fronteira, mas devolver
  `[]` em silêncio faria I2 valer por vacuidade e a projecção sair vazia, indistinguível de «não há
  compromissos».
- **I3**: `distribuirCompromissos` com cenário fora do enum. Um `default` silencioso trataria um
  cenário novo (ou um typo) como OTIMISTA e devolveria números plausíveis e falsos.
- **I5**: `expandirRecorrencia` com recorrência fora do enum. Um `default` silencioso expandiria uma
  futura `SEMANAL` como `UNICA` ou como nada — 51 ocorrências desapareceriam da projecção sem erro.

Pontos em que o contrato do L1 é insuficiente e o oráculo NÃO decidiu por ele (a fixar antes do L2,
ou pelo orquestrador no ADR):

1. **Atraso médio negativo** (`PerfilAtraso.atrasoMedioDias < 0` — clientes que pagam adiantado é um
   dado histórico possível). Aplicado ingenuamente inverte I3. O oráculo aceita «lança» ou «trunca a
   zero» e proíbe a violação silenciosa; o contrato devia dizer qual das duas.
2. **`dataFimRecorrencia < dataPrevista` no núcleo puro**. R3.4 recusa-a no Zod/serviço, mas a
   função pura pode recebê-la; o oráculo aceita «lança» ou «conjunto vazio», consistente entre
   chamadas — o contrato não diz qual.
3. **Aritmética de calendário da recorrência**: MENSAL a partir do dia 31 (Fevereiro não o tem) e
   ANUAL a partir de 29 de Fevereiro não têm regra fixada no ADR-0036 nem na interface. I5
   (idempotência) vale seja qual for a regra, mas as golden fixtures do I1/I2 de integração vão
   precisar dela pinada por escrito.
4. **Desigualdade não-estrita nos extremos de I3**: com horizonte 0, atraso 0, amostra insuficiente
   (BASE degrada para OTIMISTA, R5.3) ou tudo vencido (R2.4: vencidas entram no primeiro bucket em
   todos os cenários), os três cenários coincidem legitimamente — só «≤» é exigível. Não é
   relaxamento do invariante: o ADR-0036 escreve I3 com «≤».

## Registo do orquestrador

### L2 — fechado

Oráculo 11/11 verde, `pnpm check` 112/1595, gates 5/5, e o oráculo **intocado** pelo implementador
(`git diff 115f736 -- '*__tests__/*'` vazio). Revisto: aprovar com nits, zero BLOCKERs.

Duas notas de processo que valem mais do que o resultado deste nó:

**Fundi o L2 antes de o rever**, ao contrário do L1. A razão é real — o oráculo estava vermelho
isolado no ramo do worktree e a integração só volta a ser coerente quando teste e implementação
entram juntos — mas inverteu a ordem revisão→merge do PM, e se a revisão tivesse devolvido um
BLOCKER a reversão já seria sobre a integração. Da próxima, os dois commits ficam no ramo até a
revisão voltar.

**O L2 tocou num ficheiro partilhado fora do seu âmbito** (`contabilidade.service.ts`, hoist do
`Intl`). Era seguro e estava declarado, mas a ratificação veio depois do merge. Toques em ficheiros
do mapa de conflitos passam a ser ratificados por mim **antes** de entrarem.

### L1 — fechado

Três passagens de revisão, todas «aprovar com nits», zero BLOCKERs e zero MAJORs. A terceira
auditou cobertura em vez de conformidade: cada requisito numerado de **R3** e **R4** contra uma
correspondência nomeável no contrato — schema, campo, tipo ou assinatura, nunca «está implícito no
desenho». Nenhum requisito ficou por exprimir. Isto importa porque nenhum dos 1584 testes exercita
o contrato novo: até o oráculo do L2 existir, o contrato é a única coisa que protege o L2, que
implementa contra ele e não contra o spec.

Rastreabilidade dos três campos que existem no schema e não constam de R3.1 — `contaContabilId`,
`observacoes` e `ativo`: vêm do **design §2**, que o P1 manda seguir exactamente. Não são invenção
do agente.

Revisão do `code-reviewer`: **aprovar com nits**, zero BLOCKERs. Diff restrito aos quatro
entregáveis; `__tests__/` e `fixtures/` intocados; `pnpm check` 111/1584 e `pnpm gates` 5/5, iguais
à linha de base.

Migração `22a_compromisso_tesouraria` gerada por mim pelo procedimento não-interactivo
(`migrate diff --from-config-datasource --to-schema prisma/schema --script` + `migrate deploy`),
não por `migrate dev`, que exige TTY. O SQL é puramente aditivo — dois `CREATE TYPE`, um
`CREATE TABLE`, dois `CREATE INDEX`, zero `ALTER` e zero `DROP` sobre tabelas existentes. O
`migrate diff` final devolve *empty migration*.

Nits encaminhados para onde se resolvem, em vez de ficarem num parecer que ninguém relê:
- **R3.4 no `atualizar` parcial** (o único MAJOR) → task **5.1-bis**, com os dois casos de teste.
  A regra vivia só num comentário de código, e um comentário não é um gate.
- **`obterCompromisso(id, ctx)`** em falta no `IProjecaoService` → task **5.1-ter**. A rota
  `[id]/editar` precisa dele e o `listarCompromissos` não serve.
- **`dataFim` ≥ `dataInicio`** no `FiltroCompromissoSchema` → task **6.2-bis**. Um intervalo
  invertido devolve hoje uma lista vazia sem dizer porquê.
- **`<input type="date">`** → task **7.4-bis**. `new Date('aaaa-mm-dd')` lê como UTC e a leste de
  Greenwich cai no dia anterior; o formulário constrói `new Date(ano, mes-1, dia, 12)`.
- **`valor` acima de ~9×10¹⁵** perde exactidão em `number` e o `Decimal(18,2)` admite-o. É dívida
  da casa inteira (`validations/caixa.ts` tem o mesmo), não deste nó. Não se corrige aqui: ou se
  corrige em todos os schemas de dinheiro, ou não se corrige.

Divergência a registar antes de o ADR-0036 ir a `Aceite` (acto humano): o §4 do ADR chama
`categoriaId` ao campo que o design §2, o schema, as tasks e este handoff chamam `rubricaId`. O
agente seguiu a fonte certa — o design governa o schema —, mas a divergência fica a apanhar quem
leia o ADR primeiro.

## Bloqueios

_Um nó que falhe três vezes a mesma verificação escreve aqui: o que tentou, o caso mínimo que
reproduz, e as três hipóteses de causa. Não continua a iterar._

## Parecer contabilístico (task 15.3, `[HUMANO]`)

_Obrigatório antes de o épico WS-2 fechar. A articulação prova que o mapa fecha, não que cada conta
está na actividade certa face ao Decreto 70/2009._

- Revisto por: ____________________
- Data: ____________________
- Contas reclassificadas: ____________________
- Parecer: ____________________
