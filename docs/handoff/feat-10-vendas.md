# Handoff — Feat 10: Vendas — Encomendas, Devoluções, Trocas, Vendedores

**Branch**: `ws-10`  
**Worktree**: `wt/feat-vendas-encomendas`  
**Data**: 2026-07-20  
**Estado**: implementação completa, `pnpm check` + `pnpm gates` verdes

---

## Resumo do que foi feito

### Prisma Schema (`prisma/schema/comercial.prisma`)

Adicionados 6 modelos e 4 enums **no fim do ficheiro**, sem tocar nos modelos existentes:

| Modelo | Chave | Notas |
|--------|-------|-------|
| `Vendedor` | `id`, `tenantId`, `nome`, `status` | soft-delete via `deletedAt`; `metaMensal Decimal @db.Decimal(18,2)` |
| `Encomenda` | `numero` (série ENCOMENDA), `status`, `clienteId` (scalar), `vendaId` (scalar) | sem `@relation` cross-domain |
| `ItemEncomenda` | FK `encomendaId` (dentro do domínio) | `precoUnitario/desconto/ivaItem/total Decimal` |
| `Devolucao` | `numero` (série NOTA_DEVOLUCAO), `status`, `motivo`, `valorTotal Decimal` | `notaCreditoId` scalar (ligação à NC) |
| `ItemDevolucao` | FK `devolucaoId` | mesmos campos Decimal |
| `Troca` | `devolucaoId`, `vendaSubstituicaoId` (scalares), `diferenca Decimal` | append-only |

Enums adicionados: `StatusEncomenda`, `StatusDevolucao`, `MotivoDevolucao`, `StatusVendedor`

### `prisma/schema/financas.prisma`

Adicionados 2 valores ao enum `TipoSerieDocumento` (bloco aditivo marcado WS-10, sem reordenação):
- `ENCOMENDA`
- `NOTA_DEVOLUCAO`

### `src/server/services/financas/faturacao.interface.ts`

Adicionados `| 'ENCOMENDA' | 'NOTA_DEVOLUCAO'` à union `TipoSerieDocumento`.

### `src/lib/state-machines.ts`

Adicionadas máquinas de estado (client-safe):
- `TRANSICOES_ENCOMENDA` — 5 estados; terminais: `CONCLUIDA`, `CANCELADA`
- `TRANSICOES_DEVOLUCAO` — 4 estados; terminais: `PROCESSADA`, `REJEITADA`

### Serviços (`src/server/services/comercial/`)

| Ficheiro | Classe | Dependências injectadas |
|----------|--------|------------------------|
| `vendedor.service.ts` | `VendedorService` | nenhuma (CRUD directo) |
| `encomenda.service.ts` | `EncomendaService` | `IStockService` |
| `devolucao.service.ts` | `DevolucaoService` | `IStockService`, `IFaturacaoService`, `ICaixaService` |
| `troca.service.ts` | `TrocaService` | `IStockService`, `ICaixaService` |

**Funções de contrato usadas** (dentro de `prismaBase.$transaction`):
- A/inventário: `reservarStock`, `libertarStock`, `confirmarConsumoStock`, `entradaStock`, `baixarStock`
- D/finanças: `proximoNumeroSerie`, `registarMovimentoCaixa`, `emitirNotaCredito` (tx própria — chamada antes do $tx)

**Decisão de design — `processar` da devolução**:
`emitirNotaCredito` inicia a sua própria `$transaction` e não aceita `tx`. Solução: NC emitida primeiro (tx própria), depois `prismaBase.$transaction` para stock + caixa + status=PROCESSADA. Se a NC falhar, a devolução fica APROVADA e pode ser re-tentada. Se o $tx falhar após a NC, a NC foi emitida mas a devolução fica APROVADA — ao re-tentar é emitida uma nova NC (design append-only aceite).

### Validações (`src/lib/validations/vendas.ts`)

Schemas adicionados (additive, fim do ficheiro):
- `CreateVendedorSchema`, `UpdateVendedorSchema`, `FilterVendedorSchema`
- `CreateEncomendaSchema`, `UpdateEncomendaSchema`, `FilterEncomendaSchema`, `TransitarEncomendaSchema`, `ConverterEncomendaEmVendaSchema`
- `CreateDevolucaoSchema`, `FilterDevolucaoSchema`
- `CreateTrocaSchema`

### Server Actions (`src/server/actions/vendas.actions.ts`)

