# Visão Geral — Website de Marketing e Onboarding Self-Service (specs 18–19)

Este pacote acrescenta specs (padrão Kiro: `requirements.md`/`design.md`/`tasks.md`)
para a **presença pública** do GestPro e o **onboarding self-service** que converte um
visitante num tenant vivo do ERP. Complementa os specs 01–17 (backend, UI, funcionalidades
em falta e produção) — que cobrem o *produto* — com o que falta para o *vender*: um site,
um catálogo de planos, um trial e o provisionamento automático de tenants.

## Método

Análise do `CLAUDE.md`, dos contratos de plataforma (`docs/handoff/ws-g-plataforma.md`:
`ITenantAdminService`, `IUserAdminService`, `ConfiguracaoFiscal` com `planoAssinatura`/
`statusAtivo`), do spec de infraestrutura (`16-infraestrutura-deploy`) e do padrão de
notificações (`13-notificacoes-email`). O objectivo é reaproveitar os contratos já
publicados — sem os alterar — e acrescentar apenas a fronteira pública que hoje não existe.

## Decisões fixadas (input do pedido)

| Tema | Decisão | Onde vive |
|---|---|---|
| Faturação | **Stripe** (Billing + Checkout + Portal + Webhooks); subscrição SaaS cobrada em USD/EUR porque o Stripe não liquida em MZN (ADR obrigatório) | spec 19 |
| Localização do site | **Separado**, em monorepo pnpm + Turborepo (`apps/erp` + `apps/site`) | spec 18 |
| Trial | **Sem cartão, 14 dias**; tenant provisionado de imediato; expiração bloqueia login via `statusAtivo` | spec 19 |
| Entrega | Apenas as **specs Kiro** (sem código nesta fase) | — |

## Resultado (o que cada spec cobre)

| # | Spec | Âmbito | Natureza |
|---|------|--------|----------|
| 18 | Website de Marketing (`apps/site`) | Migração para monorepo; design system + animação (Motion); páginas (Home, funcionalidades, preços, sobre, contacto, recursos, legais); i18n PT-PT; SEO/OG/JSON-LD; performance (CWV) e a11y (WCAG 2.2 AA); analytics privacy-first; deploy independente | Greenfield + refactor mecânico |
| 19 | Onboarding & Provisionamento de Tenants | Catálogo de planos (fonte única de preços); registo público atómico (`withApi` + `prismaBase.$transaction`); trial sem cartão + máquina de estados `EstadoAssinatura`; Stripe (Checkout/Portal/Webhooks idempotentes); handoff SSO site→app; segurança/anti-abuso; observabilidade | Greenfield (plataforma) |

## Fronteira entre as duas specs (crítica)

O site (**18**) é o *front público*; o provisionamento (**19**) é o *dono do contrato*.
O site **nunca** acede à base de dados do ERP nem ao Stripe — consome apenas dois endpoints
públicos servidos pelo spec 19:

- `GET /api/publico/planos` — catálogo BÁSICO/PROFISSIONAL/EMPRESARIAL (fonte única de preços).
- `POST /api/publico/registo` — registo + trial sem cartão; responde `{ tenantSlug, handoffToken }`;
  o site redirecciona para `${APP_URL}/auth/registo-callback?token=...` e **não** lê os claims.

Qualquer alteração a este contrato é decidida no spec 19 e documentada em
`docs/handoff/site-provisionamento.md`.

## Ordem de execução sugerida

1. **18 §1** (migração para monorepo — mecânica, baixo risco) mergeia **primeiro** e isolada;
   `pnpm check`/`pnpm gates`/`pnpm e2e` do ERP têm de ficar verdes antes de tudo o resto.
2. **19** (provisionamento) e o resto de **18** desenvolvem em paralelo (worktrees isolados).
   O site usa um *mock* local do catálogo até `GET /api/publico/planos` existir.
3. **19** integra depois de **13** (notificações/email) e coordena segredos com **16** e
   rate-limit/CORS com **17**.

Cada spec mantém as regras invioláveis do `CLAUDE.md`: multi-tenancy por contexto (registo/webhook
usam `prismaBase` com `tenantId` explícito, nunca a extensão de tenant), `Decimal` para dinheiro
(a conversão para cêntimos Stripe só na fronteira), documentos append-only, tokens `@theme` sem
cores hardcoded, PT-PT, e gates de CI a zero. Plano de paralelização e mapa de conflitos em
`docs/handoff/execucao-paralela-18-19.md`.
