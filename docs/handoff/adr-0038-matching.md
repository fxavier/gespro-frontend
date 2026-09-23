# Handoff — ADR-0038, nó MATCHING

- **Data**: 2026-09-23
- **Depende de**: MODEL (sem handoff próprio; ver «Lacunas herdadas»)
- **Consumido por**: RECONCILIATION

## O que foi entregue

| Ficheiro | Conteúdo |
|---|---|
| `apps/erp/src/server/services/reconciliacao/matching.ts` | Núcleo puro: `PASSAGENS`, `ESTADOS_LIVRES`, `regraLigada`, `avaliar`, `emparelhar`, `confiancaDe`, `similaridadeDescricao`, `decidirDesfecho` |
| `apps/erp/src/server/services/reconciliacao/matching.service.ts` | `executarMatching(contaBancariaId, ctx): Promise<ResultadoMatching>` |
| `…/__tests__/matching.test.ts` | Property tests (≥1000 runs) + casos concretos |
| `…/__tests__/matching.service.test.ts` | Serviço com Prisma mockado por um fake com estado (avalia os `where`) |
| `apps/erp/prisma/migrations/*_0038_reconciliacao_modelo/` | **Migração do nó MODEL**, que faltava (ver abaixo). Puramente aditiva |

### Como o motor funciona

1. **Passagem por fora, lotes por dentro.** Para cada regra, pela ordem do enum
   (`REFERENCIA_EXACTA` → … → `DESCRICAO`), percorre os bancários livres em lotes de 200 por keyset
   `(dataMovimento, id)`. A prioridade da RF §6 é global à conta: uma regra fraca num lote não
   rouba o par que uma forte encontraria no lote seguinte (há teste para isso).
2. **Candidatos por índice, uma query por lote e passagem:**
   - `REFERENCIA_EXACTA`: `referenciaNormalizada IN (…)` + janela de datas → índice
     `[tenantId, contaBancariaId, referenciaNormalizada]`.
   - Restantes: um ramo `OR` por `(natureza, valor)` do lote, com `valor ∈ [v−tol, v+tol]` (tol = 0 em
     `VALOR_NATUREZA_DATA`) e `dataContabilistica ∈ janela ± toleranciaDias` → blocking key.
   - Dentro do lote, `emparelhar` procura por mapa (referência, núcleo numérico) e pesquisa binária
     por valor dentro da natureza. Não há produto cartesiano em lado nenhum.
3. **Regras** (`avaliar`). Comum a todas: os dois lados em `ESTADOS_LIVRES`, a mesma natureza e
   `distanciaDias ≤ toleranciaDias`. Só `REFERENCIA_EXACTA` aceita valores diferentes (identidade
   forte), com desfecho `DIFERENCA_VALOR`. As outras exigem o valor dentro da tolerância.
   `DOCUMENTO` procura o `documento` normalizado (≥ 4 caracteres) dentro da referência ou da
   descrição bancária. `DESCRICAO` usa Jaccard de palavras (≥ 3 caracteres), com limiar 0,5.
4. **Desfecho** (`decidirDesfecho`):
   - diferença de valor acima da tolerância → nunca confirma; os dois lados passam a `DIFERENCA_VALOR`;
   - `autoReconciliacao` **e** `confianca ≥ limiarConfianca` → confirma; os dois lados passam a `RECONCILIADO`;
   - senão, é **sugestão** (opção (a) decidida pelo utilizador): grava a correspondência com
     `confirmadaEm = null` e reserva os dois movimentos (`correspondenciaAtivaId`) **sem mudar o estado**.
5. **Escrita** (RF §14): cada correspondência tem a sua `prisma.$transaction`, com esta sequência:
   `create` da correspondência com as duas linhas → `updateMany` de cada lado com
   `WHERE correspondenciaAtivaId IS NULL AND estado = <lido>` → se `count ≠ 1`, lança
   `BusinessRuleError('MOVIMENTO_JA_CORRESPONDIDO')`, a transacção inteira volta atrás e a proposta
   conta como `conflitos`. A corrida continua.
6. **Classificação** (RF §8/§9/§22), por `classificarSemCorrespondencia`, com `dataReferencia` =
   `max(dataMovimento)` da conta. Bancários `PENDENTE` livres passam a `BANCO_SEM_CONTABILIZACAO`.
   Contabilísticos livres (`PENDENTE`/`EM_TRANSITO`/`CONTABILIDADE_SEM_BANCO`) passam a `EM_TRANSITO`
   ou a `CONTABILIDADE_SEM_BANCO`, em lotes de 1000 e com um `updateMany` por transição. Um lançamento
   posterior ao último extracto fica `EM_TRANSITO`: o banco ainda não o pôde mostrar. Sem extracto
   nenhum na conta, nada se classifica.

