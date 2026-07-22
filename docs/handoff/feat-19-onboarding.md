# Handoff — Spec 19: Onboarding self-service, provisionamento e faturação por subscrição

Agente: `feat-onboarding-provisionamento` · Branch `ws-19` · Worktree
`wt/feat-onboarding-provisionamento`. Todos os caminhos são relativos a `apps/erp/`
salvo indicação em contrário.

Contrato público com o spec 18: `docs/handoff/site-provisionamento.md` (dono: este spec).
Decisão de moeda: `docs/decisions/ADR-0009-moeda-faturacao-saas.md` (Aceite).

---

## 1. O que passou a existir

### Fronteiras públicas (sem sessão)

| Endpoint | Ficheiro | Protecção |
|---|---|---|
| `POST /api/publico/registo` | `src/app/api/publico/registo/route.ts` | rate-limit IP+email, `Idempotency-Key` obrigatória, Zod estrito, captcha |
| `GET /api/publico/planos` | `src/app/api/publico/planos/route.ts` | pública e cacheável; sem PII |
| `GET /api/publico/verificar-email` | `src/app/api/publico/verificar-email/route.ts` | rate-limit IP, consumo atómico do token |
| `POST /api/webhooks/stripe` | `src/app/api/webhooks/stripe/route.ts` | verificação HMAC da assinatura + idempotência por `stripeEventId` |
| `GET /api/cron/expirar-trials` | `src/app/api/cron/expirar-trials/route.ts` | `Authorization: Bearer CRON_SECRET` (**não** é público) |

Os quatro primeiros estão em `PUBLIC_PATHS` de `middleware.ts`, mais
`/auth/registo-callback`. O cron **não** está — usa credencial própria.

### Serviços (`src/server/`)

- `services/plataforma/tenant-provisioning.service.ts` — `provisionarTenant()` numa única
  `prismaBase.$transaction` (timeout 60s) e `verificarEmail()` com consumo atómico.
- `services/plataforma/assinatura.service.ts` — leitura, `iniciarCheckout`,
  `abrirPortalCliente`, `cancelarSubscricao`, `criarSubscricaoTrial` (background),
  `processarEventoWebhook` (idempotente), `aplicarTransicao`, `sincronizarStatusAtivo`,
  `expirarTrialsVencidos`.
- `services/plataforma/handoff.service.ts` — `emitirToken`/`consumirToken`/`purgarTokensExpirados`.
- `provisioning/tenant-bootstrap.ts` — PGC-NIRF + diários + séries + RBAC, **chamável por
  tenant e dentro de uma transacção**. `prisma/seed/financas.ts` passou a delegar aqui
  (uma só definição do plano de contas).
- `provisioning/idempotencia.ts` — reserva/conclusão/falha de `Idempotency-Key`.
- `billing/stripe-client.ts` — singleton do SDK, `resolverPriceId`, `paraCentavos`/`deCentavos`.
- `security/captcha.ts` — Turnstile/hCaptcha, *fail-closed*.

### Schema (`prisma/schema/`)

- `plataforma.prisma`: enums `EstadoAssinatura`, `CicloFaturacao`; modelos `Assinatura`,
  `EventoWebhookStripe`, `TokenHandoff`, `TokenVerificacaoEmail`, `ChaveIdempotencia`.
- `tenant.prisma`: `Tenant.assinatura Assinatura?` (relação 1:1, aditivo).
- `auth.prisma`: `User.emailVerificado Boolean @default(true)` + `emailVerificadoEm`.
  **`default(true)` é deliberado**: as linhas existentes (seed/demo, utilizadores criados por
  admin) não podem ficar bloqueadas por uma coluna nova. Só o registo self-service grava `false`.

### UI

- `/definicoes/faturacao` (Server Component + folha cliente `faturacao-acoes.tsx`) — estado,
  plano, avisos, Checkout/Portal/cancelar. Entrada no `AppSidebar` sob «Plataforma & Analytics»,
  filtrada por `assinatura:ver`.
