# Issue #137 — editar e anular lançamentos em rascunho (spec)

## Decisões (entrevista de 2026-09-27)
| # | Tema | Decisão |
|---|---|---|
| D1 | Eliminar | Novo estado `ANULADO` (RASCUNHO → ANULADO). A linha fica, com número; sem hard delete. |
| D2 | Editar | Tudo menos diário e período: histórico, observações, partidas e data **dentro do mesmo período** (e ABERTO). O número nunca muda. |
| D3 | Motivo | Anular exige motivo (3–500), em coluna `motivoAnulacao`, por rota própria `/[id]/anular` (formulário, não AlertDialog — regra da casa). |
| D4 | Quem | Qualquer utilizador com `financas:lancamentos:escrita` (permissão já existente, «Criar e editar lançamentos»). |
| D5 | Auditoria | `Lancamento` e `PartidaLancamento` entram em `AUDIT_MODELS`; editar/anular escrevem pelo cliente estendido, com escritas singulares. Criar e automáticos continuam por `prismaBase` — dívida registada. |
| D6 | Lista | Anulados escondidos por omissão; visíveis pelo filtro de estado. |

Pedido original: a opção «Modal de confirmação de eliminação» dá lugar à rota `/anular` (D3).

## Invariantes
- I1 Só `RASCUNHO` se edita ou anula: `LANCADO`/`ESTORNADO`/`ANULADO` → `BusinessRuleError('LANCAMENTO_NAO_RASCUNHO')`, lido **sob tranca** (`SELECT … FOR UPDATE` na linha do lançamento) dentro da transacção.
- I2 Débito = crédito após edição (`PARTIDAS_DESEQUILIBRADAS`), contas folha do tenant (`CONTA_NAO_ACEITA_LANCAMENTO`), como no criar.
- I3 Data nova no mesmo período do lançamento (`resolverPeriodo(data).id === lancamento.periodoId`), senão `LANCAMENTO_MUDA_PERIODO`; período `ABERTO` (`FOR SHARE`), senão `PERIODO_FECHADO`. Aplica-se também a anular (não se mexe num período fechado).
- I4 Numeração intacta: `numero`, `diarioId`, `periodoId`, `periodoFiscal` nunca mudam; anulados continuam a contar para `proximoNumeroLancamento`.
- I5 `ANULADO` fora de tudo o que tem efeito: `FILTRO_LANCAMENTO_MAPA` (lista explícita LANCADO+ESTORNADO) não muda; `fecharPeriodo` só conta `RASCUNHO`.
- I6 Multi-tenant: tudo por `tenantId` do ctx; lançamento de outro tenant → `NotFoundError`.

## Contratos
- Schema: `enum StatusLancamento { … ANULADO }`, `Lancamento.motivoAnulacao String?`. Migração aditiva (`ALTER TYPE … ADD VALUE`, `ADD COLUMN`).
- `TRANSICOES_LANCAMENTO.RASCUNHO = ['LANCADO', 'ANULADO']`, `ANULADO: []`. `StatusLancamentoEnum` inclui `ANULADO`.
- `src/lib/validations/contabilidade.ts`:
  - `EditarLancamentoSchema = CriarLancamentoSchema` sem `diarioId`/`origem`/`documentoOrigem*`, mais `id: idEntidade()`;
  - `AnularLancamentoSchema = { id: idEntidade(), motivo: string trim 3..500 }`.
- `contabilidade.service.ts`:
  - `editarLancamentoRascunho(input, ctx): Promise<LancamentoComPartidas>` — substitui as partidas (delete singular de cada uma + create singular), actualiza cabeçalho; tudo em `prisma.$transaction` (estendido);
  - `anularLancamentoRascunho(input, ctx): Promise<Lancamento>` — `update` singular para `ANULADO` + `motivoAnulacao`.
- Actions `editarLancamento`, `anularLancamento` em `contabilidade.actions.ts`, permissão `financas:lancamentos:escrita`.
- `listarLancamentos`: sem filtro de estado exclui `ANULADO`; com `status: 'ANULADO'` mostra-os.

## UI
- Detalhe `/contabilidade/lancamentos/[id]` e menu da lista: «Editar» e «Anular» só em RASCUNHO **e** com `financas:lancamentos:escrita`.
- `/contabilidade/lancamentos/[id]/editar`: o formulário do novo, pré-preenchido; diário só leitura; data limitada ao mês do período.
- `/contabilidade/lancamentos/[id]/anular`: motivo obrigatório; volta ao detalhe.
- StatusBadge: `ANULADO` → «Anulado» (destrutivo). Filtro de estado ganha «Anulado».
- Textos: o «corrija-o à vontade» de `[id]/estornar/page.tsx` passa a ligar a Editar/Anular.
- Detalhe de um anulado mostra o motivo.
