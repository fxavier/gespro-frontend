# Requisitos: Onboarding Self-Service, Provisionamento de Tenants e Faturação por Subscrição

## Introdução

O GestPro não tem hoje um caminho self-service entre o site de marketing (spec 18) e um
tenant vivo: `ITenantAdminService.criar` (`docs/handoff/ws-g-plataforma.md`) só é
invocável por um administrador da plataforma autenticado. Este spec acrescenta a
**fronteira pública** que falta — registo → provisionamento atómico do tenant →
trial sem cartão de 14 dias → subscrição paga via Stripe → handoff seguro para a
sessão autenticada do ERP — sem alterar os contratos já publicados de plataforma
(`ITenantAdminService`, `IUserAdminService`) nem os de finanças/inventário. Cobre
igualmente o ciclo de vida da assinatura (dunning, suspensão, reactivação) que
`ConfiguracaoFiscal.statusAtivo` já usa para bloquear login.

Skills obrigatórias: `prisma-conventions`, `api-conventions`, `ui-conventions`,
`engineering:architecture` (ADR sobre moeda de faturação — ver Requisito 3).

## Requisitos

### Requisito 1 — Registo público e provisionamento atómico do tenant

1. DEVE existir um Route Handler público `POST /api/publico/registo` (`withApi`, sem
   sessão) que recebe `{ empresa: { nome, nuit }, admin: { nome, email, senha },
   planoId, provincia, captchaToken }`, validado por Zod (incluindo o validador de
   NUIT existente) e listado em `PUBLIC_PATHS` do `middleware.ts`.
2. O endpoint DEVE ser **idempotente** por `Idempotency-Key` (header obrigatório):
   pedidos repetidos com a mesma chave devolvem a mesma resposta sem reprovisionar.
3. O provisionamento DEVE correr numa única `prismaBase.$transaction` (sem contexto
   de tenant — o tenant ainda não existe): `Tenant` → `ConfiguracaoFiscal` (plano,
   província, `moedaBase=MZN`, `timezone=Africa/Maputo`) → `Assinatura` (estado
   `TRIAL`) → `User` administrador + `atribuirRoles` (via `IUserAdminService`) →
   seed do plano de contas PGC-NIRF e séries de documentos do tenant (reaproveitando
   os contratos de seed existentes, não duplicar lógica) → `Notificacao` de
   boas-vindas em estado `PENDENTE`. Toda a escrita inclui `tenantId` explícito.
4. O slug do tenant DEVE ser derivado do nome da empresa (normalizado, único; em
   colisão acrescenta sufixo numérico) — nunca fornecido pelo cliente.
5. Envio do email de verificação e do email de boas-vindas DEVE ocorrer **fora** da
   transacção (padrão "persistir-depois-enviar", spec 13).
6. Login DEVE ficar bloqueado até o email do administrador ser verificado
   (`emailVerificado=false`), independentemente de `statusAtivo`.

### Requisito 2 — Catálogo de planos e fonte única de preços

1. DEVE existir um catálogo único de planos (`src/lib/planos.ts`, client-safe) para
   `BASICO`/`PROFISSIONAL`/`EMPRESARIAL`, com limites por plano, preço mensal/anual
   e o identificador do Stripe Price correspondente (6 preços: 3 planos × 2 ciclos).
2. DEVE existir `GET /api/publico/planos` (`withApi`, público, cacheável) que expõe
   este catálogo, para o site de marketing (spec 18) o consumir sem duplicar preços.
3. Alterar o catálogo (preço, limites) NUNCA deve exigir migração de schema —
   apenas os IDs de `Price` no Stripe e a constante local.

### Requisito 3 — Trial sem cartão e máquina de estados da assinatura

1. DEVE existir o enum `EstadoAssinatura` (`TRIAL → ATIVA`, `TRIAL → EXPIRADO`,
   `ATIVA ⇄ SUSPENSA`, qualquer estado não-terminal `→ CANCELADA`), com mapa
   `TRANSICOES_ASSINATURA` e `transitar()` em `src/lib/state-machines.ts`.
2. O signup NÃO DEVE exigir método de pagamento. O tenant é criado imediatamente
   com `estado=TRIAL`, `trialFim = now()+14 dias`, `statusAtivo=true`.
