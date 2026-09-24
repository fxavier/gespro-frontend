# Grafo — ADR-0039 · Nota de débito em contabilidade e finanças

- **ADR**: `docs/decisions/ADR-0039-nota-debito-contabilidade.md`

```
        modelo ──┬── contabilizacao ──┐
                 ├── fornecedor ──────┼── documento ── ui
                 └────────────────────┘
```

| Nó | Estado | Depende de |
|---|---|---|
| `modelo` | FEITO ([handoff](../../docs/handoff/nota-debito-modelo.md)) | — |
| `contabilizacao` | por fazer | modelo |
| `fornecedor` | por fazer | modelo |
| `documento` | por fazer | contabilizacao, fornecedor |
| `ui` | por fazer | documento |

## Leitura obrigatória antes de qualquer nó

- `docs/decisions/ADR-0039-nota-debito-contabilidade.md`
- `apps/erp/prisma/schema/financas.prisma` — `NotaDebito` (740), `LinhaNotaDebito` (772)
- `apps/erp/prisma/schema/compras.prisma` — `ContaPagar` (~736-782)
- `apps/erp/src/server/services/financas/faturacao.service.ts` — `PGC_FATURACAO` (124),
  `construirLancamentoNotaDebito` (228), `emitirNotaDebito` (757), `cancelarNotaDebito` (886)

**A ND de cliente já existe e funciona.** Isto não é uma funcionalidade nova — são quatro buracos
num ciclo quase fechado. Não reescrevas o que está feito.

## Âmbito por nó

### `modelo`

- Enum `NaturezaNotaDebito` (`ACERTO_PRECO` | `JUROS_MORA` | `DESPESAS_REPERCUTIDAS` |
  `PENALIZACAO` | `OUTRO`) e coluna `natureza` em `NotaDebito`, com omissão `ACERTO_PRECO` —
  é o comportamento actual, e as ND já emitidas continuam correctas.
- `motivoCancelamento String?` em `NotaDebito` e `NotaCredito`: hoje o motivo é escrito por cima
  de `observacoes` e destrói o que lá estava.
- `motivoIsencao String?` nas linhas de ND, NC e factura, obrigatório quando `taxaIva = 0`.
- Em `ContaPagar`: `tipoDocumento TipoDocumentoContaPagar @default(FACTURA)`,
  `contaPagarOrigemId String?` (FK escalar), `motivo String?`.
- Mapeamento natureza → conta PGC **configurável por tenant**, com valores por omissão no
  provisionamento. Aplica a skill `estado-com-escritor`: a coluna é lida por um predicado de
  decisão, por isso tem de ter escritor em produção e teste da transição.
- Migração é do orquestrador (CLAUDE.md §Migrations), não deste nó.

### `contabilizacao`

- `construirLancamentoNotaDebito` passa a escolher a conta de crédito pela natureza. Mantém-se
  função pura e testada sem DB, com o invariante `Σdébitos = Σcréditos = total`.
- `cancelarNotaDebito` e `cancelarNotaCredito` passam a correr em `$transaction` e a gerar o
  lançamento de estorno antes de mudar o estado. **A NC entra por ser o mesmo defeito na função
  ao lado** — não a deixes para trás.
- Cancelamento recusado se o período do lançamento original estiver fechado (ADR-0033).
- Teste obrigatório: emissão + estorno somam zero no razão **e** no apuramento de IVA.
- Confirma o código PGC dos juros obtidos contra o plano semeado em `prisma/seed/` antes de o
  fixar — o ADR diz `78x` como enquadramento habitual, não como certeza.

### `fornecedor`

- A ND de fornecedor é uma **nova `ContaPagar` ligada à original** por `contaPagarOrigemId`.
  Não crias modelo novo, e **não tocas** na conta a pagar original.
- **Não consome série de documento**: o número é do fornecedor e vai para `numeroDocumento`,
  como em qualquer factura recebida. O `numero` interno vem da série `CONTA_PAGAR` existente.
- `tipoAquisicao` herda da conta a pagar original por omissão e é editável. Não escrevas código
  no apuramento de IVA: `apuramento-iva.service.ts:679-694` já lê `ContaPagar` por
  `tipoAquisicao` e apanha a ND sozinho — confirma com teste, não com alterações.
- Sem `numeroDocumento` + `nuitFornecedor` não há dedução (`DOCUMENTO_FORNECEDOR_INCOMPLETO`);
  a ND segue a mesma regra.
- Revê **todas** as listagens e agregações que contam `ContaPagar`: uma listagem de facturas de
  fornecedor passa a precisar de `tipoDocumento = FACTURA`. É a consequência negativa assumida
  no ADR e é neste nó que se paga.

### `documento`

- Modelo de PDF da ND seguindo `src/lib/documents/fatura-model.ts`, para cliente e fornecedor.
- Exportação CSV/PDF por Route Handler (`withApi`), nunca Server Action, com rate limit.
- Trilho de auditoria das transições de ND e NC via `audit-extension`.

### `ui`

- `/vendas/notas-debito/[id]` — detalhe, que hoje não existe (nem para NC).
- Emissão com selector de natureza e modo de **valor único** para ND autónoma: hoje o formulário
  impõe a grelha de produto, que não serve para juros nem penalizações.
- Campo de motivo de isenção visível quando a taxa é zero.
- `/compras/notas-debito` — registo e lista das ND de fornecedor.
- Vista da ND no módulo de contabilidade, com ligação ao lançamento.
- Skill `ui-conventions`: sem modais (`AlertDialog` só em acção destrutiva ou terminal), Server
  Components por omissão, pt-PT.