Confiança: base por regra (100/95/90/85/75/60) − 2 por dia de diferença − 25 se houver empate.
**São números inventados** (ADR-0038 §Riscos c), marcados com `ponytail:` em `matching.ts`.

## Loop

| Fase | Resultado |
|---|---|
| INSPECT | O RF-XXX **não existe no repositório**; a spec usada foi o ADR-0038. MODEL sem migração, sem handoff e sem `prisma generate` |
| PLAN | Como acima; opção (a) para as sugestões |
| TEST | 67 testes verdes em `reconciliacao/`. Mutações verificadas: tirar o conjunto de usados, tirar a janela de datas, trocar a ordem das passagens, tirar a correcção das datas futuras — todas apanhadas |
| REVIEW | Subagente `code-reviewer`, sem o contexto do autor: 0 BLOCKER, 1 MAJOR, 3 NIT, veredicto «APROVAR COM NITS» |
| FIX | MAJOR (inversão de prioridade entre lotes) → corrigido e com teste. NIT de regex com diacríticos literais → corrigido. NIT de datas posteriores ao extracto → corrigido e com teste. NIT de rollback só mockado → fica para RECONCILIATION (abaixo) |
| VERIFY | `pnpm gates` **verde**. `pnpm check`: `prisma validate`, `tsc` e `eslint` (0 erros) verdes; vitest com 1675 verdes e **1 vermelho alheio a este nó** (abaixo) |

Nota sobre os testes: durante o FIX, o autor alterou `matching.service.test.ts`, que ele próprio
escrevera nesta sessão. O mock sequencial foi trocado por um fake com estado, porque o original
dependia da ordem das chamadas, que mudou com a correcção do MAJOR. Nenhuma asserção foi
enfraquecida: o teste da RF §19 passou a exigir as duas formas de query, e entraram dois testes
novos.

### O vermelho que fica: `projecao.golden.test.ts`

A guarda da golden fixture da spec 22 recusa-se a correr porque o estado do tenant `demo` diverge:
`contasBancarias` 3 contra 0, `payrollProcessado` 2 contra 0, `contasPagarEmAberto` 9 contra 10.
As contas bancárias vêm da alteração **por commitar** em `prisma/seed/financas.ts`, que é anterior a
esta sessão. A migração deste nó só acrescenta colunas e tabelas e não cria linhas. Pela doutrina,
a fixture re-deriva-se à mão e nunca por um agente autor. **Acção humana**: re-derivar a fixture
(handoff da spec 22, §Golden fixture) ou repor a base.

## Lacunas herdadas do MODEL (resolvidas ou abertas)

- **Migração em falta** → gerada aqui (`*_0038_reconciliacao_modelo`) com o `migrate diff`
  não-interactivo, aplicada com `migrate deploy`; o `migrate diff` seguinte devolve *empty
  migration*. Não tem DROP nenhum; `ReconciliacaoBancaria`/`ItemReconciliacaoBancaria` ficam intactos.
- **`prisma generate` não tinha corrido** → corrido.
- **Handoff `adr-0038-model.md`** → continua em falta.
- **`classificarSemCorrespondencia` usa distância absoluta**: com uma data posterior à
  `dataReferencia`, pode devolver `CONTABILIDADE_SEM_BANCO`. O serviço contorna isto (passo 6), mas o
  núcleo continua assim. Decidir no MODEL se deve ser direccional.

## O que ficou por fazer (e é de outro nó ou de decisão humana)

- **Agregação N:1 / 1:N (RF §15): não implementada.** O caminho está aberto:
  `CorrespondenciaBancaria` já é N:M e `TipoCorrespondencia.AGREGADO` existe. O sítio natural é uma
  7.ª passagem depois de `DESCRICAO`, só com `permitirAgregacao`, sobre os livres que sobrem, com a
  soma de subconjuntos limitada por `maxMovimentosAgregacao` e restringida por natureza e janela de
  datas. `gravarCorrespondencia` teria de reclamar N linhas por lado (`updateMany` com `id IN` e
  `count === N`).
- **`DIVERGENCIA` não é produzida pelo motor.** Sem o texto da RF §10, não há regra clara;
  referência igual com natureza oposta seria a candidata natural. Hoje o par é simplesmente
  ignorado.
