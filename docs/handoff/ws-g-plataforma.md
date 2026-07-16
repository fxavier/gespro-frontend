# Handoff WS G — Plataforma (Wave 1 Contratos)

Agente: `domain-plataforma` | Data: 2026-07-10 | Wave: 1 (contratos)

---

## 1. Modelos Prisma novos (`prisma/schema/plataforma.prisma`)

### `ConfiguracaoFiscal`

Resolve conflito **#17** do mapa de entidades (Tenant minimalista da Wave 0 vs. mock rico).

| Campo | Tipo Prisma | Notas |
|---|---|---|
| id | String @id @default(cuid()) | |
| tenantId | String @unique | FK escalar para Tenant.id |
| planoAssinatura | PlanoAssinatura | enum: BASICO / PROFISSIONAL / EMPRESARIAL |
| statusAtivo | Boolean @default(true) | bloqueia login quando false |
| email | String? | email de contacto da empresa |
| telefone | String? | |
| endereco | String? | |
| cidade | String? | |
| provincia | String? | validado contra lista MZ |
| codigoPostal | String? | |
| timezone | String @default("Africa/Maputo") | |
| moedaBase | String @default("MZN") | ISO 4217 |
| regimeIva | RegimeIva | enum: NORMAL / SIMPLIFICADO / ISENTO |
| taxaIvaDefault | Decimal @db.Decimal(9,6) | ex.: 16.000000 |
| logoEmpresa | String? | URL para emissão de documentos |
| assinaturaDigital | String? | referência a assinatura qualificada |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |

**Enums novos:** `RegimeIva`, `PlanoAssinatura`

### Acoes que o orquestrador deve fazer ao reconciliar schemas

1. Adicionar `configuracaoFiscal ConfiguracaoFiscal?` ao modelo `Tenant` em `tenant.prisma`.
2. Adicionar `@relation(fields: [tenantId], references: [id])` ao campo `tenantId` de `ConfiguracaoFiscal`.
3. Adicionar `'ConfiguracaoFiscal'` a `TENANT_MODELS` em `src/server/db/tenant-extension.ts`.
4. Adicionar `'ConfiguracaoFiscal'` a `SOFT_DELETE_MODELS` se o soft-delete do Tenant for suficiente (recomendado: não — usar statusAtivo; não expor deletedAt).

---

## 2. Zod Schemas (`src/lib/validations/plataforma.ts`)

| Schema | Permissao | Usado em |
|---|---|---|
| `CreateTenantSchema` | plataforma:admin | action criar tenant |
| `UpdateTenantSchema` | plataforma:admin | action actualizar tenant |
| `FilterTenantSchema` | plataforma:admin | listagem de tenants |
| `ConfiguracaoFiscalSchema` | configuracoes:editar | action config fiscal |
| `CreateUserSchema` | utilizadores:gerir | action criar utilizador |
| `UpdateUserSchema` | utilizadores:gerir | action actualizar utilizador |
| `FilterUserSchema` | utilizadores:gerir | listagem de utilizadores |
| `AssignRoleSchema` | utilizadores:gerir | action atribuir roles |
| `CreateRoleSchema` | roles:gerir | action criar role |
| `UpdateRoleSchema` | roles:gerir | action actualizar role |
| `FilterAuditLogSchema` | auditoria:ler | ecrã de auditoria |

---

## 3. Interfaces de Serviço

### `ITenantAdminService` (`tenant-admin.interface.ts`)

Operações de plataforma: `listar`, `obter`, `criar`, `actualizar`,
`actualizarConfiguracaoFiscal`, `desactivar`, `reactivar`.

Usa `prismaBase` (sem tenant extension) — é o admin da plataforma, não de um tenant.

### `IUserAdminService` (`user-admin.interface.ts`)

Gestão de utilizadores: `listarUtilizadores`, `obterUtilizador`, `criarUtilizador`,
`actualizarUtilizador`, `desactivarUtilizador`, `atribuirRoles`.

Gestão de roles: `listarRoles`, `obterRole`, `criarRole`, `actualizarRole`, `removerRole`.

Catálogo de permissões: `listarPermissoes`.

### `IDashboardService` (`analytics.interface.ts`)