3. DEVE usar-se o trial nativo do Stripe (subscrição criada em background,
   `trial_period_days=14`, sem exigir cartão) como motor principal do ciclo de
   vida; um cron de fallback (idempotente) DEVE expirar localmente qualquer tenant
   cujo `trialFim` já passou e cujo evento Stripe correspondente não chegou
   (falha de entrega de webhook).
4. **Decisão a registar em ADR**: Stripe não liquida em MZN — a subscrição SaaS
   DEVE ser cobrada em USD ou EUR, independentemente da `moedaBase=MZN` da
   contabilidade do tenant. Este trade-off DEVE ficar documentado no ADR
   `docs/decisions/ADR-0009-moeda-faturacao-saas.md` (sequência iniciada em `0006` para
   resolver a colisão conhecida em `ADR-0005-*`, ver `CLAUDE.md`).

### Requisito 4 — Checkout, subscrição Stripe e Customer Portal

1. DEVE existir uma Server Action `iniciarCheckout(planoId, ciclo)` que cria (ou
   reaproveita) o `Customer` Stripe do tenant e uma Checkout Session em modo
   `subscription`, com `metadata.tenantId`, redirecionando para o Stripe.
2. DEVE existir `abrirPortalCliente()` que cria uma sessão do Billing Portal do
   Stripe para o `stripeCustomerId` do tenant (alterar plano, cartão, cancelar).
3. Montantes DEVEM converter-se para unidades mínimas (cêntimos) apenas na
   fronteira com a API Stripe; a assinatura não guarda montantes em `Decimal` —
   o Stripe é a fonte de verdade do valor cobrado, evitando dupla contabilidade
   com o livro-razão do tenant (que continua em MZN/`Decimal`).

### Requisito 5 — Webhooks Stripe: idempotência e reconciliação de estado

1. DEVE existir `POST /api/webhooks/stripe` (`withApi`, público, listado em
   `PUBLIC_PATHS`) que verifica a assinatura do evento (`STRIPE_WEBHOOK_SECRET`,
   corpo em raw bytes) antes de qualquer processamento.
2. Cada evento DEVE ser processado no máximo uma vez: o `stripeEventId` é
   verificado/registado (`@unique`) antes da lógica de negócio; reentregas do
   Stripe devolvem 200 sem reprocessar.