- `/auth/registo-callback` — page (Server Component) + folha cliente com `useSearchParams()`
  dentro de `<Suspense>`.
- `src/components/onboarding/checklist-onboarding.tsx` — checklist de primeiros passos no
  `/dashboard`, derivada de dados reais (não de estado local).
- `patterns/status-badge.tsx` — `TRIAL`, `EXPIRADO`, `MENSAL`, `ANUAL` no mapa único.

### Outros ficheiros partilhados tocados (todos aditivos)

`middleware.ts` (PUBLIC_PATHS) · `next.config.ts` (comentário sobre `ALLOWED_ORIGINS`) ·
`src/lib/state-machines.ts` · `src/lib/auth.ts` (provider `handoff` + bloqueios de login) ·
`src/server/security/rate-limiter.ts` (3 limitadores novos) · `prisma/seed/rbac.ts`
(`assinatura:ver`, `assinatura:gerir`) · `src/server/db/tenant-extension.ts` (2 excepções) ·
`.env.example` · `apps/erp/package.json` (dependência `stripe`).

---

## 2. Decisões que valem a pena conhecer

**`prismaBase` em toda a fronteira pública.** Registo e webhook não têm
`runWithTenantContext` — o tenant ainda não existe, ou o pedido vem do Stripe. Usar o `prisma`
tenant-scoped ali lançaria `SEM_CONTEXTO_TENANT` (ou pior, escreveria com o tenant errado numa
operação não-scoped). Todas as escritas levam `tenantId` explícito. Coberto por teste.

**Provisionamento numa só transacção, com o argon2 fora dela.** O hash da senha demora ~100 ms:
fazê-lo dentro seguraria locks sem necessidade. O NUIT é verificado antes, pela mesma razão.

**Slug: sugestão + retry, não `findFirst`+`create`.** `sugerirSlug` consulta os slugs
existentes, mas a unicidade real é o índice `@unique` — duas inscrições simultâneas com o mesmo
nome não podem ambas ganhar o slug só porque leram a DB ao mesmo tempo. Em `P2002` no slug,
tenta-se de novo (até 5 vezes).

**Idempotência é uma trava de escrita, não uma leitura.** `ChaveIdempotencia.chave` é `@unique`:
quem consegue inserir ganha o direito de provisionar; quem colide lê o resultado do primeiro.
O `fingerprint` (SHA-256 do corpo) impede reutilizar a chave com dados diferentes.

**Webhook: `stripeEventId` inserido dentro da mesma transacção da lógica.** Se fosse antes,
uma falha deixaria o evento marcado como processado sem ter feito nada; se fosse depois, uma
reentrega concorrente processava duas vezes.

**Transições fora de ordem não são erro.** O Stripe não garante ordem de entrega.
`aplicarTransicao` valida contra o estado actual e, em modo não-estrito (webhooks), regista e
ignora o que não encaixa. A UI usa `estrito: true` e recebe `BusinessRuleError`.

**`statusAtivo` sincronizado na mesma transacção da transição.** Separá-los deixaria janelas em
que um tenant pago está bloqueado (ou um cancelado continua a usar o produto).

**Cancelamento não antecipa `CANCELADA`.** `cancel_at_period_end: true` no Stripe; o estado
local só muda com `customer.subscription.deleted`. Bloquear no clique tiraria acesso a um mês
já pago.

**Handoff ≠ login.** O token de handoff é a única entrada permitida antes da verificação de
email — a posse do token prova que quem entra é quem acabou de submeter o formulário. Os logins
seguintes exigem `emailVerificado`. O token é de uso único (`UPDATE ... WHERE jti = ? AND
usedAt IS NULL`), TTL 60s, e assinado com `HANDOFF_SIGNING_SECRET` (distinto de `AUTH_SECRET`).

