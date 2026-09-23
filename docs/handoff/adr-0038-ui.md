# Handoff — ADR-0038, nó UI (último nó do grafo)

- **Data**: 2026-09-23
- **Depende de**: RECONCILIATION ([handoff](./adr-0038-reconciliation.md))
- **Spec**: [RF-XXX §9, §13, §17, §23](../../.kiro/specs/23-reconciliacao-bancaria-automatica/requirements.md) · [ADR-0038](../decisions/ADR-0038-reconciliacao-bancaria-automatica.md)

## Decisões do utilizador neste nó

- **U1 (a)**: rotas **por conta bancária**, na mesma URL (`/contabilidade/reconciliacao`); o menu e
  os breadcrumbs ficam como estavam.
- **U2 (a)**: `/contabilidade/lancamentos/novo` aceita pré-preenchimento por `searchParams`, para a
  sugestão de lançamento do RF §9.
- **U3 (a)**: o CRUD das regras de sugestão fica **adiado**; existe só a regra por omissão do seed.
- **U4 (a)**: spec Playwright nova.
- **D1** (herdada do RECONCILIATION): o `DROP` do modelo antigo faz-se **aqui**, com o ecrã novo já a
  funcionar.

## O que foi entregue

### Ecrã (`src/app/(dashboard)/contabilidade/reconciliacao/**`)

| Rota | O quê |
|---|---|
| `/` | Uma linha por conta activa: excepções, sugestões, em trânsito e período em curso. Assinala as contas com **conta PGC partilhada** |
| `/[contaId]` | Workspace **por estado** (RF §23), em `?vista=`. Abre em **Excepções**; as outras vistas são Sugestões, Em trânsito e pendentes, Reconciliados e Ignorados. KPIs no topo e aviso quando a conta PGC é partilhada (a execução fica desactivada) |
| `/[contaId]/importar` | Upload CSV/XLSX; mostra **todos** os erros por linha; depois de importar corre o motor (CA04) |
| `/[contaId]/manual?b=…&c=…` | Reconciliação manual: os movimentos escolhidos, os totais, a diferença e a **justificação obrigatória** (RF §13, CA07) |
| `/[contaId]/periodos` | Histórico de períodos |
| `/[contaId]/periodos/novo` | Abrir período; sugere o dia seguinte ao último fechado |
| `/[contaId]/periodos/[periodoId]` | Mapa de fecho (RF §17): **gravado** se fechado, calculado agora se em curso. Fechar (confirmação; justificação obrigatória se o residual ≠ 0), cancelar e exportar CSV/XLSX |

**Acções por vista:**
- **Excepções**: escolher movimentos dos dois lados, reconciliar manualmente, ignorar. Numa linha
  `BANCO_SEM_CONTABILIZACAO`, **Contabilizar** pede a sugestão de lançamento e abre
  `lancamentos/novo` já preenchido.
- **Sugestões**: confirmação em lote, com **regra e confiança visíveis**; a justificação aparece
  quando alguma escolhida tem diferença acima da tolerância. Rejeitar tem confirmação.
- **Reconciliados**: reverter, com confirmação.
- **Ignorados**: reactivar.

Só há `AlertDialog` em confirmações (rejeitar, reverter, fechar, cancelar); tudo o que recolhe dados
é rota ou campo inline.

### Suporte

- `src/server/services/reconciliacao/consulta.service.ts`: leituras do ecrã (contas com contagens
  por estado, movimentos por vista com paginação por cursor, sugestões, períodos, movimentos
  escolhidos, `obterFechoPeriodo`), com teste.
- `src/app/api/reconciliacao/periodos/[id]/export/route.ts`: `withApi` +
  `financas:banca:reconciliacao` + `exportLimiter`; lê o mesmo mapa que a página.
- `StatusBadge`: os 8 estados novos no mapa único.
- `lancamentos/novo`: pré-preenchimento `?data=aaaa-mm-dd&historico=…&p=contaId:TIPO:valor`,
  validado (data, tipo, montante com até 2 casas, pelo menos 2 partidas). Junta às opções as contas
  sugeridas que não estejam entre as 200 carregadas. O utilizador revê e grava.
- `e2e/15-reconciliacao.spec.ts`: lista (conta partilhada assinalada); importar → excepções →
  sugestão de lançamento pré-preenchida; período → mapa → justificação exigida → exportação.
  Idempotente na base demo: o extracto é sempre o mesmo, e da segunda vez dá `JA_IMPORTADO` (CA08);
  o período nunca se fecha; o lançamento não se grava.

### DROP do modelo antigo (D1)

