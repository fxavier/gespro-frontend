# Design: Contagem e Reconciliação de Stock

## Âmbito

Nova feature no WS A (Inventário), **distinta** do inventário físico de ativos já
existente. Consome os contratos de stock publicados (`entradaStock`/`baixarStock`)
e, opcionalmente, o contrato de contabilidade (`registarLancamentoContabilistico`)
para a regularização de existências.

## Novos modelos (`prisma/schema/inventario.prisma`)

```prisma
enum StatusContagemStock { RASCUNHO EM_CONTAGEM RECONCILIADA CONCLUIDA CANCELADA }
enum StatusItemContagem  { PENDENTE CONTADO AJUSTADO JUSTIFICADO }

model ContagemStock {
  id            String   @id @default(cuid())
  tenantId      String
  numero        String   // série via proximoNumeroSerie(tx, 'CONTAGEM_STOCK', ctx)
  localizacaoId String?  // null = todas
  categoriaId   String?  // âmbito opcional
  cega          Boolean  @default(false)
  status        StatusContagemStock @default(RASCUNHO)
  responsavelId String
  aprovadoPorId String?
  dataAbertura  DateTime @default(now())
  dataConclusao DateTime?
  observacoes   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  itens         ItemContagemStock[]
  @@unique([tenantId, numero])
  @@index([tenantId, status])
  @@index([tenantId, localizacaoId, status])
}

model ItemContagemStock {
  id                String   @id @default(cuid())
  tenantId          String
  contagemId        String
  produtoId         String   // FK escalar WS A
  localizacaoId     String
  saldoSistema      Decimal  @db.Decimal(18,6) // snapshot no momento da abertura
  quantidadeContada Decimal? @db.Decimal(18,6)
  diferenca         Decimal? @db.Decimal(18,6)
  status            StatusItemContagem @default(PENDENTE)
  justificativa     String?
  movimentoStockId  String?  // ajuste gerado (rastreabilidade)
  createdAt         DateTime @default(now())
  contagem          ContagemStock @relation(fields: [contagemId], references: [id], onDelete: Cascade)
  @@unique([tenantId, contagemId, produtoId, localizacaoId])
  @@index([tenantId, contagemId, status])
}
```

Acrescentar `CONTAGEM_STOCK` a `TipoSerieDocumento` (WS D) para numeração.

## Contrato de serviço (`inventario/contagem-stock.service.ts` — novo)

```ts
abrirContagem(input: AbrirContagemInput, ctx: Ctx): Promise<{ id: string }>
//  ↳ snapshot de SaldoStock no âmbito → cria itens PENDENTE com saldoSistema

registarContagemItem(input: RegistarItemInput, ctx: Ctx): Promise<void>
//  ↳ grava quantidadeContada + diferenca, status CONTADO

justificar(itemId: string, texto: string, ctx: Ctx): Promise<void>

reconciliar(contagemId: string, ctx: Ctx): Promise<ReconciliacaoResultado>
//  ↳ $transaction: por item com diferenca != 0 →
//       diferenca > 0 → entradaStock(...); diferenca < 0 → baixarStock(...)
//     grava movimentoStockId; opcional: registarLancamentoContabilistico (classe 3)
//     valida limiar → exige aprovacao/justificativa

concluir(contagemId: string, ctx: Ctx): Promise<void>
cancelar(contagemId: string, ctx: Ctx): Promise<void>
listar(filter, ctx): Promise<Page<...>>
obter(id, ctx): Promise<ContagemDetalhe>
```

### Integração transaccional (padrão Wave 3)

```ts
await prismaBase.$transaction(async (tx) => {
  for (const item of itensComDiferenca) {
    const mov = item.diferenca.gt(0)
      ? await entradaStock(tx, { produtoId, localizacaoId, quantidade: item.diferenca.abs(), motivo: 'AJUSTE_CONTAGEM', ... }, ctx)
      : await baixarStock(tx, { produtoId, localizacaoId, quantidade: item.diferenca.abs(), motivo: 'AJUSTE_CONTAGEM', ... }, ctx);
    await tx.itemContagemStock.update({ where: { id: item.id }, data: { movimentoStockId: mov.id, status: 'AJUSTADO' } });
  }
  // opcional: lançamento de regularização de existências (débito/crédito classe 3)
});
```

Nas escritas dentro de `prismaBase.$transaction` (client cru), incluir sempre
`tenantId` explícito (regra invável do CLAUDE.md).

## Máquina de estados

```ts
const TRANSICOES_CONTAGEM: Record<StatusContagemStock, StatusContagemStock[]> = {
  RASCUNHO:     ['EM_CONTAGEM', 'CANCELADA'],
  EM_CONTAGEM:  ['RECONCILIADA', 'CANCELADA'],
  RECONCILIADA: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA:    [],
  CANCELADA:    [],
};
```

## Validações (`src/lib/validations/inventario-contagem.ts` — novo)

`AbrirContagemSchema`, `RegistarItemSchema` (quantidade ≥ 0),
`ReconciliarSchema` (limiar, aprovação), `FilterContagemSchema`.

## Actions (`src/server/actions/inventario.actions.ts` — acrescentar)

`abrirContagemAction`, `registarContagemItemAction`, `justificarItemAction`,
`reconciliarContagemAction`, `concluirContagemAction`, `cancelarContagemAction`.
Permissões `inventario:contagens:*` no catálogo `prisma/seed/rbac.ts`.

## UI

```
/inventario/contagens/              page.tsx (lista)
/inventario/contagens/nova/         page.tsx + _components (form 'use client')
/inventario/contagens/[id]/         page.tsx (registo + tabela diffs + Reconciliar/Concluir)
```

A rota `/inventario/reconciliacao` existente (ativos) mantém-se para ativos OU é
renomeada para `/inventario/ativos/reconciliacao` para eliminar a ambiguidade com
esta contagem de existências (decisão de UI a registar).

## Riscos e mitigações

- **Drift durante a contagem:** `saldoSistema` é snapshot no momento da abertura;
  a diferença compara com esse valor, não com o saldo vivo.
- **Ajuste parcial atómico:** toda a reconciliação numa `$transaction`; falha em
  qualquer `baixarStock` (ex.: stock negativo proibido) faz rollback total.
- **Duplo ajuste:** item passa a `AJUSTADO`; reconciliar de novo ignora itens já
  ajustados (idempotência).