| Método | Tags de cache | Lê de (WS) |
|---|---|---|
| `dashboardGeral` | dashboard, vendas, stock, compras, financas, rh, operacoes | Todos |
| `kpiVendas` | vendas | C (Venda, ItemVenda, Comissao, Cliente), D (SerieDocumento) |
| `kpiStock` | stock | A (SaldoStock, MovimentoStock, Produto, Localizacao) |
| `kpiCompras` | compras | B (PedidoCompra, ContaPagar, Fornecedor) |
| `kpiFinancas` | financas | D (SessaoCaixa, MovimentoCaixa, Lancamento, PartidaLancamento, ContaBancaria) |
| `kpiRH` | rh | E (Colaborador, RegistoAssiduidade, Ferias, Projeto, Timesheet) |
| `kpiOperacoes` | operacoes | F (Ticket, SLA, Atividade, Viatura, DocumentoViatura) |

Constante `ANALYTICS_TAGS` exportada — todos os WS DEVEM usar estes valores
em `revalidate.tags` nas suas Server Actions quando invalidam dados relevantes.

### `IAuditService` (`audit.interface.ts`)

Leitura do `AuditLog` (Wave 0): `listar`, `obter`, `filtrosDisponiveis`.
Read-only — a escrita é responsabilidade dos hooks de auditoria dos outros WS.

---

## 4. Leituras cross-domínio exigidas (Wave 3)

Para que a implementação de `IDashboardService` seja possível na Wave 2/3, cada WS
deve ter os modelos Prisma e campos indicados disponíveis (com índices adequados):

| WS | Modelos necessários para o analytics | Campos agregáveis |
|---|---|---|
| A (Inventário) | SaldoStock, MovimentoStock, Produto | quantidade, custoUnitario, createdAt, tipo |
| B (Compras) | PedidoCompra, ContaPagar, Fornecedor | estado, totalLiquido, dataVencimento, createdAt |
| C (Comercial) | Venda, ItemVenda, Comissao, Cliente | estado, totalLiquido, createdAt, vendedorId |
| D (Finanças) | SessaoCaixa, MovimentoCaixa, Lancamento, PartidaLancamento, ContaBancaria | valor, tipo, estado, dataLancamento |
| E (Pessoas) | Colaborador, RegistoAssiduidade, Ferias, Projeto, Timesheet | ativo, tipo, estado, horas, createdAt |
| F (Operações) | Ticket, Atividade, Viatura | estado, prazoSLA, createdAt |

Todos os modelos acima DEVEM ter `tenantId` indexado com o campo de data/estado
para evitar full-scans nas queries de KPI.

---

## 5. Mapa Páginas → Actions/Serviços (input para spec 03, agente UI)

| Página | Dados | Acções / Serviços |
|---|---|---|
| `/` (dashboard geral) | `dashboardGeral()` | nenhuma mutação |
| `/(dashboard)/analytics` | todos os `kpi*()` | nenhuma mutação |
| `/(dashboard)/core-tenancy` | `listarUtilizadores`, `listarRoles` | `criarUtilizador`, `actualizarUtilizador`, `desactivarUtilizador`, `atribuirRoles`, `criarRole`, `actualizarRole`, `removerRole` |
| `/(dashboard)/core-tenancy` (config fiscal) | `obter` de `ConfiguracaoFiscal` | `actualizarConfiguracaoFiscal` |
| Ecrã de auditoria (a criar) | `listar` de `IAuditService` | nenhuma (read-only) |
| Gestão de tenants (plataforma, a criar) | `listar` de `ITenantAdminService` | `criar`, `actualizar`, `desactivar`, `reactivar` |

### Permissões a semear (input para seed de Wave 2)

```
plataforma:admin       — CRUD de tenants (plataforma)
configuracoes:editar   — actualizar ConfiguracaoFiscal do próprio tenant
utilizadores:gerir     — CRUD de utilizadores do tenant
roles:gerir            — CRUD de roles do tenant
auditoria:ler          — leitura do ecrã de auditoria
```

---

## 6. Estado da Wave 1

- [x] `prisma/schema/plataforma.prisma` — ConfiguracaoFiscal + enums
- [x] `src/lib/validations/plataforma.ts` — todos os Zod schemas
- [x] `src/server/services/plataforma/tenant-admin.interface.ts`
- [x] `src/server/services/plataforma/user-admin.interface.ts`
- [x] `src/server/services/plataforma/analytics.interface.ts` + `ANALYTICS_TAGS`
- [x] `src/server/services/plataforma/audit.interface.ts`

Pendente (Wave 2): implementações dos serviços, Server Actions, seed, conversão de pages.
Pendente (Wave 3): implementação real das queries cross-domínio em `IDashboardService`,
remoção do mock `src/data/system-modules.ts`.
