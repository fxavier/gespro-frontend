# Design: Onboarding Self-Service, Provisionamento de Tenants e Faturação por Subscrição

## Arquitectura

Domínio G/plataforma (estende `docs/handoff/ws-g-plataforma.md`), com duas fronteiras
novas e **públicas** (sem sessão): `POST /api/publico/registo` e `POST
/api/webhooks/stripe`, ambas Route Handlers via `withApi` — nunca Server Actions,
porque não há sessão nem `runWithTenantContext` disponível. Todas as escritas destes
dois endpoints usam `prismaBase` directamente (o tenant ainda não existe, ou o
pedido vem do Stripe, não de um utilizador do tenant) com `tenantId` sempre
explícito nas escritas — a extensão de tenant (`AsyncLocalStorage`) não se aplica
aqui. Depois do handoff, tudo o resto (Checkout, Portal, cancelamento) é UI
autenticada normal: Server Action via `createSafeAction`, dentro do contexto de
tenant do administrador. Sem `@relation` cross-domínio: `Assinatura` liga-se a
`Tenant` por `tenantId` escalar, como `ConfiguracaoFiscal`.

## Schema (`prisma/schema/plataforma.prisma`) — deltas

Enums: `EstadoAssinatura` (`TRIAL`, `ATIVA`, `SUSPENSA`, `CANCELADA`, `EXPIRADO`),
`CicloFaturacao` (`MENSAL`, `ANUAL`).

Modelos novos:
- `Assinatura { id, tenantId @unique, planoAssinatura PlanoAssinatura, ciclo CicloFaturacao?,
  estado EstadoAssinatura @default(TRIAL), stripeCustomerId String? @unique,
  stripeSubscriptionId String? @unique, stripePriceId String?, trialInicio DateTime,
  trialFim DateTime, dataAtivacao DateTime?, dataCancelamento DateTime?,
  motivoCancelamento String?, tentativasFalhadas Int @default(0), createdAt, updatedAt }`
  — índices em `tenantId` e `[estado, trialFim]` (cron de fallback). Tem `tenantId`,
  logo é elegível a `TENANT_MODELS` (derivado do dmmf) para leitura autenticada
  normal; nas duas fronteiras públicas acede-se sempre via `prismaBase`.
- `EventoWebhookStripe { id, stripeEventId String @unique, tipo String, processadoEm
  DateTime @default(now()), tenantId String? }` — modelo de plataforma, sem
  `tenantId` obrigatório (o evento pode chegar antes de resolvido o tenant), sem
  soft delete; existe só para idempotência, não é dado de negócio do tenant.
- `TokenHandoff { id, jti String @unique, tenantId, userId, usedAt DateTime?,
  expiraEm DateTime, createdAt }` — consumo atómico via `UPDATE ... WHERE jti = ?
  AND usedAt IS NULL RETURNING *` (nunca `findUnique` + `update` separados: corrida
  entre dois pedidos com o mesmo token tem de perder um).
- `TokenVerificacaoEmail { id, tenantId, userId, token String @unique, expiraEm,
  usadoEm DateTime? }` — mesmo padrão de consumo atómico; se já existir um modelo
  genérico de verificação de email da Wave 0 de auth, reaproveitar em vez de duplicar.

`Tenant` (em `tenant.prisma`) ganha `assinatura Assinatura?`. `ConfiguracaoFiscal`
não muda de forma — `planoAssinatura` e `statusAtivo` continuam lá, mas passam a
ser **escritos apenas** pelos serviços deste spec (nunca directamente por UI),
sincronizados a partir de `Assinatura` na mesma transacção da transição de estado.

## Catálogo de planos e trial

`src/lib/planos.ts` (client-safe, sem `import 'server-only'`) exporta `PLANOS:
Record<PlanoAssinatura, { nome, limites, precoMensal: { valor, moeda },
precoAnual: { valor, moeda }, stripePriceIdMensalEnv, stripePriceIdAnualEnv }>` —
os campos `stripePriceId*Env` guardam o **nome** da variável de ambiente (ex.:
`STRIPE_PRICE_PROFISSIONAL_MENSAL`), resolvida em runtime só no servidor; o
catálogo em si nunca contém segredos. `GET /api/publico/planos` (`withApi`,
público, `Cache-Control` curto) serve este catálogo para o site de marketing
(spec 18) consumir — **fonte única de preços**, o site nunca hardcoda valores.

Trial: 14 dias, **sem cartão**. No provisionamento cria-se em background (fora da
tx de registo) uma subscrição Stripe com `trial_period_days=14` e sem exigir
método de pagamento (`payment_method_collection` permite trial sem cartão) — o
Stripe passa a ser o motor primário do ciclo de vida (`trialing` → `active`/
`incomplete_expired`/`unpaid`), espelhado em `EstadoAssinatura` pelos webhooks.
Um cron diário `expirar-trials-fallback` (idempotente, `estado=TRIAL AND
trialFim < now()`) cobre falhas de entrega de webhook — nunca é a via principal.
Mapa `TRANSICOES_ASSINATURA` (`src/lib/state-machines.ts`, client-safe):
`TRIAL → {ATIVA, EXPIRADO, CANCELADA}`, `EXPIRADO → {ATIVA, CANCELADA}`,
`ATIVA ⇄ SUSPENSA`, qualquer não-terminal `→ CANCELADA` (terminal). Função pura
`bloqueiaAcesso(estado)`: `false` para `TRIAL`/`ATIVA`, `true` caso contrário —
aplicada a `ConfiguracaoFiscal.statusAtivo = !bloqueiaAcesso(estado)` dentro da
mesma transacção de `transitar()`.

