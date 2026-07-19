# Handoff — Spec 04: Reconciliação Bancária (branch `ws-04`)

## O que foi entregue

**Schema** (`prisma/schema/financas.prisma` — delta mínimo, migração a gerar pelo orquestrador):
- `ItemReconciliacaoBancaria.itemParId String?` (par de matching, auto-relação escalar).
- `@@unique([tenantId, reconciliacaoId, extratoReferencia])` (idempotência de importação).

**Serviço** (`contabilidade.service.ts` + `reconciliacao.helpers.ts`):
- `saldoContabilAte` (agregação de partidas LANCADO; `exclusivo` para saldo de abertura).
- `iniciarReconciliacao` reescrita: saldos contabilísticos reais, bloqueio de 2ª `EM_ANDAMENTO`
  (`RECONCILIACAO_EM_ABERTO`), geração de itens do razão na mesma `$transaction`.
- `gerarItensRazao` (idempotente por `lancamentoId`), `importarExtrato` (dedupe em código +
  `createMany skipDuplicates`), `sugerirMatches` (valor + tipoMovimento + janela de dias, greedy
  determinístico), `marcarItemReconciliado` reescrita (aceita `conciliado: boolean`, par opcional
  `itemParId`, recálculo da diferença em `$transaction`, tudo filtrado por `tenantId`),
  `concluirReconciliacao({id, observacoes?})` (recálculo + `RECONCILIACAO_NAO_BALANCEADA` se
  diferença ≠ 0 sem justificação), `cancelarReconciliacao`, `obterReconciliacao`,
  `listarReconciliacoes`, `obterContaBancaria`; `criarContaBancaria` valida conta PGC folha
  CLASSE_1 e unicidade `[tenantId, banco, numeroConta]`.
- Invariante: `diferencaNaoConciliada = (saldoFinalBanco − saldoFinalContabil) − Σ(sinal·valor
  dos conciliados)`; sinal em `reconciliacao.helpers.ts::sinalItem` (par casado soma zero).
- Máquina de estados `TRANSICOES_RECONCILIACAO` (EM_ANDAMENTO → CONCLUIDA|CANCELADA; terminais).
- Após `CONCLUIDA`/`CANCELADA`: itens e reconciliação imutáveis (`RECONCILIACAO_IMUTAVEL`).

**Validações** (`src/lib/validations/contabilidade.ts`): `IniciarReconciliacaoSchema` com
`dataInicio <= dataFim`; `MarcarItemReconciliadoSchema` (+`itemParId`); `LinhaExtratoSchema`/
`ImportarExtratoSchema` (all-or-nothing, referências únicas); `AutoMatchSchema`;
`ConcluirReconciliacaoSchema`; `FiltroContaBancariaSchema`.

**Actions** (`contabilidade.actions.ts`): `gerarItensRazao`, `importarExtrato`, `sugerirMatches`,
`cancelarReconciliacao` novas; `concluirReconciliacao` com observações; contas bancárias passam a
usar `financas:banca:contas:escrita` (novo no catálogo RBAC, junto de
`financas:banca:contas:leitura` — aditivo em `prisma/seed/rbac.ts`).

**UI (sem modais; `AlertDialog` só em concluir/cancelar):**
- `/contabilidade/reconciliacao` — lista reconciliações (DataTable + StatusBadge).
- `/contabilidade/reconciliacao/nova` — abre e redirecciona para o workspace.
- `/contabilidade/reconciliacao/[id]` — workspace 2 colunas (razão | extracto), KPIs de saldos,
  conciliar selecção/par, auto-match com sugestões aplicáveis, regenerar razão, fecho.
- `/contabilidade/reconciliacao/[id]/importar` — upload/colagem CSV com pré-visualização e
  relatório de erros (`src/lib/extrato-csv.ts`, client-safe).
- `/contabilidade/contas-bancarias` (+`nova`, `[id]/editar`) — CRUD ligado a conta PGC classe 1.
- `status-badge.tsx`: sem alterações — `EM_ANDAMENTO`/`CONCLUIDA`/`CANCELADA` já existiam no mapa único.

**Exportação:** `GET /api/contabilidade/reconciliacao/[id]/export?formato=csv|pdf` via `withApi`
(permissão `financas:leitura`). PDF minimalista gerado sem dependências (não há lib PDF no projecto).

**Testes** (48 novos, todos verdes sem tocar na DB partilhada):
- `reconciliacao.helpers.test.ts` — property tests (fast-check) do invariante de balanceamento,
  reversibilidade conciliar/desconciliar, máquina de estados terminal, validade do auto-match.
- `reconciliacao.service.test.ts` — Prisma mockado: isolamento cross-tenant (NotFound + asserção
  do filtro `tenantId` em todos os `findFirst`), EM_ABERTO, NAO_BALANCEADA, IMUTAVEL,
  idempotência de geração/importação, validações de conta bancária.
- `extrato-csv.test.ts` — parser CSV (formatos de data/decimal, erros por linha, duplicados).

## Verificação
- `pnpm check` verde (prisma validate, tsc, eslint 0 erros, 617 testes) e `pnpm gates` verde.
- `pnpm prisma generate` corrido após o delta de schema.

## Pendências / dívidas
- **Migração**: não gerada (regra do programa) — orquestrador deve gerar `05xx_reconciliacao_bancaria`.
- **Smoke autenticado** (abrir → gerar → importar → auto-match → concluir): por correr pelo
  orquestrador após merge + migração (porta 3000 partilhada durante a wave).
- Auditoria das transições dentro de `$transaction` usa `prismaBase` (sem audit-extension), como
  nos restantes serviços de finanças; `cancelarReconciliacao` usa o client estendido (auditado).
- Convenção de `tipoMovimento` do extracto: perspectiva da empresa (DEBITO = entrada no banco);
  o auto-match casa por tipoMovimento igual.
- PDF é minimalista (texto tabular); se entrar uma lib de PDF no programa, migrar.