**Sem montantes na `Assinatura`.** Ver ADR-0009. `paraCentavos`/`deCentavos` só em
`stripe-client.ts`.

**Notificações reutilizam `ALERTA_SISTEMA`.** Não foram acrescentados valores a
`TipoNotificacao` (modelo do spec 13): o mapa `CANAIS_DEFAULT` em `notificacao.service.ts` é
exaustivo e um valor novo obrigaria a editar código de outro spec. As notificações de subscrição
usam `entidadeTipo: 'ASSINATURA'` e `canal: 'EMAIL'`. Se o spec 13 quiser tipos dedicados, é uma
mudança de uma linha no enum + o mapa.

**Bug encontrado nos dados (corrigido).** `prisma/seed/data/plano-contas-pgc.json` tem duas
entradas repetidas (códigos `5611` e `5612`). O seed antigo escondia-o com um `findFirst` por
conta; `bootstrapPlanoContas` deduplica explicitamente. São 502 contas distintas, não 504.

---

## 3. Estado das tarefas

Feito: 1.1–1.3, 2.1–2.3, 3.1–3.2, 4.1–4.3, 5.1–5.5, 6.1–6.2, 7.1–7.2, 8.1–8.3,
9.1–9.5, 10.1, 10.3, 10.4, 10.5.

**Por fazer:**

- **1.4 — migração `19xx_onboarding_provisionamento`**: por instrução, migrations são geradas
  **só pelo orquestrador**. O schema está escrito e `prisma validate` passa; falta gerar e
  aplicar. Nota: a migração acrescenta `User.emailVerificado` com `DEFAULT true` — confirmar que
  o SQL gerado preenche as linhas existentes (senão o login do tenant demo parte).