## Fluxo de signup e provisionamento

1. Site (spec 18) recolhe empresa (nome, NUIT), admin (nome, email, senha),
   `planoId`, província, resolve captcha → `POST /api/publico/registo` com
   header `Idempotency-Key`.
2. `withApi` aplica rate-limit + CORS allowlist; handler valida captcha
   server-side, valida Zod (`RegistoTenantSchema`, reaproveita validador de NUIT),
   verifica a `Idempotency-Key` (se já vista e concluída, devolve a resposta
   anterior sem reprovisionar).
3. `prismaBase.$transaction`: `criarTenant` (slug único a partir do nome) →
   `criarConfiguracaoFiscal` (plano, província, `moedaBase=MZN`,
   `timezone=Africa/Maputo`, `statusAtivo=true`) → `criarAssinatura`
   (`estado=TRIAL`, `trialInicio=now`, `trialFim=now+14d`) → `criarUtilizador`
   admin + `atribuirRoles(['Administrador'])` (via `IUserAdminService`) → seed do
   plano de contas PGC-NIRF + séries de documentos (reaproveita as funções de seed
   existentes, extraídas para serem chamáveis por tenant, não só pelo script de
   seed) → `Notificacao` boas-vindas `PENDENTE` + `TokenVerificacaoEmail`. Toda
   escrita com `tenantId` explícito (é `prismaBase`, sem extensão de tenant).
4. Fora da tx: `EmailProvider.enviar` (verificação de email); criação da
   subscrição Stripe em modo trial (chamada à API Stripe, não bloqueia a resposta
   ao utilizador — em falha, fica marcada para retry por um job, sem impedir o
   acesso ao trial local já provisionado).
5. Resposta: `{ tenantSlug, handoffToken }`.
6. Site redirecciona para `${APP_URL}/auth/registo-callback?token=...`.
7. `/auth/registo-callback` (Route Handler público, listado em `PUBLIC_PATHS`)
   valida assinatura/expiração do token, consome o `jti` atomicamente, estabelece
   a sessão NextAuth (equivalente ao callback de credentials, mas sem pedir senha
   de novo) e redirecciona para o dashboard com um checklist inicial de onboarding.
8. Login só é permitido após clique no link de verificação de email
   (`GET /api/publico/verificar-email?token=`, consumo atómico do
   `TokenVerificacaoEmail`) — independente de `statusAtivo`.

## Integração Stripe (billing)

- Planos mapeiam para `Product`/`Price` no Stripe (mensal + anual); IDs em env
  (`STRIPE_PRICE_<PLANO>_<CICLO>`), nunca na base de dados.
- `iniciarCheckout(planoId, ciclo)` (Server Action, `createSafeAction`,
  permissão `assinatura:gerir`): garante `stripeCustomerId` (cria se ausente,
  grava em `Assinatura`), cria Checkout Session `mode=subscription`,
  `metadata.tenantId`, `success_url`/`cancel_url` na página de faturação.
- `abrirPortalCliente()`: cria sessão do Billing Portal para o `stripeCustomerId`
  do tenant — mudar plano/cartão, cancelar, ver faturas, tudo delegado ao Stripe.
- `POST /api/webhooks/stripe` (`withApi`, público, `PUBLIC_PATHS`): lê corpo raw,
  verifica assinatura (`stripe.webhooks.constructEvent`, `STRIPE_WEBHOOK_SECRET`);
  em `prismaBase.$transaction`: insere `EventoWebhookStripe.stripeEventId` (se já
  existir, devolve 200 sem processar) → resolve `tenantId` via
  `stripeCustomerId`/`stripeSubscriptionId` em `Assinatura` → aplica `transitar()`:
  - `checkout.session.completed` / `customer.subscription.created|updated` com
    status `active`/`trialing` → `ATIVA` (ou mantém `TRIAL` se ainda em trial);
  - `customer.subscription.deleted` → `CANCELADA`, `dataCancelamento=now`;
  - `invoice.paid` → `ATIVA` (recupera de `SUSPENSA` se aplicável), zera
    `tentativasFalhadas`;
  - `invoice.payment_failed` → incrementa `tentativasFalhadas`; ao esgotar o
    dunning do Stripe → `SUSPENSA`;
  - `customer.subscription.trial_will_end` → não transita estado, apenas emite
    `Notificacao` (aviso 3 dias antes do fim do trial).
