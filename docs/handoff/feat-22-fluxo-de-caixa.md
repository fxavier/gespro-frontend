# Handoff — Spec 22 (Fluxo de Caixa)

> Documento vivo. Cada nó do grafo actualiza a sua secção ao fechar.
> Spec: [`.kiro/specs/22-fluxo-de-caixa/`](../../.kiro/specs/22-fluxo-de-caixa/) ·
> Grafo: [`docs/agentic/grafo-22-fluxo-de-caixa.md`](../agentic/grafo-22-fluxo-de-caixa.md)

## Estado

| Épico | Agente | Worktree | Nó actual | Estado |
|---|---|---|---|---|
| WS-1 Projecção de Tesouraria | `feat-tesouraria` | `wt/feat-tesouraria` | L2 **fechado** → L3 | Núcleo puro entregue; oráculo `projecao.property.test.ts` 11/11 verde, intocado; cobertura do módulo 97,9 % linhas / 96,2 % ramos; caso canónico §4.1-bis confirmado por script |
| WS-2 DFC | `feat-dfc` | `wt/feat-dfc` | `fecho` entregue ao orquestrador (REVIEW dele por fazer) → `parecer` `[HUMANO]` | Entregue até ao 10.3; ver «WS-2 — … entrega». Falta o parecer contabilístico (ticket 11) e fica um bloqueio aberto na validação da versão (ver «Bloqueios») |

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
   contabilística contam-na duas vezes. Era a letra do §2, revogada pelo **§2-bis** — corrige-se
   nas tasks 3.4-bis/ter/quater.
   **Correcção ao que esta nota dizia antes:** afirmava que «deduplicar por PGC também divergiria»
   do oráculo. É falso. A fixture tem uma bancária activa e uma inactiva na mesma `121`, e o lado
   direito do I1 soma só sobre activas — logo conta a `121` uma vez e as duas semânticas dão o
   mesmo número. O oráculo fixa o respeito por `ativo` e a proibição de `saldoAtual`; **não** fixa
   a semântica por-bancária, e é por isso que a 3.4-ter tem de lhe acrescentar o caso das duas
   activas na mesma conta.
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

### Agregações e orquestração (nó L4, tasks 4.1–4.6 + 3.4-bis/quater — entregue 2026-09-21)

Quatro agregações privadas (`agregarFaturas`, `agregarContasPagar`, `agregarPayroll`,
`agregarCompromissos`) e `projetarTesouraria` em `projecao.service.ts`, pelo pipeline do design
§4.1. Oráculos anteriores intocados (property 14/14, integração 10/10); golden fixture nova
`projecao-seed-demo.json` + `projecao.golden.test.ts` 3/3. Decisões e factos deste nó:

1. **3.4-bis corrigida**: o loop de soma de `saldoTesourariaAte` itera agora os `contaContabilId`
   **distintos** (`contaIds`, construídos filtrando `ativo: true` primeiro e desduplicando
   depois), não `contasAtivas`. Docstring reescrito (3.4-quater); idem os três sítios do
   `projecao.interface.ts` que citavam a letra revogada do §2 (`saldoContabilAte` +
   «por conta bancária»), incluindo a afirmação falsa apontada pelo orquestrador (`:278`).
   O oráculo das duas activas na mesma PGC (3.4-ter/3.5-bis) continua por escrever — é do
   `verificador-fluxo-caixa`.
2. **`perfilAtraso(ctx, dataReferencia)`** — contrato ratificado pelo orquestrador. O parâmetro
   tem **valor por omissão `new Date()`**: o oráculo do L3 chama `perfilAtraso(ctx)`
   (`projecao.integracao.test.ts:233`) e um parâmetro obrigatório partia-o em compilação e em
   runtime — a omissão preserva o oráculo, e `projetarTesouraria` passa SEMPRE o instante
   explícito (um relógio só). Se o orquestrador quiser o parâmetro obrigatório, o verificador
   tem de actualizar o oráculo primeiro. Acrescentei também `lte: dataReferencia` à janela
   (semântica «os 180 dias que antecedem a referência»); com a referência no presente é
   indistinguível do comportamento anterior.
3. **§12 (último dia útil do payroll)** implementado como decidido: último dia do mês de
   referência que não seja sábado/domingo, sem feriados, via `ultimoDiaUtilSerial(ano, mes)` —
   parte de inteiros civis, nunca de instantes, logo é Africa/Maputo por construção. O seed demo
   não tem `Payroll PROCESSADO` (só `PENDENTE`), portanto o fallback não é exercitado pela
   fixture — fica para o verificador se o quiser trancar com caso próprio.
4. **`primeiroDiaNegativo` = `inicio` do primeiro bucket com `saldoFinal` negativo** — a
   granularidade não sabe o dia exacto do cruzamento; o `inicio` é a leitura conservadora.
   `menorSaldoProjetado` = mínimo dos `saldoFinal`. Interpretação deste nó, não fixada pelo
   design — o revisor que a conteste aqui.
