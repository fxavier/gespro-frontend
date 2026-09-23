# Requisitos: Fluxo de Caixa (Projecção de Tesouraria + DFC)

## Introdução

O GestPro não tem nenhuma das duas peças que o nome «fluxo de caixa» designa. Tem controlo de
**caixa** (sessões de balcão) e tem contabilidade (balancete, razão, DRE, IVA, reconciliação).
Não tem nem o mapa contabilístico que explica de onde veio e para onde foi o dinheiro
(**Demonstração de Fluxos de Caixa**), nem a vista para a frente que diz se há dinheiro para os
compromissos das próximas semanas (**Projecção de Tesouraria**).

A documentação em `docs/DOCUMENTACAO.md:93,104` afirma que o módulo Finanças «gere fluxo de caixa».
É falso e o próprio ficheiro se contradiz na linha 165, onde lista a projecção como trabalho futuro.
Corrigir esse documento é requisito deste spec (R14).

### Estado actual (verificado no código, 2026-09-21)

- `git grep -iI "DFC|fluxo de caixa|tesouraria|forecast"` sobre `src/`, `prisma/` e `e2e/`: **zero
  ocorrências**.
- Barra lateral, grupo Finanças (`AppSidebar.tsx:106-120`): 11 entradas, nenhuma de DFC ou tesouraria.
- `ContaBancaria.saldoAtual` (`financas.prisma:543`) não tem escritor em produção — ver ADR-0036 §Contexto.
- Existem e são reutilizáveis: `saldoContabilAte`, `gerarDRE`, `montarLinhasBalancete`,
  `FILTRO_LANCAMENTO_MAPA`, `resolverPeriodo`, `caixaService.resumoSessao`.

### Divisão em épicos

| Épico | Âmbito | ADR | Agente | Worktree |
|---|---|---|---|---|
| **WS-1** | Projecção de Tesouraria | ADR-0036 | `feat-tesouraria` | `wt/feat-tesouraria` |
| **WS-2** | Demonstração de Fluxos de Caixa | ADR-0037 | `feat-dfc` | `wt/feat-dfc` |

WS-2 **só arranca depois de WS-1 integrado** — partilham `RubricaFluxoCaixa` e ambos tocam
`financas.prisma` e `tenant-bootstrap.ts`. Ver `docs/agentic/grafo-22-fluxo-de-caixa.md`.

---

## Épico WS-1 — Projecção de Tesouraria

### Requisito 1 — Saldo de abertura fidedigno

1. O sistema DEVE calcular o saldo de abertura como a soma do saldo de razão sobre os
   `contaContabilId` **distintos** das `ContaBancaria` activas do tenant — uma conta PGC entra se
   pelo menos uma bancária ancorada nela estiver activa, e entra **uma vez, pelo saldo inteiro**
   (ADR-0036 §2-bis; a redacção anterior dizia «todas as `ContaBancaria` activas» e contava a dobrar) —
   mais o saldo das `SessaoCaixa` em estado `ABERTA` (`fundoInicial + totalEntradas − totalSaidas`).
2. O sistema NÃO DEVE ler `ContaBancaria.saldoAtual` em nenhum ponto do cálculo.
3. QUANDO o tenant não tiver nenhuma conta bancária activa nem sessão aberta, ENTÃO o saldo de
   abertura É zero e a UI DEVE dizer explicitamente que não há origens de saldo configuradas — nunca
   apresentar `0,00 MT` como se fosse um facto apurado.

### Requisito 2 — Compromissos derivados do ERP

1. Entradas: `Fatura` com `status ∈ {EMITIDA, PARCIALMENTE_PAGA, VENCIDA}`, valor `total − totalPago`,
   data `dataVencimento`. `RASCUNHO`, `PAGA` e `CANCELADA` NÃO entram.
2. Saídas de fornecedores: `ContaPagar` com `status ∈ {ABERTA, PARCIALMENTE_PAGA, VENCIDA}`, valor
   `valorRestante`, data `dataVencimento`.
3. Saídas de pessoal: `Payroll` com `status = PROCESSADO`, valor `custoTotalEntidade`, data
   `dataPagamento` ou, se nula, o último dia útil do mês/ano de referência calculado em `Africa/Maputo`.