- Conversão de montantes (`Decimal` MZN do tenant ↔ cêntimos USD/EUR do Stripe)
  só acontece na fronteira desta integração (`paraCentavos`/`deCentavos`); a
  receita da assinatura SaaS **não** é lançada no livro-razão do tenant (é receita
  da plataforma, fora do PGC-NIRF do cliente) — evita poluir a contabilidade do
  tenant com a própria factura da GestPro.
- **Decisão para ADR** (skill `engineering:architecture`,
  `docs/decisions/ADR-0009-moeda-faturacao-saas.md`): cobrar a subscrição em USD/EUR
  porque o Stripe não liquida em MZN; documentar alternativas consideradas
  (gateway móvel local, facturação manual) e porque foram descartadas para o MVP.

## Handoff site→app (SSO)

Token assinado HS256 com `HANDOFF_SIGNING_SECRET` (segredo dedicado, distinto de
`AUTH_SECRET`, no Secrets Manager). Claims: `{ sub: userId, tenantId, jti, iat,
exp }`, TTL ~60s. Emitido apenas pelo endpoint de registo, imediatamente após a
transacção de provisionamento committar. Consumo em `/auth/registo-callback`:
1. Verifica assinatura e `exp`.
2. Consome `jti` atomicamente (`UPDATE TokenHandoff SET usedAt=now() WHERE jti=?
   AND usedAt IS NULL`) — zero linhas afectadas ⇒ token já usado ou inexistente
   ⇒ 401, sem estabelecer sessão.
3. Estabelece sessão NextAuth para `userId`/`tenantId` (equivalente ao que o
   `signIn` faz após validar credenciais, mas o token já prova a posse da conta
   recém-criada).

Nunca se passa a senha do administrador na URL: um querystring fica em logs de
proxy, no histórico do browser e no `Referer` de recursos de terceiros; o token
de handoff é de uso único, de curtíssima duração e não serve para mais nada além
de estabelecer esta sessão específica — mesmo interceptado, uma segunda utilização
falha.

## Segurança e rate-limiting

- `POST /api/publico/registo` e `POST /api/webhooks/stripe` em `PUBLIC_PATHS` do
  `middleware.ts` (senão recebem 307 para `/auth/login`); `middleware.ts`
  continua o único dono de headers de segurança e da lista de paths públicos.
- Rate-limit dedicado (reaproveita mecanismo da spec 17) em `registo` (por IP +
  por email) e no callback de handoff; CORS por allowlist
  (`ALLOWED_ORIGINS` inclui a origem do site de marketing), nunca wildcard.
- Captcha (hCaptcha/Turnstile) obrigatório no registo — mitigação central do
  trial sem cartão contra criação massiva de tenants.
- `tenantId`/`planoId` do cliente nunca são a fonte de verdade de autorização:
  o registo cria o tenant, não o recebe; o Checkout resolve o plano a cobrar a
  partir do `planoId` validado no próprio pedido autenticado, nunca de um campo
  oculto arbitrário. Acesso cross-tenant (ex.: handoff com `tenantId` adulterado)
  falha na verificação de assinatura do token, não expõe 403 informativo.
- Segredos (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `HANDOFF_SIGNING_SECRET`,
  chave do captcha) via Secrets Manager em produção (coordenar com spec 16).

## Observabilidade e notificações

- `withApi` nos dois endpoints públicos e no callback de handoff: logs
  estruturados com redacção de PII/segredos, `requestId` próprio, métricas RED;
  erros inesperados devolvem `traceId` sem stack.
- Alerta dedicado (spec 14) em falha de processamento de webhook — um evento não
  processado pode significar um tenant que pagou e continua bloqueado.
- Notificações (spec 13, persistir-depois-enviar): boas-vindas, verificação de
  email, trial a expirar (`trial_will_end`), pagamento falhado, suspensão,
  reactivação — sempre `Notificacao` `PENDENTE` na tx de negócio, envio de email
  como efeito colateral fora da tx.

## Integração e riscos

- **Fronteira `prismaBase` vs. `prisma` (tenant extension)**: registo e webhook
  não têm `runWithTenantContext` — usar sempre `prismaBase` com `tenantId`
  explícito; qualquer uso acidental de `prisma` (tenant-scoped) nestes dois
  endpoints falha silenciosamente (contexto ausente) — cobrir com teste.
- **Corrida de webhooks fora de ordem**: Stripe não garante ordem de entrega;
  `transitar()` deve validar a transição contra o estado actual (não assumir
  sequência), e eventos que não correspondem a uma transição válida são
  registados e ignorados (não é erro fatal).
- **Reactivação após `CANCELADA`**: estado terminal para a subscrição corrente;
  reactivar cria nova Checkout Session e, por convenção, actualiza o mesmo
  registo `Assinatura` (não um novo) com novo `stripeSubscriptionId`.
- **A reconciliar com spec 18** (site de marketing, ainda não escrito neste
  repositório): (1) contrato exacto do handoff — o site apenas redirecciona com o
  `token` recebido, não lê nem guarda claims; (2) o site consome
  `GET /api/publico/planos` como única fonte de preços, não hardcoda; (3) o
  domínio/origem do site tem de constar em `ALLOWED_ORIGINS` antes do deploy.