5. **`semOrigensDeSaldo`** = zero `ContaBancaria` activas E zero `SessaoCaixa` ABERTA (duas
   contagens baratas dentro do mesmo `Promise.all`).
6. **Defeito pré-existente corrigido de passagem**: `pnpm db:seed` estava **partido em base
   limpa** — o commit `52739f3` (IVA dedutível) tornou `contaContabilId` obrigatório em
   `contaPagarService.criar` e não actualizou `prisma/seed/contas-pagar.ts`; a guarda de
   idempotência escondia-o em bases já semeadas. O seed passa agora `contaContabilId`
   (`6112 De mercadorias` para bens, `63299 Outros fornecimentos e serviços` por omissão).
   Sem isto o passo 1 do P4 («base limpa + pnpm db:seed») era inexequível.
7. A base `gespro-db` foi **limpa e re-semeada** (P4 passo 1) em 2026-09-21; os tenants `perf-*`
   foram re-criados com `db:seed:volume` para os EXPLAIN (e ficam prontos para o nó do k6).

#### Golden fixture — derivação (2026-09-23, base limpa + seed)

Re-derivada em 2026-09-23 porque o seed passou a criar três `ContaBancaria` no tenant demo
(`prisma/seed/financas.ts`). A de 2026-09-21 assumia zero contas, e a base local tinha ainda resíduos
manuais (2 payrolls processados, 1 conta a pagar liquidada). Método igual ao da primeira derivação:
base reposta (`prisma migrate reset` + `pnpm db:seed`), listagens SQL cruas sobre o tenant demo e
aritmética `Decimal` em Python. Nunca por `projetarTesouraria`. O script está reproduzido abaixo, em
«Como re-derivar». Relógio do teste pinado em `2026-09-23T16:30:00.000Z` (só `Date`); o seed gera
datas relativas ao dia da execução, logo **re-semear noutro dia civil exige re-derivar a fixture**
(as sentinelas do teste falham primeiro, com mensagem). Origem de cada número:

- **`saldoAbertura` 4 960 087,80**:
  - Conta PGC **121**, contada **uma vez**: 4 624 081,20 a débito − 388 100,00 a crédito =
    **4 235 981,20**, todas as partidas `LANCADO` e anteriores à referência. BCI e Millennium bim
    estão ambas ancoradas na 121: é o §2-bis do ADR-0036 exercitado ao vivo, e somar por conta
    bancária daria 9 196 068,40.
  - Conta PGC **123** (Standard Bank): sem partidas, logo 0,00.
  - Sessão ABERTA `CXS/2026/000008`: `fundoInicial` 5 000,00 + `totalEntradas` 719 106,60 −
    `totalSaidas` 0,00 = 724 106,60.
- **Perfil de atraso**: 64 facturas `PAGA` com `dataPagamento` na janela de 180 dias. O atraso cru
  civil (`AT TIME ZONE 'Africa/Maputo'`) é **−30 em todas**, porque o seed paga 30 dias antes do
  vencimento. Truncado por observação dá média 0, σ 0 e `amostraInsuficiente: false`. Contagem
  insensível à fronteira da janela (180 ou 181 dias dão os mesmos 64). Deslocamento BASE =
  PESSIMISTA = 0.
- **Entradas**: 20 facturas em aberto (3 `EMITIDA` + 8 `PARCIALMENTE_PAGA` + 9 `VENCIDA`), com valor
  `total − totalPago` e data civil do `dataVencimento`. 14 vencidas (< 23-09) vão para o 1.º bucket.
  A FAT/092 (vence a 27-09) cai no 1.º bucket e **não** está vencida.
- **Saídas**: 10 contas a pagar em aberto; 3 vencidas vão para o 1.º bucket. `Payroll PROCESSADO` = 0
  e `CompromissoTesouraria` = 0 no seed, com contribuição nula documentada.
- **Buckets**: 13 semanas exactas (91 dias inclusivos), de 23-09 a 22-12, com saldos em cadeia (I2).
  Entradas e saídas por bucket são **idênticas** às da derivação de 21-09, porque o seed desloca
  todas as datas por igual. Só o saldo muda, em +4 235 981,20 (verificação: 1 515 636,24 +
  4 235 981,20 = 5 751 617,44, o saldo final do 1.º bucket BASE).
- **PESSIMISTA (4.6-bis)**: exclui as 8 entradas vencidas há mais de 90 dias (< 25-06). As duas
  margens da fronteira estão asseridas: a FAT/045 (115 dias) sai e a FAT/055 (87 dias) fica. Menor
  saldo 4 009 286,28.
- **Perda de cobertura, assumida**: com o saldo da conta 121, o PESSIMISTA **já não cruza para
  negativo** (`primeiroDiaNegativo: null` nos dois cenários). O alarme de ruptura (R6.1) deixou de ser
  exercitado pela golden. Continua coberto pelos property tests do núcleo; se se quiser de volta na
  golden, é preciso um compromisso manual de saída no seed, não um número inventado na fixture.
