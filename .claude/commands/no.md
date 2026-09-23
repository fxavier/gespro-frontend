---
description: Executa um nó do grafo do ADR-0038 (reconciliação bancária) com o loop de engenharia completo
argument-hint: matching | import | reconciliation | ui
---

# Nó do grafo — ADR-0038

Nó pedido: **$ARGUMENTS**

Se `$ARGUMENTS` estiver vazio ou não for um de `matching`, `import`, `reconciliation`, `ui`,
não executes nada: lista os nós válidos, diz quais já estão feitos e pára.

## Grafo de dependências

```
        Model ──┬── Matching ──┐
                ├── Import ────┼── Reconciliation ── UI
                └──────────────┘
```

**NODE 1 (MODEL) está FEITO.** Lê estes três antes de qualquer outra coisa, sempre, seja qual
for o nó pedido:

- `docs/decisions/ADR-0038-reconciliacao-bancaria-automatica.md` — a decisão e o plano
- `apps/erp/prisma/schema/reconciliacao.prisma` — os sete modelos
- `apps/erp/src/server/services/reconciliacao/reconciliacao.model.ts` — o núcleo puro

Lê também o handoff do nó anterior em `docs/handoff/adr-0038-*.md`, se existir.

**Antes de arrancar, verifica as dependências do nó pedido** (tabela em baixo). Se um nó de
que este depende não tiver handoff, diz isso e pára — não o implementes de passagem.

**O âmbito é SÓ o nó pedido.** Não abras os nós seguintes, mesmo que pareçam triviais ou
necessários para testar. O que faltar regista-se no handoff.

## Loop — uma fase de cada vez, com critério de saída explícito

| Fase | O que fazes | Critério de saída |
|---|---|---|
| **INSPECT** | Lê o ADR, o RF-XXX nas secções do nó, o código existente e o que ele já faz mal | Lista escrita do que existe, do que falta e dos índices/estruturas disponíveis |
| **PLAN** | Desenho da solução. **Sem escrever código** | Plano com ficheiros a criar/alterar e a assinatura de cada função |
| **IMPLEMENT** | Código | Compila |
| **TEST** | Testes primeiro onde houver invariante declarado (skill `tdd`). Property tests para regras puras, Prisma mockado para serviços | Testes verdes |
| **REVIEW** | Skill `revisao-dois-eixos`, **em subagente novo, sem o contexto de quem implementou**. Eixo 1: convenções (`prisma-conventions`, `api-conventions`, `ui-conventions`). Eixo 2: fidelidade ao RF-XXX | Lista de achados — ou «nenhum». Não inventes achados para parecer diligente |
| **FIX** | Corrige o que a revisão apanhou | Cada achado fechado ou justificado por escrito |
| **VERIFY** | `pnpm check && pnpm gates` **da raiz** | Ambos verdes |
| **DONE** | Handoff em `docs/handoff/adr-0038-<nó>.md` | O que entregaste, o que ficou por fazer, o que o nó seguinte assume |

Não avances de fase sem o critério de saída cumprido. Se VERIFY falhar, volta a FIX; ao fim de
**3 voltas** sem verde, PÁRA e explica o que está a bloquear em vez de tentar uma quarta.

Diz-me o resultado de INSPECT antes de passar a PLAN.

## Âmbito por nó

### `matching` — depende de: Model

- Motor em passagens, na ordem do enum `RegraCorrespondencia`: `REFERENCIA_EXACTA` →
  `REFERENCIA_NORMALIZADA` → `DOCUMENTO` → `VALOR_NATUREZA_DATA` → `VALOR_TOLERANCIA` →
  `DESCRICAO`. A ordem de declaração **é** a prioridade da RF §6.
- Recuperação de candidatos **por índice**, em SQL/Prisma, usando a blocking key
  `[tenantId, contaBancariaId, estado, natureza, valor, data*]` e o índice de
  `referenciaNormalizada`. Carregar tudo para memória e fazer produto cartesiano viola a
  RF §19 e é motivo para rejeitar a implementação.
- Classificação de estados por `classificarSemCorrespondencia` (RF §8, §9, §22).
- Confirmação automática só acima de `ContaBancaria.limiarConfianca` **e** com
  `autoReconciliacao` ligada.
- Escrita de `correspondenciaAtivaId` dentro da mesma `$transaction`, com verificação prévia
  de que ambos os lados estão livres (RF §14).
