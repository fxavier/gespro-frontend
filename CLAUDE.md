# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GestPro é um ERP **multi-tenant** para empresas moçambicanas. Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5 + Tailwind 4 + shadcn/Radix + Prisma 7 + PostgreSQL. Moeda MZN, validações NUIT/BI, plano de contas PGC-NIRF (Decreto 70/2009). Toda a UI e mensagens em **Português de Portugal**.

## Comandos

```bash
# Base de dados (necessária para dev, seed e testes de integração/E2E)
docker compose up -d          # Postgres 17 (container gespro-db)
pnpm db:migrate:dev           # aplica migrations
pnpm db:seed                  # tenant demo + utilizadores + PGC + dados dos 7 domínios
pnpm db:studio

pnpm dev                      # http://localhost:3000  (login: admin@demo.mz / demo1234)

# Verificação (tudo tem de estar verde antes de entregar)
pnpm check                    # prisma validate && tsc --noEmit && eslint . && vitest run
pnpm gates                    # gates de arquitectura (ver abaixo)
pnpm e2e                      # Playwright — 5 fluxos críticos (precisa da app + DB)
pnpm e2e:a11y                 # axe (WCAG AA)

# Um único ficheiro de teste
npx vitest run src/server/services/financas/__tests__/faturacao.test.ts
npx playwright test e2e/03-caixa.spec.ts

# Testes de integração isolados (Testcontainers, Postgres efémero — spec 15)
npx vitest run --config vitest.integration.config.ts
```

`pnpm check` **não** apanha: (1) erros de runtime RSC (ver "Fronteira Servidor↔Cliente"); (2) erros que **só o build de produção** revela. Para UI, confirma sempre com um **smoke autenticado** (`pnpm dev` + login) ou `pnpm e2e`; antes de entregar algo que toque em build/deploy, corre também `pnpm build` (ver "Build de produção" nas regras invioláveis).

### Migrations — só o orquestrador, e **não-interativas**
`pnpm db:migrate:dev` (`prisma migrate dev`) exige TTY e **rebenta em ambiente não-interactivo**. Para gerar uma migration a partir do delta schema↔DB sem prompts:
```bash
mig="prisma/migrations/$(date +%Y%m%d%H%M%S)_<nome>"; mkdir -p "$mig"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script > "$mig/migration.sql"
npx prisma migrate deploy
```
Rename de valor de enum: o `migrate diff` gera **drop+recreate** (perde dados) — escreve à mão `ALTER TYPE "X" RENAME VALUE 'A' TO 'B';` e marca com `prisma migrate resolve --applied <migration>`. Em produção usa **sempre** `migrate deploy`, nunca `migrate dev`.

Utilizadores demo (senha `demo1234`): `admin@demo.mz`, `gestor@`, `financeiro@`, `operador@`, `leitura@` — tenant slug `demo`.

## Arquitectura

**Monólito modular.** Cada domínio é uma fronteira explícita; a comunicação entre domínios é só por **funções de contrato publicadas**, nunca por import de internals de outro módulo.

### Camadas backend (dos dados para a UI)
- `prisma/schema/*.prisma` — schema multi-ficheiro (um por domínio + `tenant`/`auth` de fundação). **Prisma 7**: o `url` do datasource vive em `prisma.config.ts` (não no schema); o client usa o driver-adapter `@prisma/adapter-pg`.
- `src/server/db/client.ts` — exporta `prisma` (estendido) e `prismaBase` (cru). Extensões: `tenant-extension` + `audit-extension`.
- `src/server/db/tenant-extension.ts` — isolamento multi-tenant via `AsyncLocalStorage`. `TENANT_MODELS`/`SOFT_DELETE_MODELS` são **derivados do `Prisma.dmmf`** (qualquer modelo com `tenantId`/`deletedAt`) — adicionar um módulo novo **não** toca neste ficheiro. `runWithTenantContext({tenantId,userId}, fn)` estabelece o contexto.
- `src/server/services/<modulo>/*.service.ts` — lógica de domínio pura, `import 'server-only'`, recebe `Ctx {tenantId,userId}`. Regras lançam `BusinessRuleError` (código estável). Máquinas de estado: mapa `TRANSICOES_*` + `transitar()`.
- `src/server/safe-action.ts` (`createSafeAction`) e `src/lib/api/with-api.ts` (`withApi`) — pipelines de sessão→permissão→Zod→contexto de tenant→handler→`ActionResult<T>`/envelope.
- `src/server/actions/<modulo>.actions.ts` — `'use server'`, uma action por mutação de UI, cada uma com `permission` (do catálogo em `prisma/seed/rbac.ts`) e `revalidate`.