- Sentinela `totalFaturas` = **106**, não 104: o funil de `demo-vendas` cria 104 e o seed clássico
  de finanças mais 2 (ambas `PAGA`, não tocam na projecção).

**Como re-derivar**: repor a base, `pnpm db:seed`, e depois, com `psql` sobre o tenant demo, tirar
cinco listagens: facturas em aberto (`total`, `totalPago`, `dataVencimento` civil), contas a pagar em
aberto (`valorRestante`, `dataVencimento` civil), a sessão ABERTA, as facturas `PAGA`
(`dataPagamento`/`dataVencimento` civis) e as partidas das contas PGC **distintas** das
`ContaBancaria` activas. A seguir, `Decimal` à mão: bucket = semana a partir da referência; vencidas
vão para o 1.º bucket; saldo em cadeia; PESSIMISTA sem as entradas vencidas há mais de 90 dias.

### CRUD de compromissos (nó L5, tasks 5.0–5.2 + bis/ter/quater/quinquies — entregue 2026-09-21)

`listarCompromissos` (cursor via `paginate`, ordem estável `(dataPrevista, id)`), `obterCompromisso`,
`criarCompromisso`, `atualizarCompromisso` e `eliminarCompromisso` (soft delete) em
`projecao.service.ts`. Oráculos anteriores intocados; `projecao.tenant.test.ts` (I4) escrito por
este agente **por autorização explícita do P5** («se o verificador ainda não o escreveu, escreve-o
tu») — 9/9 verde isolado e na suite. Decisões deste nó:

1. **5.0 fechada**: `perfilAtraso(ctx, dataReferencia: Date)` sem `?` nem `new Date()` por
   omissão, na interface e no serviço (`grep -c "dataReferencia.*=.*new Date()"` = 0 nos dois).
   Chamador esquecido passa a erro de compilação; o único chamador sem data era o oráculo do L3,
   já actualizado pelo verificador (`acd1488`).
2. **5.1-quater — `PaginacaoTesouraria.total?` SAIU** do contrato. Nenhum requisito nem o design
   §2 o pedem, a navegação é por cursor (nunca por número de página, padrão `paginate` da casa) e
   um `COUNT(*)` por pedido seria custo sem consumidor. Se a UI um dia o quiser, entra COM o
   contrato de quem o preenche.
3. **5.1-ter — `obterCompromisso` desvia do molde num ponto declarado**: `obterSessao` devolve
   `null`; aqui inexistente/eliminado/cross-tenant lançam o MESMO `NotFoundError` — o I4 exige o
   mesmo erro nos três verbos e um retorno `null` obrigaria cada chamador a re-inventar o 404.
4. **5.1-bis**: regras de coerência num único `validarCoerenciaCompromisso` sobre o par
   EFECTIVO (input ⊕ registo). A comparação R3.4 é por **dia civil Maputo** (`serialCivil`), a
   mesma régua de `expandirRecorrencia` — fim no próprio dia da primeira ocorrência é válido.
   São `ValidationError` (422), não `BusinessRuleError`: é dado mal-formado, não transição
   recusada. A regra irmã (UNICA com `dataFimRecorrencia`) entrou também no `superRefine` do Zod.
5. **`AtualizarCompromissoSchema.dataFimRecorrencia` aceita `null`** (limpar): sem isso, um
   recorrente com fim gravado nunca poderia converter-se em UNICA — a regra irmã recusá-lo-ia
   para sempre. O `nullable` embrulha o `coerce.date` por fora (um `null` cru viraria 1970).
6. **O ficheiro do I4 vive em `src/**/__tests__/`** (caminho literal do P5 e da tabela de
   oráculos) mas é de integração: `vitest.integration.config.ts` ganhou o caminho no `include`;
   no projecto `unit` salta sozinho (sem `INTEGRATION_DB_URL`) e aparece como 1 ficheiro/9 testes
   skipped no `pnpm check`.
7. **5.2-bis confirmada com os olhos**: o teste em skip do verificador («compromisso MENSAL a
   atravessar o horizonte produz uma ocorrência por mês civil (§9)») **activou** — corrida
   verbosa isolada mostra-o `✓ … 14ms`; a suite completa passou de 8 para 7 skipped e de 19+9
   para 29 passados. Ficheiro do verificador intocado.
8. **Linha de base respeitada**: suite de integração com as MESMAS cinco falhas, por nome
   (2 hooks + 3 de `tenant-isolation`), bloco de sanidade presente
   (`[integration] Container Postgres parado.`, 29 ≥ 19 passados). Nota lateral: a primeira falha
   de `tenant-isolation` exibe `Unique constraint (nuit)` — é intrínseca ao próprio ficheiro
   (`String(now).slice(0, 9)` dá o MESMO nuit aos dois tenants, o prefixo só muda a cada ~10 s),
   não induzida por este nó (os nuit deste nó são da gama `41x xxx xxx`). Fica para a issue #67.

### Actions e permissões (nó P6, tasks 6.0–6.2 + 6.2-bis — entregue 2026-09-21)

