# Handoff — Spec 05: Contagem e Reconciliação de Stock

Branch: `ws-05` | Commit: `d1c164e`

## O que foi implementado

### Schema (prisma/schema/)

**`inventario.prisma`** — novos modelos:
- `StatusContagemStock` enum: `RASCUNHO | EM_CONTAGEM | RECONCILIADA | CONCLUIDA | CANCELADA`
- `StatusItemContagem` enum: `PENDENTE | CONTADO | AJUSTADO | JUSTIFICADO`
- `ContagemStock` — sessão de contagem (número via `CONTAGEM_STOCK`, FK localizacao/categoria opcionais)
- `ItemContagemStock` — linha por produto/localização com `saldoSistema` snapshot

**`financas.prisma`** — adicionado `CONTAGEM_STOCK` a `TipoSerieDocumento` (ponto de conflito com spec 04 — merge 04→05 conforme handoff).

### Serviço

`src/server/services/inventario/contagem-stock.service.ts`:
- `abrirContagem`: valida duplicado `EM_CONTAGEM`, faz snapshot `SaldoStock`, gera número via `proximoNumeroSerie(tx, 'CONTAGEM_STOCK', ctx)` em `$transaction`
- `registarContagemItem`: calcula `diferenca = quantidadeContada − saldoSistema` (Decimal)
- `justificar`: status → `JUSTIFICADO`
- `reconciliar`: `$transaction` atómica — `entradaStock`/`baixarStock` por item, grava `movimentoStockId`, lançamento contabilístico opcional (classe 3), valida limiar/aprovação; idempotente (AJUSTADO ignorado)
- `concluir` / `cancelar` / `listar` / `obter`

`src/server/services/inventario/contagem-stock.interface.ts` — DTOs, `TRANSICOES_CONTAGEM`, `IContagemStockService`.

### Validações

`src/lib/validations/inventario-contagem.ts` — `AbrirContagemSchema`, `RegistarItemSchema`, `JustificarItemSchema`, `ReconciliarSchema`, `ConcluirContagemSchema`, `CancelarContagemSchema`, `FilterContagemSchema`.

### Actions

`src/server/actions/inventario.actions.ts` — acrescentadas (no fim):
`abrirContagemAction`, `registarContagemItemAction`, `justificarItemContagemAction`, `reconciliarContagemAction`, `concluirContagemAction`, `cancelarContagemAction`.

### Permissões (prisma/seed/rbac.ts)

Adicionadas permissões `inventario:contagens:{ver,abrir,registar,justificar,reconciliar,concluir,cancelar}`. Os roles existentes (OPERADOR, GESTOR, ADMIN) incluem-nas automaticamente por `startsWith('inventario:')`.

### UI

```
/inventario/contagens/              — lista (SC) com KPIs + FilterBar
/inventario/contagens/nova/         — formulário de abertura (CC: NovaContagemForm)
/inventario/contagens/[id]/         — detalhe com itens inline + acções (CC: ItensTable, ContagemAcoes)
```

Decisão de rota: `/inventario/reconciliacao` existente manteve-se sem alteração (ativos). As contagens de stock têm a sua própria árvore `/inventario/contagens/**`.

### Status Badge

`src/components/patterns/status-badge.tsx` — adicionados: `EM_CONTAGEM` (info), `RECONCILIADA` (warning), `CONTADO` (info), `AJUSTADO` (success), `JUSTIFICADO` (outline fallback, via label).

### State Machines (client-safe)

`src/lib/state-machines.ts` — adicionado `TRANSICOES_CONTAGEM_STOCK`.

### Testes

`src/server/services/inventario/__tests__/contagem-stock.test.ts` (19 testes, 100%):
- Property tests (fast-check): máquina de estados, Σ ajustes == Σ diferenças, idempotência
- Unit tests: diferença positiva/negativa/zero, limiar de discrepância, itens AJUSTADO ignorados

Todos os 37 ficheiros de teste (588 testes) passam.

### Seed

`prisma/seed/inventario.ts` — contagem de demonstração `CNT-SEED-001` com itens de stock simulando discrepância de 10%.

## Ponto de conflito para merge

`prisma/schema/financas.prisma`: spec 04 edita o mesmo ficheiro. A adição de `CONTAGEM_STOCK` é aditiva no enum `TipoSerieDocumento`. Merge order: 04→05 (conforme `execucao-paralela-04-09.md`).

## Gaps / Dívida

1. **Testes de integração real contra Postgres**: não executados porque as tabelas `ContagemStock`/`ItemContagemStock` ainda não existem na DB partilhada (migração gerada pelo orquestrador). Após o merge e `prisma migrate deploy`, o teste de integração pode ser adicionado em `contagem-stock.integration.test.ts`.

2. **UI — resolução de IDs**: as colunas "Produto", "Localização" e "Responsável" mostram o CUID bruto. Após o merge da wave, substituir por um `include` no serviço para devolver `produto.nome`, `localizacao.nome`, etc.

3. **Série CONTAGEM_STOCK**: o seed de demonstração assume que existe uma série activa. O seed de finanças deve criar esta série tal como cria as outras (`REQUISICAO_COMPRA`, etc.).

4. **Aprovação de discrepâncias**: o limiar e `aprovadoPorId` são passados manualmente na UI. Num cenário real, a aprovação poderia ter o seu próprio fluxo (notificação → aprovação → desbloquear reconciliação).
