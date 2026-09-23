# Handoff — ADR-0038, nó RECONCILIATION

- **Data**: 2026-09-23
- **Depende de**: MATCHING ([handoff](./adr-0038-matching.md)), IMPORT ([handoff](./adr-0038-import.md))
- **Consumido por**: UI
- **Spec**: [RF-XXX §9, §13–§19, CA07](../../.kiro/specs/23-reconciliacao-bancaria-automatica/requirements.md) · [ADR-0038](../decisions/ADR-0038-reconciliacao-bancaria-automatica.md)

## Decisões do utilizador neste nó

- **D1 (a)**: o `DROP` de `ReconciliacaoBancaria`/`ItemReconciliacaoBancaria`, das rotas
  `/contabilidade/reconciliacao/**`, das 8 actions antigas e do `matching-board` passa para o **fim
  do nó UI**. Fazê-lo aqui deixaria o ERP sem ecrã de reconciliação até lá. O ADR pede o DROP
  «quando o substituto estiver a funcionar», e o substituto inclui o ecrã. Nada foi apagado.
- **D2 (a)**: sugestão de lançamento (RF §9) por um modelo novo, `RegraSugestaoLancamento`. Só
  sugere; criar o lançamento é acto do utilizador.
- **D3**: os serviços de acção sobre correspondências e todas as Server Actions entram **aqui**; o
  UI fica só com o ecrã.

## O que foi entregue

| Ficheiro | Conteúdo |
|---|---|
| `prisma/schema/reconciliacao.prisma` + migração `*_0038_reconciliacao_regras_abertura` | `RegraSugestaoLancamento`; `PeriodoReconciliacao.diferencaAbertura`. Aditiva |
| `prisma/seed/financas.ts` | Regra por omissão: saídas com COMISSÃO/ENCARGO/TAXA/IMPOSTO DE SELO/MANUTENÇÃO → **6981 Serviços bancários** (idempotente por contagem) |
| `src/server/services/reconciliacao/fecho.ts` | Núcleo puro: `montarMapaFecho`, `periodosSobrepoem`, `escolherRegra`, `sugerirPartidas` |
| `src/server/services/reconciliacao/reconciliacao.service.ts` | Período: `abrirPeriodo`, `obterMapaFecho`, `fecharPeriodoReconciliacao`, `cancelarPeriodoReconciliacao`. Orquestração: `executarReconciliacao`. Correspondências: `confirmarCorrespondencias`, `reconciliarManualmente`, `reverterCorrespondencia`, `definirIgnorado`. Sugestão: `sugerirLancamento` |
| `src/server/actions/reconciliacao.actions.ts` | 9 mutações (`financas:banca:reconciliacao` + `revalidate`) e 2 leituras (`permiteEmLeitura`) |
| `src/lib/validations/reconciliacao.ts` | Schemas Zod partilhados: dinheiro como texto, datas `aaaa-mm-dd`, **justificação ≥ 10 caracteres** |
| `src/server/security/rate-limiter.ts` | `extractoLimiter`: 10 importações por minuto por utilizador |
| `src/server/db/audit-extension.ts` | Os 6 modelos novos em `AUDIT_MODELS`; `CorrespondenciaBancaria` e `PeriodoReconciliacao` em `CRITICAL_ENTITIES` |
| `src/server/services/financas/contabilidade.service.ts` | `fecharPeriodo` (ADR-0033) passa a ver também `PeriodoReconciliacao` ABERTO/EM_RECONCILIACAO sobreposto → `RECONCILIACAO_EM_ANDAMENTO` |
| `src/app/api/contabilidade/reconciliacao/[id]/export/route.ts` | A exportação antiga exige `financas:banca:reconciliacao` (antes `financas:leitura`, mais lata) |
| `src/server/services/reconciliacao/matching.service.ts` | Guarda nova: um par cuja **sugestão** foi rejeitada não volta a ser proposto (`jaRejeitadas`) |

### Mapa de fecho (RF §16, §17) — a aritmética

```
saldoReconciliado = saldoFinalBanco
                  − Σ sinal·valor (bancários por explicar)
                  + Σ sinal·valor (contabilísticos por explicar)
                  − Σ sinal·(valorBanco − valorContabilístico) (diferenças aceites)
                  − diferencaAbertura
diferencaResidual = saldoReconciliado − saldoFinalContabil
```

- **Janela**: do primeiro dia da **primeira** reconciliação não cancelada da conta até ao fim do
  período. Um `EM_TRANSITO` de há três meses continua a contar; é isso que o CA04 pede.
- **Explicado**: um movimento só está explicado se a sua correspondência estiver **confirmada** e
  **todas** as linhas caírem na janela. Um par em que o banco só aparece depois do fim é, à data do
  fim, um movimento em trânsito. Uma sugestão por confirmar não explica nada.