`pnpm check` exit 0, 114 ficheiros / 1611 testes, **zero skips**; `pnpm gates` 5/5 (`gate-leitura`
incluído). Oráculos intocados. Decisões e provas deste nó:

1. **6.0 — o I4 mudou de casa**: `projecao.tenant.test.ts` saiu de
   `src/server/services/financas/__tests__/` para `test/integration/` por `git mv`, **conteúdo
   intacto** (os imports são todos por alias `@/`, nada a ajustar). A entrada avulsa no `include`
   de `vitest.integration.config.ts` saiu com ele. Consequência medida: o `pnpm check` passou de
   «1 ficheiro / 9 testes skipped» para **zero skips**; na suite de integração o ficheiro corre
   isolado **9/9 verde** com `[integration] Container Postgres parado.` na saída.
2. **6.1 — permissões ligadas pelo padrão, e provadas na base**: `financas:tesouraria:leitura` e
   `financas:tesouraria:escrita` entraram no bloco financeiro do catálogo; a ligação aos papéis é
   automática pelo padrão existente (`:leitura` ⇒ `isReadOnly` ⇒ LEITURA/OPERADOR; prefixo
   `financas:` ⇒ FINANCEIRO; GESTOR = tudo menos a lista restrita; ADMIN = tudo). `pnpm db:seed`
   corrido; consulta directa ao Postgres (tenant `demo`) devolve **8 linhas**: ADMIN, FINANCEIRO
   e GESTOR com as duas; LEITURA e OPERADOR só com `:leitura`.
3. **6.2 — seis actions em `tesouraria.actions.ts`**: três consultas com
   `permiteEmLeitura: true` (projecção e compromissos visíveis em modo de Leitura, ADR-0032) e
   três mutações com `revalidate.paths` declarado, sem a bandeira (a escrita não passa em
   Leitura). O schema do `obterCompromissoAction` é um `z.object({ id: idEntidade() })` local
   **não exportado** — um ficheiro `'use server'` só pode exportar funções async.
4. **⚠️ Nota para o nó 7 (UI)** — o `revalidate` de actualizar/eliminar inclui o caminho literal
   `'/tesouraria/compromissos/[id]'`, conforme o prompt P6. Mas o `createSafeAction` chama
   `revalidatePath(p)` **sem o argumento `type`**, e o Next só revalida um padrão com segmento
   dinâmico quando recebe `type: 'page'` — o literal `[id]` sem `type` não casa com rota nenhuma.
   Nenhuma action da casa revalida hoje um caminho dinâmico, por isso não há precedente. Quando a
   rota `[id]` existir (7.4), ou o `createSafeAction` aceita `type`, ou troca-se por `tags` — a
   decisão é do orquestrador; deixá-la implícita era o bug de cache stale com outro nome.
5. **6.2-bis — intervalo invertido acusa-se**: `superRefine` no `FiltroCompromissoSchema` recusa
   `dataFim < dataInicio` com mensagem em `dataFim` — antes devolvia lista vazia sem dizer porquê.
