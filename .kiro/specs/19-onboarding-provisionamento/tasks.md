# Plano de Implementação: Onboarding Self-Service, Provisionamento de Tenants e Faturação por Subscrição

Depende de: WS G/plataforma (`ITenantAdminService`, `IUserAdminService` — implementados),
spec 13 (notificações/email), spec 16 (secrets/deploy), spec 17 (rate-limit). Worktree
`wt/feat-onboarding-provisionamento`. Skills: `prisma-conventions`, `api-conventions`,
`ui-conventions`, `engineering:architecture`. Migrations só o orquestrador.

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums `EstadoAssinatura`, `CicloFaturacao`
  - [ ] 1.2 Modelo `Assinatura` + `Tenant.assinatura` (relação)
  - [ ] 1.3 Modelos `EventoWebhookStripe`, `TokenHandoff`, `TokenVerificacaoEmail`
  - [ ] 1.4 Migração `19xx_onboarding_provisionamento` (gerada pelo orquestrador)

- [ ] 2. Catálogo de planos e configuração Stripe
  - [ ] 2.1 `src/lib/planos.ts` (client-safe): limites/preços/nomes de env por plano×ciclo
  - [ ] 2.2 `.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (6),
        `HANDOFF_SIGNING_SECRET`, chave de captcha
  - [ ] 2.3 `src/server/billing/stripe-client.ts` (singleton do SDK)

- [ ] 3. Máquinas de estado e validações
  - [ ] 3.1 `TRANSICOES_ASSINATURA`, `transitar()`, `bloqueiaAcesso()` em `state-machines.ts`
  - [ ] 3.2 `src/lib/validations/onboarding.ts` (`RegistoTenantSchema`, `CheckoutSchema`)

- [ ] 4. Serviços de provisionamento e assinatura (`server-only`, `prismaBase`)
  - [ ] 4.1 `tenant-provisioning.service.ts` — `criar()` numa `$transaction` (Tenant +
        ConfiguracaoFiscal + Assinatura + User admin + roles + seed PGC-NIRF/séries + Notificacao)
  - [ ] 4.2 `assinatura.service.ts` — `iniciarCheckout`, `abrirPortalCliente`,
        `processarEventoWebhook` (idempotente), `sincronizarStatusAtivo`
  - [ ] 4.3 `handoff.service.ts` — `emitirToken`/`consumirToken` (consumo atómico do `jti`)

- [ ] 5. Route Handlers públicos (`withApi`)
  - [ ] 5.1 `POST /api/publico/registo` (captcha, `Idempotency-Key`, rate-limit)
  - [ ] 5.2 `GET /api/publico/planos`
  - [ ] 5.3 `GET /api/publico/verificar-email`
  - [ ] 5.4 `POST /api/webhooks/stripe` (verificação de assinatura + idempotência)
  - [ ] 5.5 Adicionar todos a `PUBLIC_PATHS` em `middleware.ts`

- [ ] 6. Handoff e sessão
  - [ ] 6.1 `/auth/registo-callback` (valida token, consome `jti`, estabelece sessão NextAuth)
  - [ ] 6.2 Cron `expirar-trials-fallback` (idempotente, belt-and-suspenders do trial Stripe)

- [ ] 7. Actions e permissões autenticadas
  - [ ] 7.1 `onboarding.actions.ts` (`iniciarCheckout`, `abrirPortalCliente`,
        `cancelarSubscricao`) via `createSafeAction`
  - [ ] 7.2 Permissão `assinatura:gerir` no RBAC (`prisma/seed/rbac.ts`, aditivo)

- [ ] 8. UI (Server Components; folhas client; sem modais)
  - [ ] 8.1 `/definicoes/faturacao` (estado da assinatura, plano, Checkout/Portal, avisos)
  - [ ] 8.2 Checklist pós-onboarding no dashboard (primeiro acesso após handoff)
  - [ ] 8.3 Estados de `EstadoAssinatura` no mapa único `patterns/status-badge.tsx`

- [ ] 9. Testes (≥80%)
  - [ ] 9.1 Integração: provisionamento atómico (falha em qualquer passo → rollback total)
  - [ ] 9.2 Idempotência: `Idempotency-Key` repetida e evento Stripe duplicado
  - [ ] 9.3 Property: transições inválidas de `EstadoAssinatura` rejeitadas; `bloqueiaAcesso`
        cobre todos os estados
  - [ ] 9.4 Handoff: token expirado/reutilizado rejeitado; consumo atómico sem corrida
  - [ ] 9.5 Isolamento: registo/webhook usam sempre `prismaBase` (nunca `prisma` tenant-scoped)

- [ ] 10. Verificação
  - [ ] 10.1 `pnpm check` + `pnpm gates` verdes
  - [ ] 10.2 Smoke (Stripe test mode): registo→trial→login; checkout→`ATIVA`; cancelar→`CANCELADA`
        bloqueia login
  - [ ] 10.3 `pnpm build` (rotas públicas + `Suspense` em `useSearchParams` do callback)
  - [ ] 10.4 ADR da moeda de faturação SaaS (`docs/decisions/ADR-0009-moeda-faturacao-saas.md`, skill `engineering:architecture`)
  - [ ] 10.5 Handoff `docs/handoff/feat-19-onboarding.md` (ficheiros tocados, decisões, gaps
        para spec 18)