### Fluxo de dados
- **Leitura de página**: Server Component chama o serviço directamente dentro de `runWithTenantContext` (tenantId da sessão via `auth()`). Nunca faz fetch à própria API nem lê `src/data`.
- **Mutação**: Client Component → Server Action (`createSafeAction`). Nunca lança para o cliente — devolve `ActionResult`.
- **Exportação / webhook / cron**: Route Handler via `withApi`.

### Integração entre domínios (transaccional)
FKs cross-domínio são **escalares** (`clienteId String` + índice), **nunca `@relation`** a modelos de outro workstream — mantém cada schema auto-contido e desacopla `tenant.prisma` dos domínios. A consistência é garantida chamando as **funções de contrato** dentro da mesma `$transaction`:
- **A/inventário expõe**: `entradaStock`, `baixarStock`, `reservarStock`, `confirmarConsumoStock`, `libertarStock`.
- **D/finanças expõe**: `registarLancamentoContabilistico` (partida dobrada), `registarMovimentoCaixa`, `proximoNumeroSerie` (numeração atómica `UPDATE...RETURNING FOR UPDATE`, sem lacunas).
- Fluxos ligados: venda/POS→stock+caixa · recepção→stock+conta a pagar · factura→contabilidade · produção→consumo/entrada de stock.

### Camadas transversais (envelopam, não alteram contratos)
- **Observabilidade** (`src/server/observability/*`, `instrumentation.ts`) — logger estruturado com redacção de segredos/PII, `requestId` num `AsyncLocalStorage` **separado** do tenant, métricas RED. `withApi`/`createSafeAction` estão envelopados: erros inesperados devolvem `traceId` sem stack ao cliente. `/api/health` (liveness), `/api/ready` (SELECT 1), `/api/metrics` (protegido por `METRICS_SECRET`).
- **Segurança** (`middleware.ts`, `src/lib/security/headers.ts`, `src/lib/api/cors.ts`) — CSP com nonce por pedido (report-only por omissão; `CSP_ENFORCE=true` em prod só após smoke), HSTS/X-Frame/nosniff/Referrer/Permissions; CORS por allowlist (`ALLOWED_ORIGINS`), **nunca wildcard**; rate-limit em reset/convite/exports. `middleware.ts` é o **único** dono dos headers de segurança e dos paths públicos.
- **Documentos/exportação** (`src/lib/documents/*`, `src/lib/reporting/*`) — PDF fiscal via `@react-pdf/renderer` (**só runtime Node**, nunca no cliente) que **reflecte** o documento emitido (append-only, nunca recalcula); export CSV/XLSX com `Decimal`→string lossless. Servidos por Route Handlers (`withApi`), nunca Server Actions.
- **Notificações** (`src/server/services/plataforma/notificacao.service.ts`, `src/server/email/*`) — padrão "persistir-depois-enviar": grava `Notificacao` (estado `PENDENTE`) dentro da tx, envia email como efeito colateral **fora** da tx; porta `EmailProvider` (smtp/noop).

### UI
- **Golden standard**: `src/app/(dashboard)/compras/requisicoes/**` — o molde a replicar (lista SC + `@panel`/`(.)[id]` + detalhe com tabs + `novo`/`[id]/editar`). **Nota:** o interceptor `@panel/(.)[id]` captura o segmento literal `novo` (é um valor válido para `[id]`) — em build de produção isto mostra a listagem em vez do formulário na navegação client-side. Bug conhecido do molde (ver `docs/status.md`); ao replicar, garante que o painel devolve `null` em vez de `notFound()`.
- `src/components/patterns/*` — biblioteca única (PageHeader, DataTable, FilterBar, StatusBadge, KpiCard, DetailShell, FormPage, Stepper, UnsavedChangesGuard…). Compor a partir daqui, não dos primitivos `ui/`.
- `StatusBadge` usa um **mapa único** status→variante (`patterns/status-badge.tsx`); proibido mapa local.
- Formulários: `react-hook-form` + `zodResolver` com o **mesmo** schema de `src/lib/validations/<modulo>.ts`, submit via Server Action com `useActionState`.

## Regras invioláveis (não-óbvias — causaram crashes/fugas reais)