- **`diferencaAbertura`** = saldo do extracto no início da primeira reconciliação − saldo do razão na
  véspera. É o que ficou por explicar antes de o sistema começar a reconciliar esta conta; sem ela, o
  primeiro fecho nunca daria zero.
- **Saldo do razão**: `$queryRaw` com `LANCADO ∪ ESTORNADO` (o mesmo universo da projecção) e corte
  por dia civil `AT TIME ZONE 'Africa/Maputo'`. **Não** usa `saldoContabilAte`, que filtra só
  LANCADO (issue #66) e partiria o fecho numa conta com estornos.
- **Oráculo**: um property test a 1000 corridas gera razão e extracto em conjunto e calcula os
  saldos somando os próprios movimentos; tudo explicado ⇒ residual **exactamente** zero. Um
  movimento que o sistema não conhece aparece, inteiro, no residual.
- **Correcção à RF**: segue a direcção de sinal corrigida no ADR (§Saldo reconciliado), não o
  exemplo da RF §16.

### Período

- **Abrir**: com a conta **trancada** (`FOR UPDATE`), verifica que há um só período activo por conta
  e nenhuma sobreposição (fronteira inclusiva, cancelados excluídos). Recusa conta PGC partilhada e
  conta inactiva. Os saldos contabilísticos vêm do razão.
- **Fechar**: com o período trancado. ABERTO/EM_RECONCILIACAO → RECONCILIADO **só** com residual zero
  ou justificação (senão `RECONCILIACAO_COM_DIFERENCA`, com o valor em `details`). Grava o mapa e
  prende as correspondências que o explicam ao período (`periodoId`).
- **Cancelar**: com o período trancado; RECONCILIADO é terminal.
- **Executar**: projecção → motor → período ABERTO passa a EM_RECONCILIACAO, condicional ao estado.

### Correspondências

- **Confirmar**, em lote: cada correspondência na sua transacção; a resposta traz
  `{ confirmadas, recusadas: {id, motivo}[] }`. Diferença de valor acima da tolerância só com
  justificação, e fica RECONCILIADO_MANUALMENTE (RF §10).
- **Reconciliar manualmente** (RF §13, CA07): justificação obrigatória; autor, data e diferença
  gravados. 1:1 sempre; N:M só com `permitirAgregacao` e até `maxMovimentosAgregacao` (tipo
  AGREGADO). Mesma natureza e mesma conta. Os movimentos têm de estar livres; uma sugestão pendente
  rejeita-se primeiro. O claim é condicional, e qualquer corrida desfaz tudo.
- **Reverter**: append-only (`revertida` + autor + data). Movimentos reconciliados ou com diferença
  voltam a PENDENTE; os de uma sugestão só ficam livres, porque EM_TRANSITO não volta a PENDENTE.
  **Recusa** se o período que a correspondência explica estiver fechado (RF §19).
- **Ignorar/reactivar**: só movimentos livres; um `update` de uma linha, auditado.

### Auditoria (RF §18)

A `audit-extension` só intercepta `create`/`update`/`delete`. Por isso **cada acção humana** (abrir,
fechar, cancelar, confirmar, reconciliar à mão, reverter, ignorar) escreve `create`/`update` de
**uma** linha, que fica auditada. As escritas em lote do motor e da importação (`createMany`/
`updateMany`) não vão ao `AuditLog`. O trilho delas é a própria `CorrespondenciaBancaria`,
append-only, com quem, quando, regra, resultado, diferença e justificação: exactamente o que a §18
enumera. A revisão considerou-o suficiente.

## Loop

| Fase | Resultado |
|---|---|
| INSPECT | Três decisões pedidas (D1–D3). Achados: a `audit-extension` não cobre escritas em lote e escreve as críticas **fora** da transacção; `fecharPeriodo` dependia do modelo antigo; rejeitar uma sugestão faria o motor repropô-la |
| TEST | 153 testes verdes em `reconciliacao/` + `periodo-contabil`. Dois vermelhos durante o TDD eram do mock (o operador SQL chega como fragmento `Prisma.sql`, e `Prisma.Sql` não é classe em Prisma 7), não do serviço |
| REVIEW | Subagente `code-reviewer`, sem o contexto do autor: 0 BLOCKER, 3 MAJOR, 2 NIT, «APROVAR COM NITS» |
| FIX | MAJOR 1: `cancelar` com tranca e `executar` condicional; um cancelamento concorrente pisaria um RECONCILIADO. MAJOR 2: justificação do fecho com ≥ 10 caracteres. MAJOR 3: teste para a pré-condição nova do `fecharPeriodo`. NIT: a guarda do motor só conta **sugestões** rejeitadas, não reconciliações desfeitas. NIT: `extractoLimiter` próprio. Tudo com teste |
| VERIFY | `pnpm check` verde (1748 testes; avisos de lint inalterados em 109); `pnpm gates` verde; `pnpm db:seed` corre e cria a regra; a golden da spec 22 continua verde |

**Testes de outros nós tocados, só aditivamente:**
- `periodo-contabil.test.ts` (oráculo do ADR-0033): mock de `periodoReconciliacao.count` e um caso
  novo para a pré-condição.
- `matching.service.test.ts`: mock de `count` e um caso novo para a guarda.

Nenhuma asserção enfraquecida; a revisão confirmou-o.

## O que ficou por fazer

- **DROP do modelo antigo** (D1): no **fim do nó UI**, numa migração única, junto com as rotas antigas,
  as 8 actions de `contabilidade.actions.ts`, `matching-board.tsx`, `src/lib/extrato-csv.ts`, os
  schemas antigos de `validations/contabilidade.ts`, os tipos em `types/contabilidade.ts` e
  `system-modules.ts`. Também `analytics.service.ts:254`, que tira o rácio de reconciliação de
  `ItemReconciliacaoBancaria.conciliado` e deve passar a contar movimentos por estado. E ainda a
  pré-condição antiga de `fecharPeriodo` (`reconciliacaoBancaria.count`) e o seu teste.
- **CRUD das regras de sugestão**: não há ecrã nem actions; o UI decide se entra.
- **Criar o lançamento a partir da sugestão**: a sugestão devolve as partidas; o UI chama o
  `criarLancamento` existente (gate-periodo) e depois `executarReconciliacao` para o casar.
- **`audit-extension`**: estender a `createMany`/`updateMany` e escrever as entidades críticas
  **dentro** da transacção. É transversal ao ERP todo; fica como dívida, fora deste grafo.
- **Tenant demo**: o BCI e o Millennium partilham a PGC 121, por isso abrir período, projectar e
  fechar recusam as duas contas. O Standard Bank (123) funciona.
- **Rollback real, concorrência e `FOR UPDATE`**: só com Postgres (Testcontainers); os testes
  mockados provam a intenção, não o motor da base.
- **Performance do mapa**: lê toda a janela desde o início da conta (O(N), indexado). Materializar
  por período se crescer.

## O que o nó UI assume

- **Actions** em `@/server/actions/reconciliacao.actions`:
  - `importarExtractoAction({ contaBancariaId, ficheiro: File })`;
  - `executarReconciliacaoAction`;
  - `abrirPeriodoAction` (datas `aaaa-mm-dd`, saldos como texto `1234.56`);
  - `fecharPeriodoAction({ periodoId, justificacao? })`;
  - `cancelarPeriodoAction`;
  - `confirmarCorrespondenciasAction({ ids, justificacao? })`;
  - `reconciliarManualmenteAction({ movimentosBancariosIds, movimentosContabilisticosIds, justificacao })`;
  - `reverterCorrespondenciaAction({ id })`;
  - `definirIgnoradoAction({ lado, id, ignorado })`;
  - leituras: `obterMapaFechoAction({ periodoId })` e `sugerirLancamentoAction({ movimentoBancarioId })`.
- Uma **sugestão** é uma `CorrespondenciaBancaria` com `confirmadaEm IS NULL AND revertida = false`.
  **Rejeitar** = `reverterCorrespondenciaAction`, e o motor não a volta a propor.
- **Excepções** (RF §23) = movimentos em `ESTADOS_EXCEPCAO`: `BANCO_SEM_CONTABILIZACAO`,
  `CONTABILIDADE_SEM_BANCO`, `DIFERENCA_VALOR`, `DIVERGENCIA`.
- **Erros** chegam como `ActionResult.error.code` estável, com a mensagem em pt-PT pronta a mostrar:
  - `RECONCILIACAO_COM_DIFERENCA` (com `details.diferencaResidual`) e `JUSTIFICACAO_OBRIGATORIA`;
  - `MOVIMENTO_RESERVADO` e `AGREGACAO_NAO_PERMITIDA`;
  - `PERIODO_RECONCILIACAO_EM_ABERTO`, `PERIODO_RECONCILIACAO_SOBREPOSTO` e `PERIODO_RECONCILIACAO_FECHADO`;
  - `CONTA_PGC_PARTILHADA`;
  - `LIMITE_PEDIDOS`;
  - `VALIDACAO`, com `details.erros` por linha, na importação.
- As datas são construídas ao meio-dia a partir de `aaaa-mm-dd`. A UI formata sempre por
  `src/lib/format-date.ts`.