Actions adicionadas (additive):
- Encomenda: `criarEncomenda`, `atualizarEncomenda`, `transitarEncomenda`, `converterEncomendaEmVenda`, `cancelarEncomenda`
- Devolução: `criarDevolucao`, `aprovarDevolucao`, `processarDevolucao`, `rejeitarDevolucao`
- Troca: `criarTroca`
- Vendedor: `criarVendedor`, `atualizarVendedor`, `excluirVendedor`

### Permissões (`prisma/seed/rbac.ts`)

Bloco aditivo após permissões de vendas existentes:
- `vendas:encomendas:{ver,criar,editar,confirmar,converter,cancelar}`
- `vendas:devolucoes:{ver,criar,aprovar,processar,rejeitar}`
- `vendas:trocas:{ver,criar}`
- `vendas:vendedores:{ver,criar,editar,excluir}`

### StatusBadge (`src/components/patterns/status-badge.tsx`)

Variantes adicionadas ao `STATUS_MAP` global:
- `PARCIALMENTE_ENTREGUE: 'warning'`
- `PROCESSADA: 'success'`

Labels adicionadas: `PARCIALMENTE_ENTREGUE`, `PROCESSADA`, `DEFEITO`, `PRODUTO_ERRADO`, `INSATISFACAO`, `EXCESSO_PEDIDO`, `AVARIA_TRANSPORTE`, `OUTRO`

### UI Pages

Padrão seguido: golden standard `compras/requisicoes/**` — SC listagem + `_components/` para client parts + `[id]/` detalhe + `novo/` form.

| Rota | Tipo | Descrição |
|------|------|-----------|
| `/vendas/pedidos` | SC | Listagem com FilterBar, Suspense, EncomendasTable |
| `/vendas/pedidos/[id]` | SC | Detalhe com KPIs, tabela de itens |
| `/vendas/pedidos/novo` | SC wrapper | Delega para `NovaEncomendaForm` (CC) |
| `/vendas/devolucoes` | SC | Listagem com filtros status/motivo, DevolucaoTable |
| `/vendas/devolucoes/[id]` | SC | Detalhe com itens e histórico |
| `/vendas/devolucoes/nova` | SC wrapper | Delega para `NovaDevolucaoForm` (CC) |
| `/vendas/trocas` | SC | Listagem com TrocasTable |
| `/vendas/vendedores` | SC | Listagem com FilterBar, VendedoresTable |
| `/vendas/vendedores/novo` | SC wrapper | Delega para `NovoVendedorForm` (CC) |
| `/vendas/vendedores/[id]` | SC | Detalhe com KPIs de comissões (já existia) |

### Property Tests

`src/server/services/comercial/__tests__/ws10-property.test.ts` — 28 testes:
- `TRANSICOES_ENCOMENDA`: estrutura, terminais, transições válidas/inválidas, caminhos concretos
- `TRANSICOES_DEVOLUCAO`: estrutura, terminais, transições válidas/inválidas, fluxo normal e rejeição
- Stock: invariantes matemáticas (reserva ≤ disponível, consumo conserva total, devolução repõe)
- NC partida dobrada: `sum(linhas.total) == total`, `iva == subtotal * taxa`, desconto reduz subtotal
- Multi-tenant: `tenantId` errado → null; correto → registo

---

## Resultados de verificação

```
pnpm prisma validate   ✓
tsc --noEmit           ✓ (0 erros)
eslint                 ✓ (0 warnings)
vitest run             ✓ 795 testes (46 ficheiros)
pnpm gates             ✓ dialog, use-client, data-imports — todos PASSED
```

---

## Conflitos de schema coordenados com o orquestrador

- `TipoSerieDocumento` em `financas.prisma`: delta aditivo, bloco marcado `// WS-10`, sem reordenação
- `faturacao.interface.ts`: union type alargado de forma aditiva

---

## Restrições mantidas

- Nunca `prisma migrate` nem `db push` (a DB partilhada não tem as tabelas novas)
- Nunca `git push` nem merge (papel do orquestrador)
- Toda a mutação cross-domain via funções de contrato dentro de `prismaBase.$transaction`
- Dinheiro: `Prisma.Decimal @db.Decimal(18,2)` — nunca Float
- Documentos append-only: NC emitida por `emitirNotaCredito`, nunca UPDATE da fatura original
- `tenantId` nunca do cliente — vem de `ctx` (sessão)
- Sem modais — rotas dedicadas (`/novo`, `/[id]`)
- `page.tsx` de listagem/detalhe: nunca `'use client'`
