---
name: prisma-conventions
description: Convencoes obrigatorias de modelacao Prisma do GestPro - multi-tenancy, dinheiro, enums, indices, soft delete e migrations. Usar sempre que se criar ou alterar modelos Prisma, seeds ou queries.
---

# Convenções Prisma — GestPro

## Multi-tenancy (inegociável)
- Todo o modelo de negócio tem `tenantId String` + relação com `Tenant` + registo em `TENANT_MODELS` (`src/server/db/tenant-extension.ts`).
- Nunca aceitar `tenantId` de input do cliente; vem sempre do contexto (`runWithTenantContext`).
- Unicidade de negócio é composta com tenant: `@@unique([tenantId, sku])`, `@@unique([tenantId, email])`.
- Índices de listagem começam por tenant: `@@index([tenantId, status])`, `@@index([tenantId, createdAt])`.

## Tipos
- Dinheiro: `Decimal @db.Decimal(18, 2)`; taxas/percentagens: `Decimal @db.Decimal(9, 6)`. NUNCA `Float` para valores financeiros.
- Estados: enum Prisma espelhando os union types de `src/types` (em SCREAMING_SNAKE: `EM_APROVACAO`), com mapeamento no serviço se a UI usar outra forma.
- IDs: `String @id @default(cuid())`. Datas: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Moeda: campo `currency String @default("MZN")` onde multi-moeda for plausível (facturação, compras).

## Soft delete
- Apenas em entidades de referência (Cliente, Fornecedor, Produto): `deletedAt DateTime?` + filtro na extension. Documentos transaccionais (facturas, lançamentos, movimentos) nunca se apagam — cancelam-se por estado.

## Imutabilidade
- Movimentos de stock, lançamentos contabilísticos e facturas emitidas são append-only: correcções geram registos compensatórios (ajuste, estorno, nota de crédito), nunca UPDATE dos valores.

## Migrations
- Agentes de domínio NÃO correm `prisma migrate dev`. Editam apenas `prisma/schema/<modulo>.prisma`; o orquestrador gera migrations no fim da wave, em ordem determinística (A→B→C→D→E→F→G), com nome `00XX_<modulo>`.
- `prisma validate` faz parte de `pnpm check` — schema tem de validar sempre.

## Queries
- Paginação por cursor via helper `paginate()`; nunca `skip` grande em listagens.
- `$transaction` para operações multi-entidade; `$queryRaw` só com justificação e filtro de tenant explícito.
- Selects explícitos em listagens (evitar hidratar relações pesadas por omissão).

## Seeds
- Um ficheiro por módulo em `prisma/seed/<modulo>.ts`, idempotente (upsert por chave natural), dados migrados dos mocks de `src/data`.