- **10.2 — smoke em Stripe test mode**: **não executado**. Não há chaves Stripe de teste neste
  ambiente (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` vazias). Ver §5.

---

## 4. Como verificar (comandos e resultados)

```bash
CI=true pnpm install                 # OK
pnpm db:generate                     # OK
pnpm check                           # ver §6 do relatório final
pnpm gates                           # OK
pnpm build                           # OK
```

Testes novos (todos verdes):

| Ficheiro | Cobre |
|---|---|
| `src/lib/__tests__/assinatura-state-machine.test.ts` | property tests das transições, `bloqueiaAcesso` para todos os estados, integridade do catálogo |
| `src/server/services/plataforma/__tests__/handoff.service.test.ts` | token expirado/reutilizado/adulterado, consumo atómico, corrida |
| `src/server/services/plataforma/__tests__/tenant-provisioning.service.test.ts` | transacção única, `tenantId` explícito, rollback, slug, verificação de email |
| `src/server/services/plataforma/__tests__/assinatura.service.test.ts` | idempotência de webhook, mapeamento de eventos, `statusAtivo`, checkout/portal/cancelamento, cron |
| `src/server/provisioning/__tests__/idempotencia.test.ts` | `Idempotency-Key` repetida, conflito, retomável |
| `src/server/provisioning/__tests__/tenant-bootstrap.test.ts` | PGC por nível, FK do pai, RBAC, séries |
| `src/server/billing/__tests__/stripe-client.test.ts` | conversão de cêntimos, resolução de Price, erros de configuração |
| `src/server/security/__tests__/captcha.test.ts` | fail-closed, recusa `none` em produção |
| `src/server/services/plataforma/__tests__/provisionamento-integracao.test.ts` | **integração real com Postgres**: tenant completo numa tx (502 contas PGC, 18 séries, 9 diários, role ADMIN), handoff de uso único, verificação de email, NUIT duplicado |

---

## 5. Smoke executado (servidor real + Postgres)

`next dev -p 3019` contra a DB local. Verificado ponta a ponta:

| Passo | Resultado |
|---|---|
| `GET /api/publico/planos` | 200, `Cache-Control` público, 3 planos em USD, sem nomes de env vars |
| `POST /api/publico/registo` | 201 `{ tenantSlug, handoffToken }`; DB com Tenant + ConfiguracaoFiscal (MZN/Africa-Maputo) + Assinatura TRIAL (trialFim +14d) + admin `emailVerificado=false` + **502 contas PGC** + 18 séries + 9 diários + roles |
| Mesma `Idempotency-Key`, mesmo corpo | 201 com **resposta idêntica**; continua a existir **um só** tenant e uma só chave |
| Sem `Idempotency-Key` | 400 `IDEMPOTENCY_KEY_OBRIGATORIA` |
| Handoff (`/api/auth/callback/handoff`) | 1.ª vez: sessão estabelecida (cookies `authjs.session-token.*`); 2.ª vez com o mesmo token: `CredentialsSignin`, sem sessão |
| Login antes de verificar email | recusado (`error=CredentialsSignin`, zero cookies de sessão) |
| `GET /api/publico/verificar-email?token=…` | 303 → `?verificacao=ok`; 2.º clique → `?verificacao=invalida` |
| Login depois de verificar | sessão estabelecida |
| Login com `statusAtivo=false` | recusado |
| Webhook sem `stripe-signature` | 400 `ASSINATURA_AUSENTE` |
| Webhook com assinatura forjada | 400 `ASSINATURA_INVALIDA` |
| Webhook com HMAC válido (`whsec` local) | 200; reentrega do mesmo `evt_…` → `duplicado: true`, **sem reprocessar** |
| Ciclo de vida por webhook | `TRIAL → ATIVA` (checkout.session.completed) → `SUSPENSA` + `statusAtivo=false` (invoice.payment_failed, dunning esgotado) → `ATIVA` + `statusAtivo=true` (invoice.paid) → `CANCELADA` + `statusAtivo=false` (customer.subscription.deleted), com `Notificacao` PENDENTE em cada transição |

Dados do smoke removidos da DB no fim (restam só `demo` e o tenant do teste pré-existente).

**Bug corrigido durante o smoke**: uma configuração Stripe em falta devolvia 400
`ASSINATURA_INVALIDA` no webhook — o Stripe interpretaria isso como pedido malformado e
**desistiria da reentrega**. Agora o `AppError` de configuração propaga e o `withApi` devolve
503, mantendo a reentrega viva.

## 5b. Gaps assumidos (não fingidos)

1. **Smoke contra a API real do Stripe não corrido** (task 10.2). Não há `sk_test_…` desta conta
   no ambiente; o webhook foi smoked com um `whsec` local (o HMAC é o mesmo algoritmo), mas as
   chamadas de saída (Checkout Session, Billing Portal, criação da subscrição de trial) só estão
   cobertas por teste com o SDK mockado. Falta validar contra a API real:
   - forma exacta do payload de `invoice.payment_failed` no fim do dunning (usamos
     `next_payment_attempt === null` **ou** `tentativas >= 4` como heurística);
   - se `payment_behavior: 'default_incomplete'` + `trial_settings.end_behavior` dá mesmo trial
     sem recolha de cartão na conta configurada;
   - os 6 `Price` têm de ser criados no Dashboard Stripe em **USD** e os IDs colocados nas env
     vars `STRIPE_PRICE_<PLANO>_<CICLO>`.
2. **Rate limiter em memória.** `createRateLimiter` (spec 17) é por processo: com várias
   instâncias App Runner, o limite efectivo multiplica-se pelo número de instâncias. Herdado do
   spec 17, não regressão deste spec, mas relevante porque o registo público é o alvo mais
   exposto. Precisa de backend Redis antes de abrir ao público.
3. **Retry idempotente devolve um `handoffToken` já expirado.** Por desenho: repetir o registo
   com a mesma `Idempotency-Key` devolve *a mesma resposta*, e o token dura 60s. O utilizador cai
   no ecrã «ligação inválida» e entra pelo login após verificar o email. Emitir um token novo na
   repetição transformaria a `Idempotency-Key` numa credencial de sessão — recusado.
4. **`criarSubscricaoTrial` é fire-and-forget.** Corre com `void` depois de responder; num
   ambiente serverless que congela o processo após a resposta, pode não chegar a executar. O
   trial local funciona à mesma e o cron de fallback expira-o na data certa; a consequência é o
   Stripe não conhecer o tenant até ao primeiro Checkout. Se isto incomodar, mover para uma fila.
5. **Alerta de falha de webhook é um log estruturado** (`alerta: 'webhook_stripe_falhou'` +
   `erro` persistido em `EventoWebhookStripe`), não um canal de alerta dedicado — depende do
   pipeline da spec 14 estar ligado a um destino.
6. **Fiscalidade da própria subscrição por validar** (ADR-0009): IVA/retenção sobre serviço
   prestado do estrangeiro a cliente moçambicano. Bloqueante antes de produção.

---

## 6. Para o spec 18 (site de marketing)

O contrato está em `docs/handoff/site-provisionamento.md` e **não mudou** face ao congelado.
Confirmações:

- `GET /api/publico/planos` devolve `{ data: { planos: [...], trialDias: 14 } }` — atenção ao
  envelope `data` (convenção do projecto); os campos de cada plano são os do contrato mais
  `descricao` e `destaque`. Moeda: `USD`.
- `POST /api/publico/registo` devolve **201 `{ tenantSlug, handoffToken }` no topo do corpo**
  (sem envelope), e erros `{ traceId, erro, error: { code, message } }`.
- `Idempotency-Key` tem de ser um valor entre 8 e 200 caracteres (UUID serve).
- O `handoffToken` é opaco e de uso único: relaiar, nunca inspeccionar nem guardar.
- A origem do site **tem de constar em `ALLOWED_ORIGINS`** antes do deploy — o preflight e o
  cabeçalho `Access-Control-Allow-Origin` dependem disso (nunca wildcard).
- O widget de captcha usa `NEXT_PUBLIC_CAPTCHA_SITE_KEY`; o segredo fica só no ERP.

## 7. Para o orquestrador

- **A DB local (`gespro-db`, localhost:5433) tem o schema deste spec aplicado por
  `npx prisma db push`** — foi preciso para os testes de integração (2 suites já existentes
  falhavam por falta da coluna `User.emailVerificado`). Consequência: `prisma migrate diff
  --from-config-datasource` devolve **diff vazio**. Para gerar a migração, usar a base de
  migrations em vez do estado da DB:

  ```bash
  cd apps/erp
  mig="prisma/migrations/$(date +%Y%m%d%H%M%S)_onboarding_provisionamento"; mkdir -p "$mig"
  npx prisma migrate diff \
    --from-migrations prisma/migrations \
    --to-schema prisma/schema \
    --shadow-database-url "postgresql://gespro:gespro@localhost:5433/gespro_shadow" \
    --script > "$mig/migration.sql"
  npx prisma migrate resolve --applied "$(basename "$mig")"   # a DB já tem o estado
  ```

  (Em alternativa: recriar a DB do zero, `migrate deploy` + `db:seed`, e só depois gerar.)
- Gerar a migração (task 1.4) — ver a nota do `DEFAULT true` em §3.
- `pnpm db:seed` continua a funcionar: `seedFinancas` delega no bootstrap partilhado e
  `seedRbac` ganhou duas permissões.
- Merge de `prisma/schema/plataforma.prisma`: 13 → 19 (o `Notificacao` do 13 tem de estar lá
  primeiro; este spec só acrescenta ao fim do ficheiro).
- `src/lib/auth.ts` passou a ter **dois** providers de credenciais. O `signIn('credentials', …)`
  existente não muda de comportamento; o novo tem `id: 'handoff'`.