- **Não** implementes agregação N:1/1:N. Deixa o caminho aberto e regista no handoff.
- RF relevante: §6, §7, §8, §9, §10, §14, §19.

### `import` — depende de: Model

- Interface `ParserExtrato` com implementações CSV e XLSX. O parsing passa para o **servidor**:
  `src/lib/extrato-csv.ts` é client-side e não escala para XLSX nem MT940.
- `ImportacaoExtracto` com `hashFicheiro` (SHA-256 do conteúdo bruto) — primeira camada de
  idempotência; `chaveIdempotenciaBanco` por linha — segunda camada. Reimportar um extracto
  sobreposto não pode duplicar nada (RF §19, CA08).
- Projecção `PartidaLancamento` → `MovimentoContabilistico`, idempotente por
  `@@unique([tenantId, partidaId])`, **sem** filtro por janela de datas do período: é
  precisamente esse filtro que partia o CA04 no modelo antigo.
- Política all-or-nothing no parsing, com relatório de erro por linha.
- RF relevante: §4, §5, §19.

### `reconciliation` — depende de: Matching, Import

- `PeriodoReconciliacao`: abertura, invariante de não-sobreposição e de um só período aberto
  por conta (verificado na transacção, não no esquema), fecho com máquina de estados.
- Mapa de fecho da RF §17 e saldo reconciliado da RF §16 via `calcularSaldoReconciliado`.
  O fecho só passa a `RECONCILIADO` com diferença residual zero ou justificação explícita.
- Auditoria: acrescenta os modelos novos a `AUDIT_MODELS`/`CRITICAL_ENTITIES` em
  `src/server/db/audit-extension.ts` e **usa o cliente estendido**, não `prismaBase`. Hoje as
  transições de finanças correm sem auditoria — é a dívida que este nó fecha (RF §18).
- Sugestão de lançamento contabilístico para `BANCO_SEM_CONTABILIZACAO` (RF §9).
- RBAC: `financas:banca:reconciliacao` nas mutações; corrige a assimetria da exportação, que
  hoje usa `financas:leitura`, mais lata do que a permissão de reconciliar.
- **Só neste nó** se faz o `DROP` de `ReconciliacaoBancaria` e `ItemReconciliacaoBancaria`,
  numa migração única, depois de o substituto funcionar.
- RF relevante: §16, §17, §18, §19.

### `ui` — depende de: Reconciliation

- Workspace organizado **por estado**, não por duas colunas: o utilizador só deve olhar para
  as excepções (`BANCO_SEM_CONTABILIZACAO`, `CONTABILIDADE_SEM_BANCO`, `DIFERENCA_VALOR`,
  `DIVERGENCIA`). É o objectivo declarado da RF §23.
- Confirmação em lote das sugestões do motor, com a regra e a confiança visíveis.
- Reconciliação manual com **justificação obrigatória** (RF §13) — hoje é opcional.
- Mapa de fecho e exportação; substituição do `matching-board.tsx`.
- Skill `ui-conventions`: sem modais (`AlertDialog` só em acção destrutiva ou terminal),
  Server Components por omissão, tokens de `packages/brand`, pt-PT.
- RF relevante: §13, §17, §23.

## Armadilhas deste repositório

- O ERP está em `apps/erp/`. As 30 worktrees em `wt/` são **pré-monorepo**: usa `git grep`/`rg`,
  nunca `grep -r`/`find` da raiz, ou editas ficheiros fantasma que nunca chegam ao produto.
- **Não corras `prisma migrate dev`** — exige TTY e rebenta em ambiente não-interactivo. Se
  precisares de migração, usa o `migrate diff` não-interactivo documentado no `CLAUDE.md`.
- Depois de `prisma generate`, reinicia o `pnpm dev` (`touch apps/erp/next.config.ts`).
- Toda a query filtra por `tenantId`; cross-tenant devolve `NotFoundError` (404), nunca 403.
- Dinheiro em `Prisma.Decimal`, nunca `number`. Valores sempre positivos; o sinal vive em
  `natureza` (DEBITO = entrada, perspectiva da empresa).
- `pnpm check` não apanha erros de runtime RSC nem formulários que se recusam a submeter.
  Se o nó tocar em UI, faz também smoke autenticado ou `pnpm e2e`.
