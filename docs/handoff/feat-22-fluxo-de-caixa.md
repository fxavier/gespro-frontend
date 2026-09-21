# Handoff — Spec 22 (Fluxo de Caixa)

> Documento vivo. Cada nó do grafo actualiza a sua secção ao fechar.
> Spec: [`.kiro/specs/22-fluxo-de-caixa/`](../../.kiro/specs/22-fluxo-de-caixa/) ·
> Grafo: [`docs/agentic/grafo-22-fluxo-de-caixa.md`](../agentic/grafo-22-fluxo-de-caixa.md)

## Estado

| Épico | Agente | Worktree | Nó actual | Estado |
|---|---|---|---|---|
| WS-1 Projecção de Tesouraria | `feat-tesouraria` | `wt/feat-tesouraria` | L1 | Contratos entregues — em revisão (`code-reviewer`); migração `22a` por gerar |
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
| `I2`, `I3`, `I5` | `__tests__/projecao.property.test.ts` | `verificador-fluxo-caixa` | — |
| `I4` | `__tests__/projecao.tenant.test.ts` (integração) | `verificador-fluxo-caixa` | — |
| `I6`, `I8` | `__tests__/dfc.property.test.ts` | `verificador-fluxo-caixa` | — |
| `I7`, `I9`, `I10` | `__tests__/dfc.integracao.test.ts` | `verificador-fluxo-caixa` | — |
| Fixtures | `__tests__/fixtures/{projecao,dfc}-seed-demo.json` | `verificador-fluxo-caixa` | — |

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
