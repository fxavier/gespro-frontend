# Plano de Implementação: Onboarding Self-Service, Provisionamento de Tenants e Faturação por Subscrição

Depende de: WS G/plataforma (`ITenantAdminService`, `IUserAdminService` — implementados),
spec 13 (notificações/email), spec 16 (secrets/deploy), spec 17 (rate-limit). Worktree
`wt/feat-onboarding-provisionamento`. Skills: `prisma-conventions`, `api-conventions`,
`ui-conventions`, `engineering:architecture`. Migrations só o orquestrador.

- [~] 1. Schema e migração (1.4 pendente — orquestrador)
  - [x] 1.1 Enums `EstadoAssinatura`, `CicloFaturacao`
  - [x] 1.2 Modelo `Assinatura` + `Tenant.assinatura` (relação)
  - [x] 1.3 Modelos `EventoWebhookStripe`, `TokenHandoff`, `TokenVerificacaoEmail`
  - [ ] 1.4 Migração `19xx_onboarding_provisionamento` (gerada pelo orquestrador) — **POR FAZER**:
        schema escrito e `prisma validate` verde; migrations são da responsabilidade do
        orquestrador. Atenção ao `User.emailVerificado DEFAULT true` (linhas existentes).

- [x] 2. Catálogo de planos e configuração Stripe
  - [x] 2.1 `src/lib/planos.ts` (client-safe): limites/preços/nomes de env por plano×ciclo
  - [x] 2.2 `.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (6),
        `HANDOFF_SIGNING_SECRET`, chave de captcha
  - [x] 2.3 `src/server/billing/stripe-client.ts` (singleton do SDK)

- [x] 3. Máquinas de estado e validações
  - [x] 3.1 `TRANSICOES_ASSINATURA`, `transitar()`, `bloqueiaAcesso()` em `state-machines.ts`
  - [x] 3.2 `src/lib/validations/onboarding.ts` (`RegistoTenantSchema`, `CheckoutSchema`)

- [x] 4. Serviços de provisionamento e assinatura (`server-only`, `prismaBase`)
  - [x] 4.1 `tenant-provisioning.service.ts` — `criar()` numa `$transaction` (Tenant +
        ConfiguracaoFiscal + Assinatura + User admin + roles + seed PGC-NIRF/séries + Notificacao)
  - [x] 4.2 `assinatura.service.ts` — `iniciarCheckout`, `abrirPortalCliente`,
        `processarEventoWebhook` (idempotente), `sincronizarStatusAtivo`
  - [x] 4.3 `handoff.service.ts` — `emitirToken`/`consumirToken` (consumo atómico do `jti`)

- [x] 5. Route Handlers públicos (`withApi`)
  - [x] 5.1 `POST /api/publico/registo` (captcha, `Idempotency-Key`, rate-limit)
  - [x] 5.2 `GET /api/publico/planos`
  - [x] 5.3 `GET /api/publico/verificar-email`
  - [x] 5.4 `POST /api/webhooks/stripe` (verificação de assinatura + idempotência)
  - [x] 5.5 Adicionar todos a `PUBLIC_PATHS` em `middleware.ts`

- [x] 6. Handoff e sessão
  - [x] 6.1 `/auth/registo-callback` (valida token, consome `jti`, estabelece sessão NextAuth)
  - [x] 6.2 Cron `expirar-trials-fallback` (idempotente, belt-and-suspenders do trial Stripe)

- [x] 7. Actions e permissões autenticadas
  - [x] 7.1 `onboarding.actions.ts` (`iniciarCheckout`, `abrirPortalCliente`,
        `cancelarSubscricao`) via `createSafeAction`
  - [x] 7.2 Permissão `assinatura:gerir` no RBAC (`prisma/seed/rbac.ts`, aditivo)

- [x] 8. UI (Server Components; folhas client; sem modais)
  - [x] 8.1 `/definicoes/faturacao` (estado da assinatura, plano, Checkout/Portal, avisos)
  - [x] 8.2 Checklist pós-onboarding no dashboard (primeiro acesso após handoff)
  - [x] 8.3 Estados de `EstadoAssinatura` no mapa único `patterns/status-badge.tsx`

- [x] 9. Testes (≥80%)
  - [x] 9.1 Integração: provisionamento atómico (falha em qualquer passo → rollback total)
  - [x] 9.2 Idempotência: `Idempotency-Key` repetida e evento Stripe duplicado
  - [x] 9.3 Property: transições inválidas de `EstadoAssinatura` rejeitadas; `bloqueiaAcesso`
        cobre todos os estados
  - [x] 9.4 Handoff: token expirado/reutilizado rejeitado; consumo atómico sem corrida
  - [x] 9.5 Isolamento: registo/webhook usam sempre `prismaBase` (nunca `prisma` tenant-scoped)

- [~] 10. Verificação (10.2 parcial — falta só a API real do Stripe)
  - [x] 10.1 `pnpm check` + `pnpm gates` verdes
  - [~] 10.2 Smoke — **PARCIAL**: smoke completo contra servidor real + Postgres (registo,
        idempotência, handoff de uso único, verificação de email, bloqueio de login, webhook com
        HMAC válido/forjado, ciclo TRIAL→ATIVA→SUSPENSA→ATIVA→CANCELADA com `statusAtivo`
        sincronizado) — ver `docs/handoff/feat-19-onboarding.md` §5. **Falta** o smoke contra a
        API real do Stripe (Checkout/Portal/subscrição de trial): sem chaves de teste no
        ambiente. Gap registado em §5b.
  - [x] 10.3 `pnpm build` (rotas públicas + `Suspense` em `useSearchParams` do callback)
  - [x] 10.4 ADR da moeda de faturação SaaS (`docs/decisions/ADR-0009-moeda-faturacao-saas.md`, skill `engineering:architecture`)
  - [x] 10.5 Handoff `docs/handoff/feat-19-onboarding.md` (ficheiros tocados, decisões, gaps
        para spec 18)