**Fronteira Servidor↔Cliente (RSC)** — o `pnpm check` compila mas não apanha estes; o gate `pnpm e2e`/smoke apanha:
- Client Components **nunca** fazem *value-import* de módulos `server-only` (serviços/`.interface.ts`). Usa `import type` para tipos; constantes que o cliente precisa (máquinas de estado) vivem em `src/lib/state-machines.ts` (client-safe).
- Definições de colunas com funções (`render`/`rowHref`) vivem sempre num módulo `'use client'` (funções não atravessam a fronteira RSC).
- `dynamic(..., { ssr: false })` só dentro de um Client Component, nunca num Server Component.
- `page.tsx` de listagem/detalhe é **sempre** Server Component (interactividade em componentes-folha).

**Multi-tenancy** — `tenantId` **nunca** vem do cliente; vem do contexto. A extensão injecta em `create`/`findMany`/etc., mas **`findUnique`/`update`/`delete`/`upsert` NÃO são scoped** → os serviços filtram por `tenantId` explicitamente; cross-tenant devolve `NotFoundError` (404), nunca 403. Dentro de `prismaBase.$transaction` (client cru) inclui sempre `tenantId` nas escritas.

**Dinheiro e documentos** — dinheiro sempre `Prisma.Decimal` (nunca `Float`); serializa `Decimal`→`string` ao passar SC→CC. Documentos transaccionais (facturas emitidas, lançamentos) são **append-only** — correcções por estorno/nota de crédito, nunca UPDATE de valores.

**UI** — **sem modais**: criar/editar/detalhar são rotas dedicadas; única excepção é `AlertDialog` para confirmação destrutiva. Zero cores hardcoded (só tokens `@theme`); dark mode obrigatório.

**Build de produção (`output: 'standalone'`)** — apanha o que `pnpm check` e `pnpm dev` não apanham: `useSearchParams()`/`usePathname()` sem `Suspense` boundary partem o prerender (envolve o componente em `<Suspense>`). Corre `pnpm build` antes de entregar mudanças de deploy/routing. O `pnpm start` fixa `--port 3000`; para smoke numa porta livre usa `npx next start -p <porta>`.

**Middleware e probes** — `middleware.ts` redirige pedidos não-autenticados para `/auth/login`. Endpoints que têm de responder sem sessão (`/api/health`, `/api/ready`, `/api/metrics` para o HEALTHCHECK do Docker/App Runner; `/api/auth/*`) **têm de estar em `PUBLIC_PATHS`** — senão os health checks recebem 307 em vez de 200.

**Gates de CI** (`pnpm gates`, `scripts/gate-*.mjs`) — falham o merge se houver: `Dialog` fora de `AlertDialog`, `'use client'` em `page.tsx` de listagem/detalhe, ou imports de `@/data/` em `src/app`. Manter a zero.

## Convenções detalhadas (normativas)

As skills em `.claude/skills/` são a fonte de verdade e devem ser lidas antes de mexer nas respectivas áreas:
- `prisma-conventions` — modelação (tenantId, Decimal, enums SCREAMING_SNAKE, índices, soft delete, seeds, migrations).
- `api-conventions` — Server Actions, serviços, `withApi`, validação Zod, hierarquia `AppError`.
- `ui-conventions` — padrão sem-modais, patterns, tokens, Server Components, formulários.

## Deploy (spec 16)

`Dockerfile` multi-stage (`output: standalone`, não-root, HEALTHCHECK em `/api/health`); `docker-entrypoint.sh` corre `prisma migrate deploy` antes de arrancar. IaC em `infra/` (Terraform: App Runner + RDS + Secrets Manager). **Zero segredos no repo** — `.tfvars`/`.tfstate` são git-ignored; segredos em runtime via Secrets Manager. CI/CD em `.github/workflows/ci.yml` (spec 15).

## Referência

Especificações e histórico do programa: `.kiro/specs/` — backend Waves 0–3 e UI Waves 0–2 em `{01,02,03}-*`; funcionalidades em falta em `04-09` (reconciliações, payroll, recrutamento, benefícios); funcionalidades + produção em `10-17` (encomendas/devoluções, projetos, relatórios/PDF, notificações, observabilidade, CI/CD, infra, segurança). Decisões de arquitectura: `docs/decisions/` (ADR 0001–0004; **três ADRs da Wave 5 colidem no nº 0005** — motor-pdf, infraestrutura, observabilidade; o próximo ADR deve renumerar). Contratos de domínio, mapa entidades↔conflitos e handoffs por spec: `docs/handoff/`. Estado operacional (fonte de verdade do que está feito e da dívida): `docs/status.md`.
