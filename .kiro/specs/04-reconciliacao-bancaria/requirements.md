# Requisitos: Reconciliação Bancária (completar)

## Introdução

Os modelos `ContaBancaria`, `ReconciliacaoBancaria` e `ItemReconciliacaoBancaria`
já existem (`prisma/schema/financas.prisma`) e o serviço
`src/server/services/financas/contabilidade.service.ts` já expõe
`listarContasBancarias`, `iniciarReconciliacao`, `marcarItemReconciliado` e
`concluirReconciliacao`. **A funcionalidade está, porém, incompleta**: a metade de
*matching* nunca é alimentada e o cálculo de saldos não existe. Este spec fecha o
ciclo para uma reconciliação bancária utilizável em produção.

### Estado atual (verificado no código)

- `iniciarReconciliacao` grava `saldoInicialContabil`/`saldoFinalContabil = 0` e
  `diferencaNaoConciliada = saldoFinalBanco` (sem cálculo real).
- **Não existe** qualquer função que crie/importe `ItemReconciliacaoBancaria`
  (nem a partir do razão contabilístico, nem de extracto bancário). Logo
  `marcarItemReconciliado` não tem sobre o que operar.
- `marcarItemReconciliado` fixa `conciliado: true` (não permite desconciliar).
- `concluirReconciliacao` apenas muda o estado para `CONCLUIDA`, sem validar a
  diferença nem recalcular saldos.
- Não existe rota `/contabilidade/reconciliacao/nova` (a listagem já lhe aponta →
  404) nem workspace de matching.

## Requisitos

### Requisito 1 — Gestão de contas bancárias

1. O sistema DEVE permitir CRUD de `ContaBancaria` ligada a uma `ContaPGC`
   (`aceitaLancamento = true`, classe `CLASSE_1`), com validação de unicidade
   `[tenantId, banco, numeroConta]`.
2. QUANDO se cria uma conta bancária, ENTÃO o `contaContabilId` DEVE referenciar
   uma conta PGC folha existente do mesmo tenant; caso contrário → `NotFoundError`.
3. O `saldoAtual` da conta bancária NÃO é editável manualmente após criação —
   é derivado dos movimentos/lançamentos (append-only).

### Requisito 2 — Abertura de reconciliação com saldos reais

1. QUANDO se inicia uma reconciliação (`iniciarReconciliacao`) para uma conta e
   um intervalo `[dataInicio, dataFim]`, ENTÃO o `saldoInicialContabil` DEVE ser
   calculado como o saldo do razão da `contaContabilId` até `dataInicio` (exclusivo)
   e o `saldoFinalContabil` até `dataFim` (inclusivo), por agregação de
   `PartidaLancamento` de lançamentos `LANCADO`.
2. NÃO DEVE ser possível abrir duas reconciliações `EM_ANDAMENTO` para a mesma
   conta bancária → `BusinessRuleError('RECONCILIACAO_EM_ABERTO')`.
3. O intervalo DEVE validar `dataInicio <= dataFim`; sobreposição com
   reconciliações `CONCLUIDA` anteriores da mesma conta é permitida mas assinalada.

### Requisito 3 — Geração de itens a partir do razão contabilístico

1. QUANDO uma reconciliação é aberta, ENTÃO o sistema DEVE gerar automaticamente
   um `ItemReconciliacaoBancaria` (`tipo = 'LANCAMENTO_CONTABIL'`) por cada
   partida da conta bancária no intervalo, com `data`, `descricao` (histórico do
   lançamento), `valor`, `tipoMovimento` (DEBITO/CREDITO), `lancamentoId` e
   `conciliado = false`.
2. A geração DEVE ser idempotente: reabrir/regenerar não duplica itens já
   existentes para o mesmo `lancamentoId`.

### Requisito 4 — Importação de extracto bancário

1. O sistema DEVE permitir importar linhas de extracto bancário (CSV) como
   `ItemReconciliacaoBancaria` (`tipo = 'EXTRATO_BANCARIO'`), com
   `extratoReferencia`, `data`, `descricao`, `valor` e `tipoMovimento`.
2. O parsing DEVE ser validado por Zod (colunas obrigatórias, datas, decimais);
   linhas inválidas são rejeitadas com relatório de erros, sem persistir nenhuma
   (all-or-nothing por ficheiro).
3. Importar o mesmo ficheiro duas vezes NÃO DEVE duplicar linhas (chave natural
   `extratoReferencia` por reconciliação).

### Requisito 5 — Matching (conciliação de itens)

1. O sistema DEVE permitir marcar itens como conciliados/desconciliados
   (`marcarItemReconciliado` aceita `conciliado: boolean`, não fixa `true`).
2. O sistema DEVE oferecer *auto-match* que sugere pares
   `LANCAMENTO_CONTABIL`↔`EXTRATO_BANCARIO` por igualdade de `valor` +
   `tipoMovimento` + proximidade de `data` (janela configurável de dias).
3. Conciliar/desconciliar DEVE recalcular `diferencaNaoConciliada` da
   reconciliação numa única transacção (sem estados intermédios inconsistentes).

### Requisito 6 — Conclusão e bloqueio

1. `concluirReconciliacao` DEVE recalcular saldos e a diferença; SÓ é permitida
   quando `diferencaNaoConciliada == 0` OU quando é fornecida uma justificação
   (`observacoes`) para a diferença residual → caso contrário
   `BusinessRuleError('RECONCILIACAO_NAO_BALANCEADA')`.
2. Após `CONCLUIDA`, a reconciliação e os seus itens são imutáveis (append-only);
   correcções fazem-se por nova reconciliação.
3. Toda a transição de estado (`EM_ANDAMENTO`→`CONCLUIDA`/`CANCELADA`) DEVE gerar
   auditoria via a extensão existente.

### Requisito 7 — UI sem modais

1. DEVE existir `/contabilidade/reconciliacao` (lista — já existe), 
   `/contabilidade/reconciliacao/nova` (abertura) e
   `/contabilidade/reconciliacao/[id]` (workspace de matching com duas colunas:
   razão vs extracto, acções de conciliar/auto-match/importar/concluir).
2. Todas as páginas de listagem/detalhe são Server Components; a interactividade
   vive em componentes-folha `'use client'`. Sem `Dialog` (excepto `AlertDialog`
   para concluir/cancelar). Valores monetários em `Decimal`→`string`.

## Critérios de Aceitação

1. `pnpm check` verde; cobertura do serviço de reconciliação ≥ 80%.
2. Property test: para qualquer conjunto de itens, `diferencaNaoConciliada` após
   matching == (saldoFinalBanco − saldoFinalContabil) − Σ(itens conciliados
   compensados). Invariante de balanceamento testada.
3. Isolamento multi-tenant verificado: `marcarItemReconciliado` e todas as leituras
   filtram por `tenantId` (fecho do BLOCKER histórico do gate da Wave 2).
4. Smoke autenticado: abrir → gerar itens → importar CSV → auto-match → concluir.

## Fontes

- Modelos e enums: `prisma/schema/financas.prisma` (`ReconciliacaoBancaria`,
  `ItemReconciliacaoBancaria`, `StatusReconciliacao`, `OrigemLancamento.RECONCILIACAO`).
- Convenções: `CLAUDE.md`, `.claude/skills/{prisma,api,ui}-conventions`.