6. **Linha de base inalterada por nome**: `Test Files 3 failed | 4 passed (7)` ·
   `Tests 3 failed | 29 passed | 7 skipped (39)` — as mesmas cinco falhas da tabela (2 hooks +
   3 de `tenant-isolation`, issue #67), bloco de sanidade presente, 29 ≥ 29 passados. O piso
   mantém-se em 29.

### UI de Tesouraria (nó P7, tasks 7.0–7.6 — entregue 2026-09-22)

`pnpm check` exit 0, 114 ficheiros / 1611 testes, **zero skips**; `pnpm gates` 5/5; `pnpm build`
verde com as quatro rotas (`/tesouraria`, `/tesouraria/compromissos`, `novo`, `[id]/editar`, todas
ƒ dinâmicas); `pnpm e2e:a11y` **28/28** no ERP (9 novos, tesouraria nos dois temas) + 23/23 no
site. Smoke autenticado real (admin@demo.mz): projecção BASE mostra 724 106,60 MT de abertura e
«Sem ruptura»; PESSIMISTA mostra −226 694,92 MT e primeira ruptura **27/10/2026**, com 8 buckets
destacados por fundo `destructive/5` + ícone + `sr-only` (não só cor, R6.2). CRUD completo pela UI
(criar → projecção muda → editar → eliminar por AlertDialog → projecção repõe 493 747,24 MT).
Oráculos intocados. Decisões deste nó:

1. **7.0 (arbitrado) cumprido**: o literal `'/tesouraria/compromissos/[id]'` saiu; as três
   mutações revalidam `paths: ['/tesouraria', '/tesouraria/compromissos']` +
   `tags: ['financas:tesouraria']`. `createSafeAction` intacto (issue #68).
2. **`startTransition` no submit** — o `dispatch` do `useActionState` chamado pelo `handleSubmit`
   corre fora de transição; o smoke apanhou o aviso do React na consola («called outside of a
   transition») e o `isPending` nunca actualizava. O golden standard
   (`nova-requisicao-form.tsx:105`) tem o mesmo defeito latente — não se tocou lá (fora de âmbito),
   fica o registo.
3. **Cenários coincidentes ditos ao utilizador** — no demo o perfil de atraso é 0d/σ0d (amostra
   64), logo BASE == OTIMISTA; a página di-lo numa nota em vez de fingir três curvas. A degradação
   R5.3 (amostra < 20) tem o seu próprio `Alert`, e `semOrigensDeSaldo` tem outro («não há origens
   de saldo configuradas», abertura mostra «—», nunca `0,00 MT` como facto).
4. **`formatarDiaMes` novo em `format-date.ts`** (dd/mm, Maputo) para o eixo do gráfico — em vez
   de um `Intl` local que violaria o ponto único. `ENTRADA`/`SAIDA` registados no mapa único do
   `StatusBadge` (success/destructive, como o sinal do valor nos movimentos de caixa).
5. **Gráfico com `ChartContainer`/`ChartTooltip` partilhados**; cores por `var(--chart-1)` directo
   — os tokens da marca são oklch completos, o `hsl(var(--chart-1))` do analytics é legado que
   não resolve. A tabela é a fonte; o gráfico tem `role="img"` com aria-label a dizê-lo.
6. **A11y de edição auto-limpa** — o teste cria (se preciso) um compromisso com data 2099-12-31 e
   elimina-o no fim pela UI: o `projecao.golden.test.ts` lê a MESMA base de dev, e um resíduo
   dentro do horizonte envenenava a fixture (aconteceu na primeira corrida; caçado e corrigido).
7. **Sem `@panel`/interceptor** — o spec só pede listagem/novo/editar (R7.3); o painel de
   inspecção não tem detalhe que justifique, e o molde tem o bug conhecido do segmento `novo`.

## Contratos WS-2 (DFC)

Fixados pelo nó `contratos` do grafo `dfc` (issue #153, 2026-09-25): ver
[`dfc-contratos.md`](dfc-contratos.md) — schema (4 enums, 3 modelos, relação em
`CompromissoTesouraria.rubricaId`), `validations/fluxo-caixa.ts` e `dfc.interface.ts`, com as decisões e o que
os nós `oraculos` e `seed` assumem.

## WS-2 — Demonstração de Fluxos de Caixa (issue #153): entrega

> Grafo [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md), worktree `wt/feat-dfc`, ramo `ws-2-dfc`. Decisão
> vinculativa: [ADR-0037](../decisions/ADR-0037-demonstracao-fluxos-caixa.md), com a «Emenda 2026-09-25».
> Consolidado pelo nó `fecho` (tickets 10.2 e 10.3) em 2026-09-26, à espera da revisão do orquestrador. **Falta o nó `parecer` `[HUMANO]`**: até lá, qualquer
> cliente real vê a faixa «Mapeamento por validar», e a #153 não fecha.

### O que foi entregue, por nó

Os commits vêm de `git log --oneline 07b814e..HEAD`. O `13c64c2 fix(compras)` está nesse intervalo, mas é alheio à
DFC: repõe dois imports que o merge do #206 deixou cair. Cada nó tem handoff próprio em `docs/handoff/dfc-<nó>.md`.

| Nó | Ticket | Commits | O que ficou |
|---|---|---|---|
| `adr` | 0 | `87aa7b0` | ADR-0037 `Aceite`, com a emenda de 2026-09-25 (acto humano). |
| `contratos` | 1 | `a865604` · ⚙ `e837870` (`22b`) | 4 enums e 3 modelos (`RubricaFluxoCaixa`, `MapeamentoContaFluxo` com `@@unique([tenantId, contaId])`, `VersaoMapeamentoFluxo`), `validations/fluxo-caixa.ts`, `dfc.interface.ts`. |
| `oraculos` | 2 | `cd48052` · `16a22a3` | Oráculos do núcleo (I6, I8, I10 no puro). |
| `nucleo` | 3 | `fe5a78f` | `classificarVariacoes`, `montarSeccoesDFC`, `verificarArticulacao`: puras, sem Prisma nem `Date.now()`. |
| `seed-v` | 4.4 | `aab9176` · `02b2f17` | Casos DFC de `tenant-bootstrap.test.ts`: um tenant novo fica com zero contas folha por mapear. |
| `seed` | 4.1–4.3 | `496481e` · ⚙ `542e845` (`22c`) | `rubricas-fluxo-caixa.json`; `semearRubricasFluxo()` em função própria, chamada pelo `tenant-bootstrap.ts`, idempotente; versão 1 `PENDING`. |
| `servico-v` | 5.3 | `49588cd` · `1cecdff` | Golden `dfc-seed-demo.json`, I9 (coerência com a DRE), I10 (isolamento), impedimentos. |
| `servico` | 5.1–5.2 | `81cd84b` | `gerarDFC` (impedimentos primeiro, sem mapa; `DFC_NAO_ARTICULA` com o delta em produção) e `contasNaoMapeadas`. |
| `fatia` | 6 | `1f6989e` | `/contabilidade/dfc` mínima, actions, permissões `financas:fluxo-caixa:{leitura,configurar,validar}`, entradas no menu, paleta e fio de Ariadne. |
| `config-v` | gate de 7 | `e9c2466` · `55a15e3` | V1–V3 contra o serviço real e o duplo com estado; sentinela da golden por instantâneo; `voltarSeguro`. |
| `export-v` · `export` | 9.1 | `f45795c` · `4a32121` · merge `f927ff3` · `7a89e07` | Route Handler `GET /api/contabilidade/dfc/export` (PDF com as marcas; 422 com impedimentos; passa em Leitura). |
| `config` | 7 | `5d8cc2f` | `/contabilidade/fluxo-caixa/rubricas` (+ `nova`, `[id]/editar`, `mapear`, `contas-caixa`, `validar`, `versoes`); cada escrita cria a versão n+1 `PENDING`; `desmapearConta`. |
| — | 8.3/8.4 | `5944213` | DRE e razão lêem o dia civil de Maputo e incluem o último dia (a DFC liga para as duas «do mesmo intervalo»). |
| `pagina` | 8 + 9.2 | `dc6f411` | Página completa: secções, painel de impedimentos com «Mapear», articulação, faixa, gráfico, «Exportar PDF»; AA nos dois temas. |
| `e2e-v` | 10.1 | `7ef5500` · `4914221` | `e2e/18-dfc.spec.ts`, com o fluxo inteiro pela UI. |
| `fecho` | 10.2–10.3 | por commitar (o orquestrador faz) | Regresso depois de gravar (achado 1 do `e2e-v`, só em parte: ver «Bloqueios»); `rubricas/[id]/page.tsx`; este handoff; `status.md`; lacunas. Detalhe em [`dfc-fecho.md`](dfc-fecho.md). |

### Invariantes e onde vivem os oráculos

Todos foram escritos pelo `verificador-fluxo-caixa` e estão **protegidos**: um nó de autor que lhes toque é BLOCKER.

| Invariante / regra | Oráculo |
|---|---|
| I6 articulação · I8 aditividade · I10 no núcleo | `src/server/services/financas/__tests__/dfc.property.test.ts` |
| Versões do mapeamento (V1–V3) | `__tests__/mapeamento-versao.property.test.ts`, `__tests__/dfc-config.test.ts`, `helpers/duplo-config-dfc.ts` (+ `duplo-config-dfc.autoteste.test.ts`) |
| Golden do seed, ao cêntimo | `__tests__/dfc.golden.test.ts` + `fixtures/dfc-seed-demo.json` + `helpers/dfc-golden.ts` (+ `dfc-golden-sentinela.autoteste.test.ts`) |
| I7 impedimentos (todos de uma vez, sem mapa) · I10 isolamento | `__tests__/dfc.impedimentos-isolamento.test.ts` |
| I9 coerência com a DRE · saldo de caixa pelos mesmos balancetes | `__tests__/dfc-coerencia-caixa.test.ts`, `__tests__/dfc-saldo-caixa.test.ts`, `__tests__/dfc-servico-homologo.test.ts` |
| Permissões | `__tests__/dfc-permissoes.test.ts` |
| Tenant novo sem contas por mapear | `src/server/provisioning/__tests__/tenant-bootstrap.test.ts` (casos DFC), `rubricas-fluxo-caixa.json.test.ts`, `semear-rubricas-versionado.test.ts` |
| `?voltar=` sem redireccionamento aberto | `src/lib/__tests__/dfc-voltar.test.ts` |
| PDF com marcas, 422, GET em Leitura | `src/app/api/contabilidade/dfc/export/__tests__/export-dfc-handler.test.ts` |
| Fluxo inteiro pela UI | `e2e/18-dfc.spec.ts` |
| A DFC não escreve em `Lancamento`/`PartidaLancamento` | `gate-periodo` (em `pnpm gates`): **a zero** no fecho (ticket 10.2) |

### Como correr

```bash
# da raiz da worktree
pnpm check && pnpm gates        # inclui a golden e as sentinelas contra a base local
cd apps/erp
npx vitest run src/server/services/financas/__tests__/dfc.golden.test.ts \
               src/server/services/financas/__tests__/dfc.impedimentos-isolamento.test.ts
# E2E, sozinho, com o servidor desta worktree numa porta livre (não a 3000)
pnpm --filter erp build
KEYCLOAK_CLIENT_SECRET="$(docker exec gespro-keycloak printenv GESPRO_ERP_CLIENT_SECRET)" \
  NEXTAUTH_URL=http://localhost:3010 AUTH_URL=http://localhost:3010 APP_URL=http://localhost:3010 \
  npx next start -p 3010 &
BASE_URL=http://localhost:3010 npx playwright test e2e/18-dfc.spec.ts --project=setup --project=e2e
pkill -f "next start -p 3010"; git checkout -- apps/erp/playwright/.auth/admin.json
```

A golden e as sentinelas lêem a base local: o mapeamento vivo do tenant `demo` tem de estar igual ao do seed. Versões
posteriores (append-only) são aceites; a mais recente tem de ter o instantâneo da v1.

### Dívida aberta

| Dívida | Onde nasceu | Quem fecha |
|---|---|---|
| **Errata ao ADR-0037 E2.** A letra diz `saldoContabilAte`; o código e os oráculos usam os saldos dos **mesmos balancetes** (`FILTRO_LANCAMENTO_MAPA`), porque `saldoContabilAte` filtra só `LANCADO` e numa conta com estornos guarda a metade invertida. Registar também `RUBRICA_CAIXA_UNICA` (uma só rubrica `CAIXA` por tenant; não se cria outra nem se muda a actividade de ou para `CAIXA`), ratificada pelo orquestrador. | `dfc-contratos.md` M2; `dfc-config.md` | humano (o ADR está `Aceite`) |
| **Período 13 (encerramento).** Os limites da DFC são por data, e o período 13 coincide em data com o 12: os lançamentos de encerramento entram no intervalo de dezembro. | `dfc-servico.md` MINOR-3 | ADR-0035 |
| **`AuditLog` fora da transacção.** A `audit-extension` grava o trilho fora da tx da escrita: um rollback deixa trilho de uma escrita que não aconteceu. Transversal, não é da DFC. | `dfc-config.md` m2 | transversal |
| **Histórico de versões sem paginação.** `/rubricas/versoes` carrega todas as versões com o `instantaneo` JSON inteiro para contar rubricas e contas. Com o `e2e-v` e o `fecho`, o `demo` local já passa de 500 versões. | `dfc-config.md` m5 | nó seguinte da DFC |
| **`CommandPalette` sem filtro por permissão.** Anterior à DFC, afecta todas as entradas. | `dfc-fatia.md`, `dfc-pagina.md` | transversal |
| **Emitente (nome e NUIT) no PDF.** O cabeçalho do PDF não tem o emitente. Por decidir. | `dfc-export.md` MINOR | humano |
| **Balancete ainda com o defeito do último dia.** `/contabilidade/balancete` converte `aaaa-mm-dd` por meia-noite UTC; a DRE e o razão foram corrigidos em `5944213`, o balancete não. | `5944213`; CLAUDE.md | transversal |
| **Tenants `perf-*` com impedimento na DFC.** As contas `9.n` do `seed:volume` ficam por mapear de propósito; `gerarDFC` num `perf-*` devolve impedimentos. Quando a DFC entrar nos cenários k6, o cenário tem de as mapear primeiro. | `dfc-seed.md` NIT (a) | quem escrever o cenário k6 |
| **Contraste AA a 4,47:1** em tabelas com negativos a vermelho sob `hover:bg-muted/50` (DRE, razão, balancete). Na DFC foi contornado retirando o hover. | `dfc-pagina.md` MINOR 2 | transversal (`docs/status.md`) |
| **A validação da versão às vezes não regressa** (e deixa o botão em «A validar…»). Ver «Bloqueios». | `fecho`, achado A | orquestrador |

### O que o nó `parecer` `[HUMANO]` precisa

- **O material**: a tabela 4.1, conta a conta, com as dúvidas marcadas ⚠, em
  [`dfc-seed.md` § «Tabela 4.1 — justificação conta a conta»](dfc-seed.md#tabela-41--justificação-conta-a-conta-material-do-nó-parecer),
  e a nota sobre a estrutura do plano logo a seguir (contas-mãe que aceitam lançamento; 51 e 59 sem folhas).
- **O pedido ao contabilista**: o prompt **PH** de [`docs/agentic/issue-153/prompts.md`](../agentic/issue-153/prompts.md).
  Junta a tabela exportada, a DFC do exercício de demonstração, e a DRE e o balancete do mesmo período.
- **Depois do parecer**: um PR com as correcções ao 4.1 e a golden 5.3 re-derivada **à mão** (nunca `vitest -u`).
  Depois, «Validar versão actual» com observação em cada tenant real. Só então o `parecer` fica FEITO e a #153 fecha.
  O registo fica na secção «Parecer contabilístico» abaixo.

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
| `I4` | `test/integration/projecao.tenant.test.ts` (movido de `__tests__/` no P6, task 6.0 — conteúdo intacto) | `feat-tesouraria` (autorização explícita do P5 — o verificador não o tinha escrito à data do L5) | **Verde** (9/9, 2026-09-21) |
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

## Linha de base da suite de integração

`pnpm test:integration` está **vermelho por motivo alheio à spec 22** — os três ficheiros abaixo
criam `User` e `ContaPGC` por INSERT directo e ficaram para trás do schema
([issue #67](https://github.com/fxavier/gespro-frontend/issues/67)). **Não se corrigem dentro deste
épico.**

Por isso o gate dos nós que usam esta suite **não é «verde»** — é **identidade de falhas por nome**.
Contagem não serve: uma corrigida e uma nova dão o mesmo total.

Medido em `00d2041` (2026-09-21, depois do L5), com Testcontainers a funcionar:

```
Test Files  3 failed | 4 passed (7)
Tests       3 failed | 29 passed | 7 skipped (39)
```

Os **nomes** das falhas não mudam de nó para nó — é isso que se compara. Os totais sobem à medida
que cada nó traz testes; actualiza-os aqui ao fechar cada um, e sobe o piso do bloco de sanidade
em conformidade.

Falhas esperadas, **por nome exacto**:

| Ficheiro | Teste |
|---|---|
| `test/integration/apuramento-iva-reproducibilidade.test.ts` | `Reprodutibilidade do apuramento IVA — DB efémera` (falha no hook) |
| `test/integration/periodo-trancamento.test.ts` | `Trancamento de período — DB efémera (Testcontainers)` (falha no hook) |
| `test/integration/tenant-isolation.test.ts` | `Tenant A e Tenant B podem ser criados de forma independente` |
| `test/integration/tenant-isolation.test.ts` | `utilizadores do Tenant A não são visíveis no filtro do Tenant B` |
| `test/integration/tenant-isolation.test.ts` | `DB está limpa no início — sem dados de runs anteriores (stateless)` |

**Bloco de sanidade** — sem isto, «as falhas são as mesmas» também é verdade quando a suite não
correu de todo. Uma corrida só conta se:

1. a saída contém `[integration] Container Postgres parado.` — prova que o container subiu e caiu,
   e que o `globalSetup` não degradou para `SKIP_INTEGRATION=true`;
2. o número de testes **passados** é `≥ 29` (piso do último nó fechado) — o degradado gracioso dá zero passados e tudo saltado;
3. o ficheiro do nó corre **isolado** e passa.

Qualquer falha fora desta tabela é do nó que a introduziu, e trava-o.

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

### `fecho` (grafo `dfc`), 2026-09-26: a validação da versão às vezes não regressa

**Sintoma.** Em `/contabilidade/fluxo-caixa/rubricas/validar`, «Validar» grava e mostra o toast «Versão N do
mapeamento validada.», mas o botão fica em «A validar…» para sempre, a página continua a mostrar «Por validar» e o
URL não muda. Acontece em cerca de 1 validação em 10 (entre 1/20 e 5/20 por corrida, em `next start`). Recarregar a
página mostra a versão validada: **a escrita acontece, o ecrã é que não sai do sítio.**

**Caso mínimo.** Pela UI, 20 vezes seguidas: mapear a 411 alternadamente em OP-05 e OP-04, abrir `/validar`,
preencher a observação e clicar em «Validar». O script é ad-hoc: está em [`dfc-fecho.md`](dfc-fecho.md) e foi
apagado.

**O que foi tentado. Três voltas, nenhuma verde:**

1. Tirar o `router.refresh()` a seguir ao `router.push`: não mudou nada.
2. `navegarDepoisDaAccao`, que espera uma macrotarefa antes do `push`. Corrigiu a edição de rubrica (de 4/18 para 0/40),
   mas a validação não mudou (2/20, 1/20, 2/20).
3. `redirect()` no servidor, com uma action `validarVersaoEVoltarAction`, para a resposta trazer a árvore do destino
   numa só entrada da fila. Deu 5/60, e foi revertido.

**O que se sabe, por instrumentação temporária do Next (já removida):**

- A fila do router está sã. A action é aplicada e sai da fila, o `navigate` é despachado com a fila vazia e é
  resolvido.
- O que não chega a acontecer é o **commit do React**.
- O defeito **reproduz-se sem `push` nenhum** (1/40): a transição da própria action pendura.
- A navegação simples `/editar → /rubricas` («Cancelar») deu 0/60, e o «mapear» nunca falhou (0/40 antes da correcção, 0 em mais de 200 gravações depois).

**Hipóteses que ficam (por ordem):**

- **(a)** A árvore que a resposta da action traz suspende numa promessa que nunca se cumpre. Na `/validar`, a página
  muda de ramo e desmonta o formulário dono da transição; no «mapear» isso não acontece.
- **(b)** Defeito do React 19 ou do Next 16.0.10 ao aplicar a árvore revalidada de uma action cuja página muda de
  ramo. Nesse caso reproduz-se num projecto mínimo, e a saída é actualizar o Next ou abrir uma issue a montante.
- **(c)** Um componente do layout com `use()` sobre dados que a revalidação invalida.

O passo seguinte é instrumentar o React (o `thenable` em que a raiz suspende), não o Next.

**Impacto.** O E2E `18-dfc` passa na mesma: valida uma vez por corrida. Em uso real, quem valida pode ficar a olhar
para «A validar…» e recarregar a página. O mapeamento fica validado.

## Parecer contabilístico (task 15.3, `[HUMANO]`)

_Obrigatório antes de o épico WS-2 fechar. A articulação prova que o mapa fecha, não que cada conta
está na actividade certa face ao Decreto 70/2009._

- Revisto por: ____________________
- Data: ____________________
- Contas reclassificadas: ____________________
- Parecer: ____________________
