# TypeScript System Overview

This document maps the TypeScript surface area of the Gespro frontend so you can quickly orient yourself today and have reference material when migrating flows to another framework tomorrow. Every section enumerates the concrete files that live in `src/`, explains what they export, and highlights the coupling between modules.

## High-level structure

| Folder | Purpose | Representative TypeScript entries |
| --- | --- | --- |
| `src/app` | Next.js App Router entrypoints (`layout.tsx`, route handlers under `next_api/`, dashboards inside nested routes) that stitch UI, data hooks, and services together. | `layout.tsx`, `page.tsx`, `(dashboard)/**/page.tsx`, `next_api/example/route.ts` |
| `src/components` | Reusable UI widgets (forms, tables, cards, navigation) written in `.tsx`. These consume domain types and helpers documented below. | Components under `src/components/**` |
| `src/hooks` | Custom React hooks written in TypeScript (`usePagination.ts`, `useZoerIframe.ts`) that encapsulate client-side state. | All files listed in the folder |
| `src/lib` | Framework-agnostic helpers (API adapters, PostgREST wiring, formatting, storage mocks, validation) used by both routes and components. | Detailed in [Library helpers](#library-helpers-src-lib) |
| `src/services` | Rich domain services that orchestrate business logic (commission calculation, stock validation). | Detailed in [Domain services](#domain-services-src-services) |
| `src/types` | The domain model for every ERP module (CRM, procurement, finance, HR, support, logistics, etc.). Components, services, and API handlers all reuse these interfaces. | Detailed in [Domain types](#domain-types-src-types) |

> 💡 When porting the project to another framework (React Native, Vue, etc.) you can keep the `src/types`, `src/lib`, and `src/services` folders almost intact. These folders stay free from framework imports and only rely on standard browser/Node APIs, making them ideal for reuse.

## Domain types (`src/types`)

All domain models live in plain `.ts` files. The following table lists each file, the business area it covers, and the most important exported interfaces/types.

| File | Business area & description | Key exports |
| --- | --- | --- |
| `types/cliente.ts` | Customer master data, addresses, contacts, transaction history, segmentation dashboards, and credit metrics for CRM flows. | `Cliente`, `EnderecoCliente`, `ContactoCliente`, `HistoricoTransacao`, `SegmentacaoCliente`, `DashboardClientes` |
| `types/contabilidade.ts` | Accounting configuration, chart of accounts, journal entries, cost centers, bank reconciliation, statements (DRE/Balancete), and automation switches. | `PlanoContas`, `LancamentoContabil`, `PartidaContabil`, `CentroCusto`, `ReconciliacaoBancaria`, `ConfiguracaoContabil` |
| `types/fornecedor.ts` | Supplier registry with contacts, catalog items, budgets, purchase orders, payments, evaluations, documents, and dashboards. | `Fornecedor`, `EnderecoFornecedor`, `ProdutoFornecedor`, `PedidoFornecedor`, `PagamentoFornecedor`, `DashboardFornecedores` |
| `types/fatura.ts` | Fiscal documents tied to sales: invoices, line items, and credit notes including totals, QR codes, and hashes. | `Fatura`, `ItemFatura`, `NotaCredito` |
| `types/inventario.ts` | Asset/inventory platform covering locations, categories, assets, movements, maintenance, amortization, tracking codes, and documentation. | `Localizacao`, `CategoriaAtivo`, `Ativo`, `MovimentacaoAtivo`, `ManutencaoAtivo`, `AuditoriaInventario` |
| `types/pedido.ts` | Sales order core entities: order headers, line items, stock validation results, and salesperson commissions. | `Pedido`, `ItemPedido`, `ValidacaoStock`, `ComissaoVendedor` |
| `types/procurement.ts` | Purchasing workflow definitions: requisitions, quotations, purchase orders, receiving, approvals, supplier scoring, contracts, and KPIs. | `RequisicaoCompra`, `Cotacao`, `PedidoCompra`, `RecebimentoCompra`, `ConfiguracaoWorkflow`, `RelatorioProcurement` |
| `types/produto.ts` | Product catalog and stock movement definitions, including variants and per-tenant categories. | `Produto`, `VarianteProduto`, `Categoria`, `MovimentacaoStock` |
| `types/projeto.ts` | Project/PMO suite covering projects, tasks, attachments, teams, time entries, milestones, budgets, documents, risks, and dashboards. | `Projeto`, `Tarefa`, `Equipe`, `RegistroTempo`, `OrcamentoProjeto`, `DashboardProjetos` |
| `types/rh.ts` | Human resources data such as employee profiles, education, experience, payroll, vacations, absences, performance, training, onboarding, and analytics. | `Colaborador`, `FormacaoAcademica`, `Payroll`, `Ferias`, `AvaliacaoDesempenho`, `DashboardRH` |
| `types/servico.ts` | Service catalog and scheduling: services, categories, bookings, technicians, evaluations, field reports, material usage, bundles, SLAs, and dashboards. | `Servico`, `AgendamentoServico`, `TecnicoServico`, `RelatorioServico`, `PacoteServico`, `DashboardServicos` |
| `types/tenant.ts` | Multi-tenant bootstrap data (company, fiscal setup, users/roles, document series). Used heavily by authentication/context. | `Tenant`, `ConfiguracoesFiscais`, `SerieDocumento`, `Usuario` |
| `types/ticket.ts` | ITSM/helpdesk schema with tickets, attachments, activities, SLAs, categories, support teams, knowledge base entries, reports, and configuration toggles. | `Ticket`, `AnexoTicket`, `EquipeSuporte`, `BaseConhecimento`, `RelatorioTickets`, `ConfiguracaoTickets` |
| `types/transporte.ts` | Fleet/logistics: vehicles, drivers, routes, deliveries, maintenance, refueling, telematics, and KPI dashboards. | `Veiculo`, `Motorista`, `Rota`, `Entrega`, `Manutencao`, `DashboardTransporte` |
| `types/venda.ts` | POS/sales summary including invoices, payment methods, line items, and quick customer cards used at checkout. | `Venda`, `ItemVenda`, `MetodoPagamento`, `Cliente` (POS view) |
| `types/inventario.ts` (continues) | Also defines maintenance checklists, depreciation, inspections, compliance, audits, and dashboards for equipment. | `ChecklistManutencao`, `AuditoriaInventario`, `DashboardInventario` |
| `types/procurement.ts` (continues) | Adds supplier scorecards, contract records, KPIs, and dashboards for the procurement team. | `FornecedorScorecard`, `ContratoFornecedor`, `DashboardProcurement` |

**Usage tips for migration:** Because every UI component imports these interfaces, you can port them wholesale into a shared package (e.g., publish `src/types` as `@gespro/domain-types`) and let future frameworks rely on the same strongly-typed contracts.

## Library helpers (`src/lib`)

The `lib` folder groups framework-independent helpers. These are safe to reuse across frameworks because they expose pure functions/classes (with the exception of `auth-context.tsx`, which is React-specific but still isolated).

| File | Purpose | Key exports / notes |
| --- | --- | --- |
| `lib/api-client.ts` | Thin wrapper around `fetch` that calls internal Next.js routes under `/next_api`, enforces JSON payloads, and normalizes responses/errors. | `api.get/post/put/delete`, `ApiError`, `ApiResponse` |
| `lib/api-utils.ts` | Utilities for Next.js route handlers: environment validation, query parsing, request body validation, and middleware for consistent error responses. | `validateEnv`, `parseQueryParams`, `validateRequestBody`, `requestMiddleware` |
| `lib/create-response.ts` | Helper to build standard JSON payloads consumed by the frontend (`success/data` vs `success/errorMessage`). | `createSuccessResponse`, `createErrorResponse` |
| `lib/crud-operations.ts` | Generic PostgREST CRUD class that performs `findMany`, `findById`, `create`, `update`, `delete` with automatic filtering, pagination, and error handling. | `CrudOperations` class |
| `lib/postgrest.ts` | Factory that instantiates the Supabase `PostgrestClient`, injects schema/API key headers, and sanitizes quoted column lists so PostgREST accepts requests. | `createPostgrestClient` |
| `lib/format-currency.ts` | Money formatting helpers for Mozambican Metical (standard and compact) plus string parsing. | `formatCurrency`, `formatCurrencyCompact`, `parseCurrency` |
| `lib/provincias-mocambique.ts` | Static dataset with all provinces/districts in Mozambique plus convenience selectors. | `PROVINCIAS_MOCAMBIQUE`, `getProvincias`, `getDistritosByProvincia` |
| `lib/utils.ts` | Tailwind/clsx `cn` helper to merge class names safely. | `cn` |
| `lib/validacao-bi.ts` | Validates and formats Mozambican ID (BI) and Social Security numbers, including helpers to normalize display. | `validarBI`, `formatarBI`, `validarNISS`, `formatarNISS` |
| `lib/validacao-nuit.ts` | Validates/prints NUIT tax identifiers, generates sample NUITs, and contains a basic email validator. | `validarNUIT`, `formatarNUIT`, `gerarNUITAleatorio`, `validarEmail` |
| `lib/auth-context.tsx` | Client-side React context that persists the authenticated tenant/user (backed by `localStorage`) and exposes `login`, `logout`, and `registrarTenant`. | `AuthProvider`, `useAuth`, `AuthContextType` |
| `lib/storage/cliente-storage.ts` | LocalStorage-backed repository for CRM data; seeds demo customers, handles CRUD, filtering, and helper counters (auto-code generation). | `ClienteStorage` class |
| `lib/storage/fornecedor-storage.ts` | Same storage pattern focused on suppliers/procurement data. | `FornecedorStorage` |
| `lib/storage/projeto-storage.ts` | Persists sample project/tarefa/equipe data locally to simulate PMO screens. | `ProjetoStorage` |
| `lib/storage/rh-storage.ts` | Persists HR sample data (employees, payroll, etc.) in localStorage. | `RhStorage` |
| `lib/storage/servico-storage.ts` | Keeps service catalog and scheduling sample data. | `ServicoStorage` |
| `lib/storage/ticket-storage.ts` | Stores support tickets, SLAs, and activity feeds for demo purposes. | `TicketStorage` |
| `lib/api-utils.ts` (middleware) | Higher-order `requestMiddleware` ensures every API route returns `createErrorResponse` payloads so UI logic can be reused no matter the future framework. | See above |

**Migration note:** When porting to another framework, you can wrap these helpers in adapters (e.g., a Vue composition function that calls `apiClient`). Only `auth-context.tsx` is tied to React; when migrating you can translate the underlying logic into the new framework’s state container using the same TypeScript interfaces.

## Domain services (`src/services`)

| File | Responsibility | Highlights for reuse |
| --- | --- | --- |
| `services/comissao.service.ts` | Encapsulates seller assignment and commission calculation logic. It simulates rule evaluation (escalation, bonus by category/meta), caches rules, and exposes helpers to register and list commissions. | `ComissaoService` singleton with methods such as `atribuirVendedorAutomatico`, `calcularComissao`, `registrarComissao`, `obterComissoesVendedor`. Depends only on `types/pedido`. |
| `services/stock-validation.service.ts` | Centralizes stock availability checks, reservations, releases, and alerting. It simulates inventory data but surfaces async APIs ready to be wired to a backend. | `StockValidationService` singleton with `verificarDisponibilidade`, `verificarMultiplosItens`, `reservarStock`, `liberarStock`, `confirmarConsumoStock`, `obterAlertasStock`. Depends on `types/pedido`. |

These services are plain classes with no React imports, so they can be moved into a shared package and reused regardless of UI technology.

## Hooks (`src/hooks`)

| File | Purpose |
| --- | --- |
| `hooks/usePagination.ts` | Calculates pagination state (pages, next/prev handlers) based on total counts and current page. Used across table components. |
| `hooks/useZoerIframe.ts` | Loads the Zoer chatbot iframe, handles message posting/listening, and exposes refs/state to consuming components. |

Both hooks can be replicated in other frameworks (e.g., as Vue composables) using the same TypeScript logic.

## Services/API entrypoints (`src/app/next_api`)

Next.js route handlers under `src/app/next_api/**/route.ts` are thin wrappers that import the helpers above. For example, `next_api/example/route.ts` shows how to wrap a handler with `requestMiddleware`, validate the environment, and respond via `createSuccessResponse`. When migrating to another backend, you can keep the handler logic but swap the HTTP framework.

## Putting it all together

1. **Shared contract-first development** – Keep `src/types`, `src/lib`, `src/services`, and `src/hooks` in a framework-agnostic workspace (e.g., publish them as a private npm package). Any UI technology can consume the same contracts.
2. **Adapters on the edge** – Only the App Router pages and React components import framework primitives. To migrate, recreate equivalent edge adapters (routing, layout, providers) and point them at the shared helpers.
3. **Local storage mocks** – The `lib/storage/**` files and services simulate backend behavior. While porting, replace the storage layer with real API calls but keep their method signatures so UI code stays untouched.
4. **PostgREST abstraction** – `crud-operations.ts` + `postgrest.ts` isolate Supabase/PostgREST specifics. If your new stack calls a different backend, only update this layer while preserving the method contracts.

Use this document as a checklist when auditing or migrating the codebase—any TypeScript addition should either extend the domain model in `src/types`, a helper in `src/lib`, or a service in `src/services` so the rest of the app can stay portable.
