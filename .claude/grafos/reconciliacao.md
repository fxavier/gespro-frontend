# Grafo — ADR-0038 · Reconciliação bancária automática

- **ADR**: `docs/decisions/ADR-0038-reconciliacao-bancaria-automatica.md`
- **Requisito**: RF-XXX (Reconciliação Bancária Automática)

```
        modelo ──┬── matching ──┐
                 ├── import ────┼── reconciliation ── ui
                 └──────────────┘
```

| Nó | Estado | Depende de |
|---|---|---|
| `modelo` | **FEITO** | — |
| `matching` | por fazer | modelo |
| `import` | em curso (ver `src/server/services/reconciliacao/importacao.service.ts`) | modelo |
| `reconciliation` | por fazer | matching, import |
| `ui` | por fazer | reconciliation |

## Leitura obrigatória antes de qualquer nó

- `docs/decisions/ADR-0038-reconciliacao-bancaria-automatica.md`
- `apps/erp/prisma/schema/reconciliacao.prisma`
- `apps/erp/src/server/services/reconciliacao/reconciliacao.model.ts`

## Âmbito por nó

### `matching`

- Motor em passagens, na ordem do enum `RegraCorrespondencia`: `REFERENCIA_EXACTA` →
  `REFERENCIA_NORMALIZADA` → `DOCUMENTO` → `VALOR_NATUREZA_DATA` → `VALOR_TOLERANCIA` →
  `DESCRICAO`. A ordem de declaração **é** a prioridade da RF §6.
- Recuperação de candidatos **por índice**, em SQL/Prisma, usando a blocking key
  `[tenantId, contaBancariaId, estado, natureza, valor, data*]` e o índice de
  `referenciaNormalizada`. Carregar tudo para memória e fazer produto cartesiano viola a RF §19
  e é motivo para rejeitar a implementação.
- Classificação de estados por `classificarSemCorrespondencia` (RF §8, §9, §22).
- Confirmação automática só acima de `ContaBancaria.limiarConfianca` **e** com `autoReconciliacao`.
- Escrita de `correspondenciaAtivaId` na mesma `$transaction`, com verificação prévia de que
  ambos os lados estão livres (RF §14).
- **Não** implementes agregação N:1/1:N. Deixa o caminho aberto e regista no handoff.

### `import`

- Interface `ParserExtrato` com implementações CSV e XLSX. O parsing passa para o **servidor**:
  `src/lib/extrato-csv.ts` é client-side e não escala para XLSX nem MT940.
- `ImportacaoExtracto` com `hashFicheiro` (SHA-256 do conteúdo bruto) — primeira camada de
  idempotência; `chaveIdempotenciaBanco` por linha — segunda camada (RF §19, CA08).
- Projecção `PartidaLancamento` → `MovimentoContabilistico`, idempotente por
  `@@unique([tenantId, partidaId])`, **sem** filtro por janela de datas do período: é
  precisamente esse filtro que partia o CA04 no modelo antigo.
- Política all-or-nothing no parsing, com relatório de erro por linha.

### `reconciliation`

- `PeriodoReconciliacao`: abertura, invariante de não-sobreposição e de um só período aberto por
  conta (na transacção, não no esquema), fecho com máquina de estados.
- Mapa de fecho da RF §17 e saldo reconciliado da RF §16 via `calcularSaldoReconciliado`. O fecho
  só passa a `RECONCILIADO` com diferença residual zero ou justificação explícita.
- Auditoria: acrescenta os modelos novos a `AUDIT_MODELS`/`CRITICAL_ENTITIES` em
  `src/server/db/audit-extension.ts` e **usa o cliente estendido**, não `prismaBase`.
- Sugestão de lançamento contabilístico para `BANCO_SEM_CONTABILIZACAO` (RF §9).
- RBAC: corrige a assimetria da exportação, que hoje usa `financas:leitura`, mais lata do que a
  permissão de reconciliar.
- **Só neste nó** se faz o `DROP` de `ReconciliacaoBancaria` e `ItemReconciliacaoBancaria`.

### `ui`

- Workspace organizado **por estado**, não por duas colunas: o utilizador só deve olhar para as
  excepções. É o objectivo declarado da RF §23.
- Confirmação em lote das sugestões, com a regra e a confiança visíveis.
- Reconciliação manual com **justificação obrigatória** (RF §13) — hoje é opcional.
- Mapa de fecho e exportação; substituição do `matching-board.tsx`.