4. QUANDO um compromisso tiver data anterior a hoje e continuar em aberto, ENTÃO DEVE ser colocado no
   primeiro bucket (vencido) e assinalado como tal, nunca omitido.

### Requisito 3 — Compromissos manuais

1. O sistema DEVE permitir CRUD de `CompromissoTesouraria` (descrição, tipo, valor, data prevista,
   recorrência, rubrica opcional), com soft delete.
2. As recorrências (`MENSAL`, `TRIMESTRAL`, `ANUAL`) DEVEM ser expandidas em memória dentro do
   horizonte pedido; NÃO DEVEM ser materializadas em linhas.
3. Expandir a mesma recorrência duas vezes sobre o mesmo horizonte DEVE produzir exactamente o mesmo
   conjunto de ocorrências (invariante `I5`).
4. QUANDO `dataFimRecorrencia` existir e for anterior a `dataPrevista`, ENTÃO → `ValidationError`.

### Requisito 4 — Buckets e horizonte

1. Granularidade `DIARIA` (horizonte ≤ 90 dias), `SEMANAL` (≤ 180) ou `MENSAL` (≤ 365), validada no
   schema Zod. Combinação fora destes limites → `ValidationError`, nunca truncamento silencioso.
2. Cada bucket DEVE expor `inicio`, `fim`, `entradas`, `saidas`, `saldoInicial`, `saldoFinal`, todos
   em `Decimal`.
3. INVARIANTE `I2`: `saldoFinal(n) == saldoFinal(n−1) + entradas(n) − saidas(n)` para todo o `n`.
4. INVARIANTE `I1`: com horizonte zero, o `saldoAbertura` da projecção DEVE igualar, ao cêntimo, o
   saldo calculado independentemente pelo balancete para a mesma data.

### Requisito 5 — Cenários

1. Três cenários: `OTIMISTA`, `BASE`, `PESSIMISTA`, conforme ADR-0036 §6.
2. O atraso médio de cobrança DEVE ser calculado sobre facturas liquidadas nos últimos 180 dias do
   tenant.
3. QUANDO existirem menos de 20 facturas liquidadas nesse intervalo, ENTÃO `BASE` degrada para
   `OTIMISTA` e a resposta DEVE incluir `amostraInsuficiente: true`, que a UI apresenta.
4. INVARIANTE `I3`: `saldo_PESSIMISTA(d) ≤ saldo_BASE(d) ≤ saldo_OTIMISTA(d)` para todo o `d`.
5. As saídas NÃO são afectadas por cenário.

### Requisito 6 — Alertas de ruptura

1. A resposta DEVE incluir `primeiroDiaNegativo: Date | null` e `menorSaldoProjetado: Decimal`.
2. A UI DEVE destacar visualmente os buckets de saldo negativo, com contraste conforme WCAG AA e sem
   depender apenas da cor.

### Requisito 7 — UI `/tesouraria`

1. Página de listagem `/tesouraria` (Server Component) com selector de horizonte, granularidade e
   cenário em `searchParams`.
2. Gráfico de linha do saldo projectado + tabela de buckets; a tabela é a fonte, o gráfico é o
   resumo — a tabela nunca é substituída pelo gráfico.
3. `/tesouraria/compromissos` (listagem), `/tesouraria/compromissos/novo` e `/[id]/editar` — rotas
   dedicadas, **sem modais** (excepto `AlertDialog` de eliminação).
4. A página DEVE declarar visivelmente que a projecção não inclui vendas futuras não facturadas.
5. Todas as páginas DEVEM passar axe WCAG AA nos dois temas.

### Requisito 8 — Acesso e Leitura

1. Permissões novas: `financas:tesouraria:leitura`, `financas:tesouraria:escrita`, acrescentadas a
   `prisma/seed/rbac.ts` e ligadas aos papéis.
2. Todas as actions de consulta DEVEM declarar `permiteEmLeitura: true` (ADR-0032).
3. INVARIANTE `I4`: isolamento multi-tenant em todos os `findFirst`/`update`/`delete`; cross-tenant
   → `NotFoundError` (404).