3. DEVE tratar, no mínimo: `checkout.session.completed`,
   `customer.subscription.created`/`updated`/`deleted`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.trial_will_end`.
4. Cada evento DEVE resolver o `tenantId` a partir do `stripeCustomerId`/
   `stripeSubscriptionId` (nunca de metadata não verificada) e escrever via
   `prismaBase` com `tenantId` explícito — o webhook não tem sessão de tenant.

### Requisito 6 — Bloqueio de acesso e reactivação

1. `EstadoAssinatura` DEVE mapear para `ConfiguracaoFiscal.statusAtivo` por uma
   função pura (`TRIAL`/`ATIVA` → `true`; `EXPIRADO`/`SUSPENSA`/`CANCELADA` →
   `false`), aplicada dentro da mesma transacção que regista a transição.
2. `invoice.payment_failed` reincidente (fim do período de dunning do Stripe) DEVE
   transitar para `SUSPENSA`, bloqueando login; `invoice.paid` subsequente DEVE
   reactivar para `ATIVA`.
3. Um tenant bloqueado que paga (Checkout ou Portal) DEVE reactivar automaticamente
   via `checkout.session.completed`/`invoice.paid`, sem intervenção manual.

### Requisito 7 — Handoff seguro site→app (SSO one-time token)

1. Após provisionar, o endpoint de registo DEVE devolver um token assinado
   (`HANDOFF_SIGNING_SECRET`, distinto de `AUTH_SECRET`), de uso único, com TTL
   ~60s, claims `{ sub: userId, tenantId, jti, iat, exp }`.
2. O site DEVE redirecionar para `/auth/registo-callback?token=...`, que valida
   assinatura, expiração e **consome atomicamente** o `jti` (marca usado numa
   única operação condicional) antes de estabelecer a sessão NextAuth.
3. Credenciais (senha) NUNCA DEVEM viajar na URL ou em querystring — apenas o
   token de handoff, que não é reutilizável nem tem alcance além de estabelecer
   esta sessão específica.

### Requisito 8 — Segurança, anti-abuso e rate-limiting

1. `POST /api/publico/registo` e `POST /api/webhooks/stripe` DEVEM ter
   rate-limit dedicado (reaproveitando o mecanismo da spec 17), CORS por
   allowlist (`ALLOWED_ORIGINS` inclui a origem do site de marketing, nunca
   wildcard) e validação Zod estrita.
2. O registo DEVE exigir verificação de captcha (hCaptcha/Turnstile) — mitigação
   central de abuso do trial sem cartão.
3. `tenantId` e `planoId` fornecidos pelo cliente NUNCA DEVEM ser confiados para
   decisões de segurança sem revalidação server-side; acesso cross-tenant DEVE
   devolver `NotFoundError` (nunca 403).
4. Segredos (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `HANDOFF_SIGNING_SECRET`,
   chave do captcha) DEVEM vir do Secrets Manager em produção, nunca do repositório.

### Requisito 9 — Observabilidade e notificações

1. `/api/publico/registo` e `/api/webhooks/stripe` DEVEM emitir métricas RED e
   logs estruturados com redacção de PII/segredos; falhas devolvem `traceId` sem
   stack ao chamador.
2. Falhas de processamento de webhook DEVEM gerar alerta (spec 14) — um evento
   Stripe não processado pode significar tenant pago e bloqueado por engano.
3. Transições de assinatura relevantes (trial a expirar, pagamento falhado,
   suspensão, reactivação) DEVEM emitir `Notificacao` (persistir-depois-enviar,
   spec 13) para o administrador do tenant.

## Critérios de Aceitação

1. `pnpm check` e `pnpm gates` verdes; zero `Dialog`/`'use client'` proibidos; zero
   `@/data`; `pnpm build` verde (rotas públicas + `Suspense` em `useSearchParams`
   do callback de handoff).
2. Teste de integração: registo→provisionamento cria Tenant+ConfiguracaoFiscal+
   Assinatura+User+roles+seed PGC-NIRF+séries numa única transacção; falha em
   qualquer passo reverte tudo (nenhum tenant parcial).
3. Idempotência: repetir `POST /api/publico/registo` com a mesma `Idempotency-Key`
   não cria um segundo tenant; reentregar o mesmo evento Stripe não reprocessa.
4. Property tests da máquina de estados: transições inválidas rejeitadas
   (`BusinessRuleError`); `bloqueiaAcesso(estado)` reflecte exactamente o mapa do
   Requisito 6.1 para todos os valores de `EstadoAssinatura`.
5. Teste de handoff: token expirado ou já consumido é rejeitado; token válido usado
   duas vezes falha na segunda tentativa.
6. Smoke autenticado (modo teste Stripe): registo → login em trial → `iniciarCheckout`
   → webhook `checkout.session.completed` → `ATIVA` → `abrirPortalCliente` →
   cancelar → webhook `customer.subscription.deleted` → `CANCELADA` bloqueia login.
7. Teste de isolamento multi-tenant e verificação de que `prismaBase` (nunca
   `prisma` com tenant extension) é usado no registo e no processamento de webhook.

## Fontes

- Contratos de plataforma: `docs/handoff/ws-g-plataforma.md` (`ITenantAdminService`,
  `IUserAdminService`, `ConfiguracaoFiscal`, RBAC).
- Regras do projecto: `CLAUDE.md` §Multi-tenancy, §Dinheiro e documentos,
  §Notificações (persistir-depois-enviar), §Middleware e probes, §Build de produção.
- Specs relacionadas: `.kiro/specs/13-notificacoes-email` (padrão de notificação/email),
  `.kiro/specs/16-infraestrutura-deploy` (secrets, deploy), `.kiro/specs/18-website-marketing`
  (consumidor do handoff e do catálogo de planos — **a reconciliar**, ver design.md).
- Stripe: [Billing subscriptions overview](https://stripe.com/docs/billing/subscriptions/overview),
  [Checkout](https://stripe.com/docs/payments/checkout),
  [Trials sem método de pagamento](https://stripe.com/docs/billing/subscriptions/trials),
  [Customer Portal](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal),
  [Webhooks](https://stripe.com/docs/webhooks),
  [Verificação de assinatura de webhook](https://stripe.com/docs/webhooks/signatures).
- Auth: [NextAuth.js / Auth.js](https://authjs.dev/).