- **Migração `*_0038_drop_reconciliacao_antiga`**: larga `ItemReconciliacaoBancaria`,
  `ReconciliacaoBancaria` e o enum `StatusReconciliacao`. As tabelas tinham **0 linhas** na base
  local. O `migrate diff` seguinte devolve *empty migration*.
- **Código removido**:
  - as 8 páginas antigas e o `matching-board`;
  - as 8 actions antigas de `contabilidade.actions.ts`;
  - as 9 funções do `contabilidade.service.ts` e as suas assinaturas e tipos no `.interface.ts`;
  - `reconciliacao.helpers.ts` e o seu teste; `financas/__tests__/reconciliacao.service.test.ts`;
  - `src/lib/extrato-csv.ts` e o seu teste;
  - as validações e os tipos antigos;
  - a exportação antiga.
- **Fica** o `saldoContabilAte`, que não é da reconciliação: a projecção e os seus testes usam-no.
- **Consumidores migrados**:
  - `analytics.service`: o rácio passa a contar `MovimentoBancario` reconciliados sobre o total;
  - `fecharPeriodo` (ADR-0033): a pré-condição 3 passa a usar só `PeriodoReconciliacao`;
  - `system-modules`.
- **Testes de outros nós adaptados por causa do DROP**:
  - `periodo-contabil.test.ts`: sai o mock do modelo antigo; as asserções são as mesmas;
  - `analytics.service.test.ts`: muda a fonte, e a asserção do filtro ficou **mais forte**
    (`estado in [...]` em vez de `conciliado: true`).

  A revisão confirmou que nada foi enfraquecido.

## Loop

| Fase | Resultado |
|---|---|
| INSPECT | Faltavam serviços de leitura; 8 estados fora do `StatusBadge`; o ecrã antigo quebrava duas regras invioláveis (`toLocaleDateString` e `Number()` sobre dinheiro). Quatro decisões pedidas (U1–U4) |
| TEST | 9 testes novos (consulta) + a spec E2E. Durante o smoke: um seletor ambíguo no E2E (corrigido) e **zero** erros ou avisos de consola nas 11 páginas, verificados à parte |
| REVIEW | Subagente `code-reviewer`, sem o contexto do autor: 0 BLOCKER, 0 MAJOR, 5 NIT, «APROVAR COM NITS». O revisor repetiu `check`, `gates`, E2E e `migrate diff` |
| FIX | Os 5 NIT: colunas sem `useMemo`/`eslint-disable`; guarda de 2 casas no pré-preenchimento; ramo `else` na spec (sem residual, afirma «Reconciliação OK»); cast opaco tipado; vista renomeada «Em trânsito e pendentes» |
| VERIFY | `pnpm check` verde (1709; menos 39 do que antes, os testes do modelo antigo, mais 9 novos); `pnpm gates` verde; `pnpm --filter erp build` verde; E2E 4/4 |

**Um vermelho alheio**: `e2e/12-lancamentos.spec.ts:38` precisa de um lançamento `ESTORNADO`, e a
base reposta a 2026-09-23 (por pedido, para a golden da spec 22) não tem nenhum. É de dados, não de
código; o outro teste do mesmo ficheiro passa.

## O que ficou por fazer

- **CRUD das regras de sugestão** (U3): só existe a regra por omissão do seed. Quando entrar, é uma
  lista com `novo` e `[id]/editar` sob `/contabilidade/reconciliacao/regras`, com as actions e a
  permissão de reconciliar.
- **Sugestões, manual e reverter no browser**: o E2E cobre excepções, importação, sugestão de
  lançamento e período. Os fluxos de sugestões e de reconciliação manual estão cobertos pelos testes
  de serviço, mas não no browser, porque **no tenant demo só o Standard Bank reconcilia** e a conta
  PGC 123 não tem partidas. Criar uma partida lá mexeria na golden da spec 22. Separar o BCI e o
  Millennium em subcontas PGC no seed resolve as duas coisas de uma vez, re-derivando a golden.
- **Auditoria em lote** e **escrita das críticas fora da transacção** (`audit-extension`): dívida
  transversal, registada no handoff do RECONCILIATION.
- **ADR-0038 continua `Proposto`**: marcá-lo `Aceite` é um acto humano (ADR-0023). Convém também
  corrigir o exemplo de sinal da RF §16, que o ADR já assinala.
- **Agregação N:1/1:N automática** (MATCHING): o modelo e a reconciliação manual já a suportam; o
  motor não a propõe.

## Estado do grafo

```
        Model ──┬── Matching ──┐
                ├── Import ────┼── Reconciliation ── UI      ← todos FEITOS
                └──────────────┘
```

Handoffs: [model](./adr-0038-model.md) · [matching](./adr-0038-matching.md) ·
[import](./adr-0038-import.md) · [reconciliation](./adr-0038-reconciliation.md) · este.