### Requisito 9 — Desempenho

1. p95 < 400 ms para horizonte 90 dias/granularidade diária no tenant `perf-medio` de
   `pnpm db:seed:volume`.
2. Cenário k6 em `perf/k6` e plano de execução em `perf/explain` para cada agregação nova.

---

## Épico WS-2 — Demonstração de Fluxos de Caixa

### Requisito 10 — Rubricas e mapeamento

1. Modelos `RubricaFluxoCaixa` e `MapeamentoContaFluxo` conforme ADR-0037 §2, com
   `@@unique([tenantId, contaId])` em `MapeamentoContaFluxo`.
2. `tenant-bootstrap.ts` DEVE semear as rubricas `origem: SISTEMA` e mapear todas as contas folha do
   PGC padrão; o seed DEVE ser idempotente.
3. Rubricas `SISTEMA` NÃO PODEM ser eliminadas → `BusinessRuleError('RUBRICA_DE_SISTEMA')`.
4. O tenant PODE reatribuir o mapeamento de qualquer conta com `financas:fluxo-caixa:configurar`.

### Requisito 11 — Geração do mapa

1. `gerarDFC(periodoId | exercicioId)` DEVE produzir as três secções (operacional, investimento,
   financiamento) pelo método indirecto, a partir de `gerarDRE` e de dois balancetes.
2. O mapa DEVE ser delimitado por `PeriodoContabil` (ADR-0033), nunca por datas livres, e filtrar por
   `FILTRO_LANCAMENTO_MAPA`.
3. INVARIANTE `I9`: o resultado líquido que abre a secção operacional É, ao cêntimo, o
   `resultadoLiquido` de `gerarDRE` para o mesmo período.
4. QUANDO o período estiver aberto, ENTÃO o mapa sai marcado `provisorio: true`, e a UI e a
   exportação DEVEM apresentá-lo como provisório.

### Requisito 12 — Recusas, não avisos

1. ANTES de calcular, `gerarDFC` DEVE verificar se existe alguma conta com movimento no período sem
   mapeamento; havendo, DEVE devolver `impedimentos: string[]` com **todas** e NÃO produzir mapa
   (invariante `I7`).
2. INVARIANTE `I6`: `operacional + investimento + financiamento == saldoCaixa(fim) − saldoCaixa(inicio)`.
   Divergência ⇒ `BusinessRuleError('DFC_NAO_ARTICULA')` com o delta em `details`. O mapa NÃO sai do
   serviço.
3. INVARIANTE `I8`: DFC de um exercício == soma das DFC dos seus períodos, nas três actividades.

### Requisito 13 — UI e exportação

1. `/contabilidade/dfc` (Server Component) com selector de período, reutilizando
   `_components/seletor-periodo.tsx`.
2. `/contabilidade/fluxo-caixa/rubricas` — gestão de rubricas e mapeamento conta→rubrica, sem modais.
3. Route Handler `withApi` em `/api/contabilidade/dfc/export` (CSV e PDF).
4. Permissões `financas:fluxo-caixa:leitura` e `financas:fluxo-caixa:configurar`; exportação reutiliza
   `financas:exportar`.
5. Entradas novas em `AppSidebar.tsx`, `Breadcrumbs.tsx` e `CommandPalette.tsx`.

---

## Requisito 14 — Corrigir a documentação falsa

1. `docs/DOCUMENTACAO.md:93,104` DEVE ser corrigido para descrever o que existe de facto, e as
   referências a Supabase/PostgREST e ao layout pré-monorepo DEVEM ser removidas ou marcadas como
   históricas.
2. A linha 165 («projectar fluxo de caixa» como trabalho futuro) DEVE passar a apontar para este spec.

## Requisito 15 — Não regredir

1. `pnpm check`, `pnpm gates`, `pnpm test:integration` e `pnpm e2e` verdes.
2. Os cinco gates existentes mantêm-se a zero, com atenção particular ao `gate-periodo` (nenhuma
   escrita directa em `Lancamento`/`PartidaLancamento` — a DFC é só leitura) e ao `gate-leitura`.