- **Sem Server Action e sem ponto de entrada.** Quem chama `executarMatching` é decisão do
  RECONCILIATION/UI (action com `financas:banca:reconciliacao` e `revalidate`, e/ou chamada no fim
  da importação).
- **Auditoria**: as escritas usam o cliente estendido `prisma`, mas os modelos novos ainda não estão
  em `AUDIT_MODELS`. É o RECONCILIATION que os acrescenta.
- **Rollback real da RF §14**: o mock de `$transaction` é pass-through; o desfazer da correspondência
  num conflito só se prova com Postgres (Testcontainers) no RECONCILIATION.
- **Throughput**: uma transacção por correspondência. Se o volume o exigir, agrupar por lote com
  savepoints.
- **RF-XXX**: já está no repositório, em `.kiro/specs/23-reconciliacao-bancaria-automatica/requirements.md`. O exemplo da §16 tem o sinal trocado; já
  está registado no ADR.

## Fidelidade ao RF-XXX (confronto feito depois da entrega)

O RF só entrou no repositório depois deste nó. Confrontado com as secções do MATCHING:

| RF | Estado |
|---|---|
| §5, §22 (datas distintas; uma diferença de datas não é divergência) | Cumprido: nenhuma regra exige igualdade de datas, e nenhuma produz `DIVERGENCIA` |
| §7.1 / CA01 (match exacto → `RECONCILIADO`) | Cumprido **com `autoReconciliacao` ligada**: `REFERENCIA_EXACTA` no mesmo dia dá confiança 100 |
| §7.2 / CA02 (10/09 ↔ 12/09, tolerância 5 → `RECONCILIADO`, `DIFERENCA_TEMPORAL`) | Cumprido com `autoReconciliacao`: confiança 96 ≥ 90, `tipo = DIFERENCA_TEMPORAL` |
| §8 / CA03, CA04 (`EM_TRANSITO`, depois `RECONCILIADO`) | Cumprido: `EM_TRANSITO` está em `ESTADOS_LIVRES` e a transição para `RECONCILIADO` é permitida |
| §9 / CA05 (`BANCO_SEM_CONTABILIZACAO`) | Cumprido. A sugestão de lançamento fica para o RECONCILIATION |
| §10 / CA06 (100 000 contra 100 500, tolerância 0 → não reconcilia) | Cumprido: `DIFERENCA_VALOR`, nunca confirmada |
| §14 (dupla reconciliação) | Cumprido para 1:1 |
| §19 (sem O(N×M), índices) | Cumprido |
| **§6 «ordem de prioridade configurável»** | **Divergência.** A ordem é fixa: é a do enum, por decisão do ADR-0038 §5. Torná-la configurável pede um campo por conta (por exemplo `ordemRegras RegraCorrespondencia[]`) e passá-lo a `emparelhar(…, passagens)`, que já aceita a lista. Decisão para o dono do RF |
| **§11 exemplo «Auto-reconciliação: SIM»** | O ADR-0038 §6 põe `autoReconciliacao` **desligada** por omissão. Sem a ligar, CA01 e CA02 dão sugestões e não reconciliações. O teste de aceitação tem de configurar a conta como no exemplo do RF |
| §15 (N:M) | Não implementado neste nó (ver acima) |

## O que o nó seguinte assume

- `executarMatching` é **idempotente**: um movimento com `correspondenciaAtivaId` nunca volta a
  entrar, e uma segunda corrida sobre o mesmo estado não produz propostas novas.
- **Sugestão** = `CorrespondenciaBancaria` com `confirmadaEm IS NULL AND revertida = false`, com os
  movimentos reservados. Confirmar uma sugestão = preencher `confirmadaPorId/Em` e transitar os dois
  lados para `RECONCILIADO` (a partir de `DIFERENCA_VALOR` só se permite `RECONCILIADO_MANUALMENTE`,
  com justificação). Rejeitar = `revertida = true` + `correspondenciaAtivaId = NULL` nos dois lados.
- Estados livres para o motor: `ESTADOS_LIVRES` em `matching.ts`. `DIFERENCA_VALOR`, `DIVERGENCIA`
  e `IGNORADO` nunca são tocados automaticamente.
- O `MovimentoContabilistico` tem de ser projectado (nó IMPORT) antes da corrida; sem movimentos
  contabilísticos, tudo o que é bancário acaba em `BANCO_SEM_CONTABILIZACAO`.
