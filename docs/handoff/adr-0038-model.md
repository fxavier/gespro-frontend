# Handoff — ADR-0038, nó MODEL

- **Data**: 2026-09-23 (escrito depois da entrega, a partir do ADR e do código; o nó fechou sem handoff)
- **Depende de**: —
- **Consumido por**: MATCHING (entregue), IMPORT, RECONCILIATION
- **Spec**: [RF-XXX](../../.kiro/specs/23-reconciliacao-bancaria-automatica/requirements.md) · [ADR-0038](../decisions/ADR-0038-reconciliacao-bancaria-automatica.md)
- **Commit**: `eeb103f` (branch `adr-0038-reconciliacao`, PR #70)

## O que foi entregue

| Ficheiro | Conteúdo |
|---|---|
| `docs/decisions/ADR-0038-reconciliacao-bancaria-automatica.md` | A decisão, o plano em grafo e a correcção ao sinal da RF §16 |
| `apps/erp/prisma/schema/reconciliacao.prisma` | 5 enums e 7 modelos (ver abaixo) |
| `apps/erp/prisma/schema/financas.prisma` | 9 colunas de configuração em `ContaBancaria` (RF §11); `ReconciliacaoBancaria`/`ItemReconciliacaoBancaria` marcados **DEPRECIADO**, intactos |
| `apps/erp/src/lib/state-machines.ts` | `TRANSICOES_MOVIMENTO_RECONCILIACAO`, `TRANSICOES_PERIODO_RECONCILIACAO` (client-safe) |
| `apps/erp/src/server/services/reconciliacao/reconciliacao.model.ts` | Núcleo puro (sem DB) |
| `…/__tests__/reconciliacao.model.test.ts` | 35 testes, com property tests (fast-check) |
| `apps/erp/prisma/migrations/20260923210317_0038_reconciliacao_modelo/` | Migração **aditiva**, gerada tarde (ver «Lacunas») |

### Esquema

- **Enums**:
  - `EstadoMovimentoReconciliacao`: os 9 estados da RF §12.
  - `TipoCorrespondencia`: o `matchType` da §7.2, mais `AGREGADO` e `MANUAL`.
  - `RegraCorrespondencia`: a ordem de declaração **é** a prioridade do motor.
  - `OrigemExtracto`: CSV, XLSX, MT940, CAMT053, API, MANUAL.
  - `EstadoPeriodoReconciliacao`.
- **`ImportacaoExtracto`**: lote de importação, com `@@unique([tenantId, contaBancariaId, hashFicheiro])`. É a primeira camada de idempotência.
- **`MovimentoBancario`**:
  - pertence à conta bancária e não a uma reconciliação;
  - datas `dataMovimento` e `dataValor?`, e `referenciaNormalizada`, que é derivada e nunca introduzida pelo utilizador;
  - `chaveIdempotencia` com `@@unique` por conta: segunda camada de idempotência;
  - `estado` e `correspondenciaAtivaId?`;
  - índices: blocking key `[tenantId, contaBancariaId, estado, natureza, valor, dataMovimento]` e referência `[tenantId, contaBancariaId, referenciaNormalizada]`.
- **`MovimentoContabilistico`**: projecção de `PartidaLancamento`, idempotente por `@@unique([tenantId, partidaId])`. Os mesmos índices, com `dataContabilistica` no lugar de `dataMovimento`.
- **`CorrespondenciaBancaria`**: N:M e append-only. Guarda tipo, regra, confiança, os valores dos dois lados, `diferencaValor`, `diferencaDias`, `justificacao`, `confirmadaPorId/Em` e `revertida/revertidaPorId/Em`.
- **`LinhaCorrespondenciaBanco`** e **`LinhaCorrespondenciaContabilidade`**: duas tabelas de ligação, uma por lado, para que uma «linha sem lado» seja irrepresentável.
- **`PeriodoReconciliacao`**: vista fechada com o mapa da §17 gravado. `@@unique` só no período exacto; a não-sobreposição e a regra de um só aberto por conta são **invariantes de serviço**, a verificar na transacção.
- **`ContaBancaria`**: `toleranciaDias` (5), `toleranciaValor` (0), `permitirMatchPor{Referencia,Valor,Descricao}` (sim, sim, não), `autoReconciliacao` (**não**), `limiarConfianca` (90), `permitirAgregacao` (não), `maxMovimentosAgregacao` (5).

### Núcleo puro (`reconciliacao.model.ts`)

| Função | Para quê |
|---|---|
| `sinal(natureza)` | DEBITO = +1 = entrada, na perspectiva da empresa |
| `transitarMovimento`, `transitarPeriodoReconciliacao` | Lançam `BusinessRuleError('TRANSICAO_INVALIDA')`, não `Error` cru |
| `ESTADOS_CORRESPONDIDOS`, `ESTADOS_EXCEPCAO` | A lista de excepções da RF §23 |
| `normalizarReferencia` | Sem acentos nem separadores, em maiúsculas; `null` quando não sobra nada. Um `null` **nunca** casa com outro `null` |
| `nucleoNumerico` | Sufixo numérico (≥ 4 dígitos) do último grupo da referência **crua** |
| `chaveIdempotenciaBanco` | A referência do banco domina; na falta dela, o tuplo (dia, valor, natureza, descrição) mais um **ordinal** dentro do tuplo |
| `distanciaDias`, `classificarSemCorrespondencia` | RF §8/§9/§22: banco → `BANCO_SEM_CONTABILIZACAO`; contabilidade → `EM_TRANSITO` dentro da tolerância, depois `CONTABILIDADE_SEM_BANCO` |
| `calcularSaldoReconciliado`, `calcularDiferencaResidual` | RF §16 na direcção aritmeticamente correcta (ver ADR §Saldo reconciliado) |

### Máquinas de estado

- **Movimento**: nenhum estado é terminal. Todo o estado correspondido (e `IGNORADO`) volta a
  `PENDENTE` pela reversão. `DIFERENCA_VALOR` e `DIVERGENCIA` só saem para
  `RECONCILIADO_MANUALMENTE`, `IGNORADO` ou `PENDENTE` (e `DIFERENCA_VALOR` também para `DIVERGENCIA`),
  **nunca** para `RECONCILIADO` automático. `EM_TRANSITO` e `BANCO_SEM_CONTABILIZACAO` **não** voltam
  a `PENDENTE`, o que obrigou o MATCHING a não mexer no estado de uma sugestão.
- **Período**: `ABERTO → EM_RECONCILIACAO → RECONCILIADO | CANCELADO`. Os estados terminais são
  terminais: reabrir é criar um período novo (ADR §Questões em aberto 2).

## Lacunas (encontradas depois, pelo MATCHING ou a escrever este handoff)

| Lacuna | Estado |
|---|---|
| Sem migração | **Fechada** no commit `eeb103f`: gerada pelo MATCHING com `migrate diff` não-interactivo; um `migrate diff` posterior devolve *empty migration* |
| `prisma generate` por correr | **Fechada** |
| Sem handoff | **Fechada** por este documento |
| `classificarSemCorrespondencia` usa distância **absoluta**: um lançamento posterior à `dataReferencia` por mais do que a tolerância dá `CONTABILIDADE_SEM_BANCO` | **Aberta**. O MATCHING contorna-a no serviço, usando `max(dataReferencia, dataContabilistica)`. Corrigir no núcleo (distância direccional) com um property test novo |
| `chaveIdempotenciaBanco` tira o dia com `toISOString().slice(0, 10)`, ou seja, em **UTC** e não em `Africa/Maputo` | **Aberta, e é do IMPORT**. A chave é determinística para o mesmo `Date`, mas se dois parsers construírem o mesmo dia a horas diferentes (meia-noite local contra meio-dia), as chaves divergem e a reimportação **duplica**, o que parte o CA08. O IMPORT tem de normalizar as datas do extracto para `new Date(ano, mes - 1, dia, 12)` (regra de `<input type="date">` do CLAUDE.md) antes de chamar a função, ou passar a função a `diaCivilEmMaputo` |
| Property tests sem `numRuns` explícito: correm com as 100 iterações por omissão do fast-check; a skill `tdd` pede ≥ 1000 nos invariantes | **Aberta**. Cabe a quem escrever os oráculos, não a um agente autor |
| Os modelos novos não estão em `AUDIT_MODELS` | **Aberta, e é do RECONCILIATION** (RF §18) |

## O que os nós seguintes assumem

- **IMPORT**:
  - `MovimentoBancario.valor` é sempre positivo, e o sentido vive em `natureza`.
  - `referenciaNormalizada = normalizarReferencia(referencia)` preenche-se sempre na escrita.
  - `chaveIdempotencia = chaveIdempotenciaBanco(...)`, com o ordinal contado por ficheiro.
  - A projecção contabilística escreve `MovimentoContabilistico` por `partidaId`, **sem** filtro por janela de datas.
- **RECONCILIATION**:
  - Reverter uma correspondência = `revertida = true` + `correspondenciaAtivaId = NULL` nos dois lados + transição para `PENDENTE`. Nunca `DELETE`.
  - O `DROP` de `ReconciliacaoBancaria`/`ItemReconciliacaoBancaria` é deste nó e só dele.
- **Todos**: nenhuma escrita em `Lancamento`/`PartidaLancamento` fora de `criarLancamento` (`gate-periodo`).
