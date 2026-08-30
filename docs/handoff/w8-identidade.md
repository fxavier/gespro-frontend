# Handoff — w8-identidade (Fase 2: Keycloak como fornecedor de identidade)

> ADR-0010, 0011, 0012 (lado aplicacional), 0013 — **versões emendadas de 2026-08-29/30**,
> incluindo os sete deltas do plano de execução §6-ter. Branch `w8-identidade`,
> worktree `wt/w8-identidade`, base `27fd625` + merge de `w8/integracao` (`name: gespro`).

## 1. O que ficou feito

### Autenticação (ADR-0010/0011)

- `src/lib/auth.ts` — os dois providers `Credentials` (login e `handoff`) substituídos por **um
  provider Keycloak OIDC** (Authorization Code + PKCE S256, cliente confidencial; endpoints
  divididos: autorização pelo issuer público, troca de código/renovação pelo interno — na pilha
  docker o browser vai a `localhost:8081` e o servidor a `keycloak:8080`).
- **Fronteira ADR-0011**: o token transporta só identidade; `sub → User → tenantId` resolve-se em
  Postgres (`resolverUtilizadorLocal`). Identidade sem `User` local **não entra** — o
  `callbacks.signIn` recusa com redirect para `/auth/erro?motivo=nao-provisionado` («contacte o
  administrador da sua empresa»), nunca criação implícita. Utilizador inactivo e subscrição
  bloqueada (`ConfiguracaoFiscal.statusAtivo` — fica no ERP, não migrou) têm recusas próprias.
- **`permsVersion` removido** (ADR-0011 §4). A garantia é a **re-resolução no `callbacks.jwt` da
  renovação**: a cada `AUTH_SESSION_MAX_AGE` (900 s) relêem-se do Postgres as permissões, o
  `ativo`, o `deletedAt` e o bloqueio de subscrição, e renova-se o token no Keycloak
  (grant `refresh_token`). **Nunca por pedido** — dentro do intervalo o `jwt` devolve o token sem
  nenhuma consulta.
- `primeiroAcessoEm` escrito uma única vez no `callbacks.signIn` (updateMany com filtro null —
  idempotente por construção).
- `createSafeAction`/`withApi` **não mudaram de forma**; as 231 actions não foram tocadas.
- `can`/`requirePermission` inalterados.

### As três durações de sessão (ADR-0011 tabela / ADR-0013 §6) — parâmetros de ambiente

| Duração | Variável | Omissão | Onde vive |
|---|---|---|---|
| Re-resolução Auth.js | `AUTH_SESSION_MAX_AGE` | 900 s | ERP (deadline `resolverEm` DENTRO do JWT) |
| SSO Session Idle | `KEYCLOAK_SSO_IDLE_SECONDS` | 28 800 s | realm, injectada no import |
| SSO Session Max | `KEYCLOAK_SSO_MAX_SECONDS` | 43 200 s | realm + `session.maxAge` do cookie |

**Decisão de implementação que precisa de ser conhecida:** o «maxAge de 15 min» do ADR-0011 está
implementado como *deadline de re-resolução dentro do JWT* (`resolverEm`), e o `exp` do cookie é o
*SSO Session Max* (12 h). Um cookie que expirasse aos 15 minutos de inactividade reintroduzia
exactamente o cenário que o ADR-0011 exclui — o financeiro que é interrompido meia hora e perde o
formulário ao submeter: com o deadline interno, o submit tardio renova em silêncio (idle de 8 h
no Keycloak) em vez de morrer no `getToken` do middleware. A garantia dos 15 minutos não depende
disto: é imposta pela re-resolução, e o cenário E2E prova as duas metades.

**Renovação — recusa vs. indisponibilidade** (`src/server/auth/keycloak.ts`): 4xx do Keycloak =
sessão SSO terminou → a sessão do ERP **cai**; 5xx/rede = indisponibilidade → a sessão
**sobrevive** (ADR-0010: «quem já tem sessão continua a trabalhar») mas a re-resolução Postgres
corre na mesma — é ela que impõe a revogação de papéis/subscrição.

**Aresta conhecida do Auth.js v5 (App Router):** um `auth()` em RSC não escreve cookies, portanto
um token re-resolvido aí não é persistido — persiste na chamada seguinte a `/api/auth/session`
(o `SessionProvider` está montado). Entre os dois momentos repetem-se re-resoluções; nunca menos
verificação. O Keycloak não roda refresh tokens por omissão, logo repetir o grant é seguro.
Coberto pelo E2E obrigatório (não por inspecção).

### Realm e tema (ADR-0012 §7/§8, ADR-0013 §7)

- `infra/keycloak/realm-gespro.json` — realm completo construído de raiz (o anterior era um
  esqueleto): cliente `gespro-erp` (confidencial, PKCE S256 obrigatório, standard flow, **sem**
  Direct Access Grant, conta de serviço com `view-users`/`manage-users`), papel realm
  `plataforma-admin` (ADR-0011 §5, sem membros), 5 utilizadores demo com **`sub` fixos**
  (`11111111-…` a `55555555-…`), brute force nativo, `resetPasswordAllowed`, `verifyEmail`,
  locale `pt`, SMTP por env (Mailpit na pilha). **Sem Organizations** (delta 1).
- `infra/keycloak/import-realm.sh` — **verificado contra a 26.7.0 que a substituição nativa
  `${env.…}` do Keycloak NÃO cobre campos `Integer`** (o import rebenta com «Cannot deserialize
  value of type java.lang.Integer»). Este entrypoint faz todas as substituições com `sed` antes do
  `--import-realm`; o compose delega nele. Restrição documentada: valores sem `|`/`&`.
- `fullScopeAllowed: true` no cliente — necessário: com `false`, os papéis `realm-management` da
  conta de serviço não entram no token e a Admin API devolve 403 (verificado ao vivo).
- Tema `infra/keycloak/themes/gespro/` — estende `keycloak.v2`, substitui **apenas** variáveis CSS
  da marca (de `packages/brand/tokens.css`, claro+escuro), logótipo e mensagens. Templates
  FreeMarker intocados. `darkMode=true` (classe `pf-v5-theme-dark`, `prefers-color-scheme`).
- **Desvio consciente ao ADR-0012 §8**: o ficheiro de mensagens chama-se `messages_pt.properties`,
  não `messages_pt_PT.properties` — o locale do realm é `pt` (o pacote base já é português
  europeu, verificado no jar) e a regra de resolução de `ResourceBundle` ignora um `_pt_PT` para o
  locale `pt`. Conteúdo: ~18 cadeias de ortografia pré-AO (`Actualizar palavra-passe`,
  `desactivada`, «Iniciar sessão»…).
- `infra/keycloak/README.md` — notas do realm + **armadilha do `kc-gzip-cache`** (o cache gzip de
  recursos do tema sobrevive a `docker compose restart`; custou uma hora de depuração).

### Schema (delta para a migração do orquestrador — ver §3)

- `auth.prisma`: `User` perde `passwordHash`, `emailVerificado`, `emailVerificadoEm` e o
  `@@unique([tenantId, email])`; ganha `keycloakSub String @unique`, `email @unique` **global**
  (delta 2), `primeiroAcessoEm DateTime?` (delta 5) e `@@index([tenantId, email])`. Saem
  `PasswordResetToken`, `UserInvite`, `LoginAttempt`. **`AuditLog` ganha `requestId String?` e
  `keycloakSub String?`** — o pedido do `w8-auditoria` (mapa de conflitos §4-2), antecipado para
  lhes poupar o PR de seguimento.
- `plataforma.prisma`: saem `TokenHandoff` e `TokenVerificacaoEmail`; `ChaveIdempotencia` mantém-se.
- `tenant.prisma`: só as back-references dos modelos removidos (consequência mecânica).
- `tenant-extension.ts`: removida a excepção `LoginAttempt` (modelo já não existe); `TENANT_MODELS`
  continua derivado do DMMF — nada mais a fazer.

### Provisionamento (ADR-0013 §2/§5/§5-bis)

- `src/server/auth/keycloak.ts` (novo) — renovação silenciosa + Admin API com a conta de serviço:
  `garantirUtilizador` (procura por e-mail ANTES de criar — idempotência sem tabela; trata a
  corrida 409), `dispararEmailAccoes` (`execute-actions-email`, falha não-fatal e gritada no log),
  `definirActivo` (desactivar também encerra sessões SSO), `renovarTokens`.
- `tenant-provisioning.service.ts` — **Keycloak primeiro, Postgres depois**: NUIT → e-mail global
  → catálogo → `garantirUtilizador` (VERIFY_EMAIL+UPDATE_PASSWORD pendentes, sem palavra-passe) →
  `$transaction` (Tenant, ConfiguracaoFiscal, Assinatura, RBAC, `User{keycloakSub}`, PGC,
  Notificacao **IN_APP**) → o route handler dispara o e-mail de acções. `verificarEmail` removido.
  A recusa de e-mail duplicado usa `EMAIL_JA_REGISTADO` com a mensagem literal «quem gere duas
  empresas precisa de dois endereços de e-mail distintos».
- `api/publico/registo/route.ts` — reescrito: sem `senha`, resposta `{ tenantSlug, mensagem }`
  (sem `handoffToken`), captcha **antes de qualquer toque no Keycloak** (§6-quater). **O
  w8-anti-abuso ainda não tinha chegado à rota** quando cheguei: a `verificarCaptcha` existente
  (CAPTCHA_PROVIDER) está marcada no código como o ponto de extensão do Turnstile, com a regra
  «endurecer não pode reordenar o Keycloak para antes dela». A reentrega idempotente responde
  antes do captcha porque não tem efeitos (tokens Turnstile são de uso único — re-verificar uma
  reentrega falharia sempre).
- `user-admin.service.ts` — **convidar um colaborador é o mesmo mecanismo** (§5-bis): Keycloak
  primeiro, tx local com papéis atribuídos à partida, e-mail de acções. Sem palavra-passe em
  nenhum caminho administrativo. Desactivar/reactivar escreve **nos dois lados**; desactivar
  encerra as sessões SSO. `UserRow` ganhou `primeiroAcessoEm` («por activar» = null).
- **Decisão de âmbito:** o e-mail deixou de ser editável no ecrã de utilizadores (o campo é da
  Identidade; corrigir um e-mail errado = desactivar + convidar o endereço certo). Os formulários
  `core-tenancy/utilizadores/{novo,editar}` perderam os campos de palavra-passe/e-mail.

### Removido por inteiro (delta 3 + ADR-0013 §4)

`handoff.service.ts` (+ teste), provider `handoff`, `/auth/registo-callback/**`,
`/api/publico/verificar-email`, `/api/auth/invite`, `/api/auth/reset-request`,
`src/server/auth/{password-reset,rate-limit}.ts` (+ testes), templates de e-mail
`reset`/`convite`/`boas-vindas` (+ testes), `HANDOFF_SIGNING_SECRET` (dos `.env.example`),
`@node-rs/argon2` do `package.json`, campo `senha` de `RegistoTenantSchema`, `purgarTokensExpirados`
do cron `expirar-trials`. O `handoffLimiter`/`passwordResetLimiter`/`inviteLimiter`/`verificacaoEmailLimiter`
ficaram **exportados mas mortos** em `rate-limiter.ts` — o ficheiro é do `w8-cache`; podar lá.

### Logout (decisão dentro do mandato do ADR-0010)

O signOut local seguido de `/auth/login` fazia **re-login automático** pela sessão SSO viva — um
botão «Terminar sessão» que não terminava nada. Novo `GET /api/auth/logout-keycloak`: *RP-initiated
logout* (302 para o `end_session` com ecrã de confirmação do Keycloak). **Não é** o front-channel
(iframe) nem o back-channel que o ADR-0010 rejeita — esses propagam o logout de outros clientes
para nós; isto é o próprio utilizador a encerrar a própria sessão no próprio browser. CSP intocada
(navegação de topo). `AppHeader` e o shim `auth-context` usam-no.

### Middleware, páginas, CSP

- `middleware.ts`: `PUBLIC_PATHS` perde `/api/publico/verificar-email` e `/auth/registo-callback`;
  mantém `/api/health|ready|metrics`, `/api/auth/*`, registo, planos, webhook Stripe, contactos.
  **CSP e cabeçalhos intocados** (ADR-0010: o form-action `'self'` cobre; nada foi alargado).
- `/auth/login` → Client Component mínimo que dispara `signIn('keycloak')` (os cookies de
  state/PKCE não se escrevem em RSC). `/auth/erro` (novo, SC) com as três recusas nomeadas.
- `checklist-onboarding`: passo «confirmar e-mail» agora lê `primeiroAcessoEm`.

### Reconciliação (ADR-0013 §3)

- `src/server/auth/reconciliacao.ts` + `GET /api/cron/reconciliar-identidades`
  (`Bearer CRON_SECRET`, diário): compara utilizadores do realm com `User` por `keycloakSub`,
  nas duas direcções. **Reporta, nunca repara.** Alerta por TAXA (§6-quater): órfãos Keycloak só
  contam com >1 h e o nível `error` (que dispara alerta) exige contagem acima de
  `RECONCILIACAO_LIMIAR_ORFAOS` (omissão 5); `User` local sem identidade é sempre `error` — é
  quem não consegue entrar. Contas de serviço e fixtures de carga (sub não-UUID) são excluídas.
- **Correcção de defeito latente no `middleware.ts`**: `/api/cron/` entrou em `PUBLIC_PATHS` — as
  rotas de cron impõem `CRON_SECRET` e devolvem 401 próprias, mas o middleware devolvia **307 →
  /auth/login** antes de a credencial ser lida (afectava também o cron de transporte e o
  expirar-trials, cujo comentário «chamado com credencial própria» prometia o que o middleware
  negava). Verificado ao vivo: sem credencial 401, com credencial 200.

### Compose, CI, seeds, testes

- `docker-compose.yml`: **`db-init` e `keycloak` saem do perfil `full`** (delta 7); Keycloak ganha
  os cinco env de substituição do realm + `KC_HOSTNAME_BACKCHANNEL_DYNAMIC: "false"` (o `iss` dos
  tokens obtidos via backchannel tem de ser o hostname público — é o que o Auth.js valida); monta
  o tema e o `import-realm.sh`. `x-erp-ambiente` ganha `KEYCLOAK_ISSUER_INTERNO`, client id/secret,
  `AUTH_SESSION_MAX_AGE`, `KEYCLOAK_SSO_MAX_SECONDS`.
- `.github/workflows/ci.yml`: jobs `e2e` e `a11y` **perderam o service container Postgres**; a
  pilha (db + db-init + keycloak, perfil por omissão) sobe num **step** logo após o checkout
  (paralelo ao install) e há um passo de espera por health antes das migrations. Sem `up --wait`
  (o one-shot db-init confunde algumas versões do compose).
- Seeds: `prisma/seed/demo-users.ts` (novo, fonte única dos `sub`); `seed/index.ts` grava
  `keycloakSub` e upsert por `email`; `seed/volume/base.ts` sem argon2, `keycloakSub` sintético
  `perf-<slug>-admin` (**os utilizadores de carga NÃO existem no Keycloak** — ver §4,
  w8-desempenho).
- Testes novos: `realm-demo-sync.test.ts` (realm ↔ seed **no `pnpm check`**, mais invariantes:
  durações por env, PKCE, sem segredo no repo, sem password grant) e `keycloak.test.ts` (fetch
  dublado: renovação ok/recusada/indisponível, idempotência por e-mail, corrida 409, logout na
  desactivação). Reescritos: registo-handler, tenant-provisioning, user-admin,
  provisionamento-integracao (Keycloak dublado — é um teste de atomicidade Postgres),
  planos (renomeado `planos-handler.test.ts`), email, venda-integracao, wave3-integration.
- **Incidente evitável, corrigido:** `wave3-integration.test.ts` chamava o serviço real de
  desactivação, que agora escreve no Keycloak — desactivou o `operador@demo.mz` no realm
  partilhado e só restaurava a linha local. Keycloak agora dublado nesse ficheiro; o utilizador
  foi reactivado à mão. Regra que fica: **teste que toca em `userAdminService`/provisionamento
  dubla `@/server/auth/keycloak`**, salvo se for explicitamente o E2E.
- E2E: `helpers/auth.ts` conduz o formulário do Keycloak (`#username`/`#password`/`#kc-login`) e
  expõe helpers de Admin API para os cenários; `auth.setup.ts` autentica de verdade uma vez e
  reutiliza o estado; `01-login.spec.ts` reescrito (inclui recusa de identidade não provisionada
  e logout SSO); **`07-sessao.spec.ts` — o cenário obrigatório** (renovação silenciosa dupla +
  queda após logout administrativo no Keycloak, com `AUTH_SESSION_MAX_AGE=8` injectado pelo
  `webServer` do Playwright — nenhum teste espera 15 minutos); `a11y.a11y.ts` corre o axe no ecrã
  de login **do Keycloak nos dois temas** (32 → mantém a cobertura; apanhou e fez corrigir um
  contraste real no tema escuro) e na página `/auth/erro`.
- `CLAUDE.md` (arranque local), `.env.example` raiz e `apps/erp/.env.example`,
  `docs/handoff/site-provisionamento.md` §2–§7 actualizados.

## 2. Evidência de runtime (o que correu MESMO)

Ambiente: pilha partilhada projecto `gespro` (Keycloak 26.7.0 real no compose, BD própria — ver §5).

| Prova | Resultado |
|---|---|
| `pnpm check` (prisma validate + tsc + eslint + vitest, 80 ficheiros/1237 testes) | **verde** (re-corrido após a última alteração; primeiro run apanhou os 3 falhados do teste de integração, corrigidos) |
| `pnpm gates` | **verde** (dialog, use-client, data-imports) |
| `pnpm build` (produção, standalone) | **verde** (5m32; exigiu adiar o throw de `KEYCLOAK_CLIENT_SECRET` para runtime — `NEXT_PHASE`) |
| E2E suite completa contra Keycloak REAL | **38/39 verdes**; o único falhado é o `02-requisicao` («criar requisição») e é o **bug conhecido do molde** (CLAUDE.md/`docs/status.md`: o interceptor `@panel/(.)[id]` captura o segmento literal `novo` na navegação client-side e mostra a listagem em vez do formulário — a snapshot da falha mostra exactamente isso). Intermitente (passa quando a navegação não é interceptada, p.ex. isolado após compile frio); destinado ao `w8-correcoes`, não é de identidade |
| `07-sessao.spec.ts` (obrigatório) | **verde**: renovação silenciosa 2× após deadline de 8 s; logout administrativo no Keycloak → sessão ERP viva dentro do intervalo e **caída na re-resolução seguinte** (log do servidor: «renovação recusada — sessão SSO terminou») |
| `pnpm e2e:a11y` | **15/15 verdes**, incluindo login Keycloak claro+escuro (o escuro falhou primeiro com contraste 4.02:1 no link — corrigido no tema para ≥4.5) |
| Import do realm | verificado ao vivo: `ssoSessionIdleTimeout=28800/43200` substituídos, tema aplicado, locale pt («Iniciar sessão», «Palavra-passe») |
| Admin API com conta de serviço | list/create/delete users 200/201/204 (após fix `fullScopeAllowed`) |
| Smoke do registo público (dev + Mailpit) | **201** `{tenantSlug, mensagem}` → utilizador Keycloak com `requiredActions [VERIFY_EMAIL, UPDATE_PASSWORD]` → `User` local com `keycloakSub` e `primeiroAcessoEm=null` → **e-mail de activação entregue no Mailpit** («Atualização de conta»). Reentrega idempotente 201; e-mail repetido noutra empresa → `EMAIL_JA_REGISTADO` com a mensagem das duas empresas |
| Login demo | `admin@demo.mz`/`demo1234` e restantes entram pelo ecrã Keycloak (setup E2E + specs) |
| Reconciliação (cron) | ao vivo contra o realm: sem credencial **401** (antes: 307 do middleware), com credencial **200** `{keycloakSemLocal:0, localSemKeycloak:0, …}` — 6↔6 utilizadores em concordância |

## 3. Migração (para o orquestrador — eu NÃO gerei ficheiros de migração)

SQL de referência gerado por `migrate diff` contra a BD partilhada (schema antigo) e **ajustado à
mão** no ponto que o ADR-0013 §4 exige (o diff cru produz `ADD COLUMN … NOT NULL` sem default, que
falha em qualquer tabela com linhas):

```sql
-- FASE DE EXPANSÃO (aditiva — pode publicar-se com o código antigo vivo)
ALTER TABLE "AuditLog" ADD COLUMN "keycloakSub" TEXT, ADD COLUMN "requestId" TEXT;
ALTER TABLE "User" ADD COLUMN "keycloakSub" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "User" ALTER COLUMN "keycloakSub" DROP DEFAULT;   -- na MESMA migração (ADR-0013 §4)
ALTER TABLE "User" ADD COLUMN "primeiroAcessoEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_keycloakSub_key" ON "User"("keycloakSub");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");      -- ver nota (a)
CREATE INDEX "User_tenantId_email_idx" ON "User"("tenantId", "email");

-- FASE DE CONTRACÇÃO (destrutiva — só depois de o código novo estar em todas as instâncias)
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_tenantId_fkey";
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_invitedById_fkey";
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_roleId_fkey";
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_tenantId_fkey";
DROP INDEX "User_tenantId_email_key";
ALTER TABLE "User" DROP COLUMN "emailVerificado", DROP COLUMN "emailVerificadoEm",
                   DROP COLUMN "passwordHash";
DROP TABLE "LoginAttempt";
DROP TABLE "PasswordResetToken";
DROP TABLE "UserInvite";
DROP TABLE "TokenHandoff";
DROP TABLE "TokenVerificacaoEmail";
```

Notas:
- **(a)** `User_email_key` global falha se houver e-mails duplicados entre tenants. Verifiquei a
  BD partilhada actual: **zero duplicados** (os tenants de carga usam `admin@perf-N.mz`). Em
  qualquer outra base, verificar antes.
- Localmente aplica-se de uma vez; o **procedimento** em duas fases exercita-se contra as duas
  instâncias da pilha (gate da fase 2), com instantâneo prévio (ADR-0020).
- Cada linha local pré-existente ganha um `sub` que não corresponde a nenhum utilizador Keycloak —
  essa pessoa deixa de entrar, **que é o comportamento correcto por ADR-0011** (os demo são
  re-seedados com os `sub` fixos: o seed faz `update { keycloakSub }` no upsert por e-mail).
- A minha BD de trabalho (`gespro_identidade`, ver §5) já tem o schema final via `db push` — a
  migração gerada deve ser validada contra a BD partilhada `gespro` ou uma cópia.

## 4. Pedidos a outros agentes

| Para | O quê |
|---|---|
| **w8-anti-abuso** | A rota de registo foi reescrita e **preserva o gancho do captcha antes do Keycloak** (`verificarCaptcha`, comentário «PONTO DE EXTENSÃO» no handler). Falta: fixar Turnstile (`CAPTCHA_PROVIDER`+chaves) e o widget no site. **O site também tem de**: remover o campo `senha` do formulário (`apps/site/src/lib/validations.ts` ainda o envia — é descartado, não rebenta), trocar o redirect pós-registo pela página «verifique o e-mail», e mapear `EMAIL_JA_REGISTADO`. Contrato actualizado em `site-provisionamento.md` §2. |
| **w8-auditoria** | As colunas pedidas (`AuditLog.requestId`, `AuditLog.keycloakSub`, ambas nullable) **já estão no schema** — não precisam de PR de seguimento. O `keycloakSub` do autor está no JWT (`token.keycloakSub`); se quiserem no `ActionCtx`, é uma linha no `safe-action.ts` — digam. |
| **w8-billing** | Sou o dono de `plataforma.prisma` e **não recebi nenhum pedido de modelos** (DocumentoSubscricao, campos fiscais). Quando o fizerem, escrevo-os eu — mandem a definição. |
| **w8-cache** | Podar `handoffLimiter`, `passwordResetLimiter`, `inviteLimiter` e `verificacaoEmailLimiter` de `rate-limiter.ts` (exportados, sem consumidores). O login não precisa de limitador — força bruta é do Keycloak (mapa §4-8). |
| **w8-desempenho (re-medição)** | O 7.º cenário k6 (auth) tem de conduzir o fluxo OIDC contra o Keycloak. **Os utilizadores de carga (`admin@perf-N.mz`) não existem no realm** — o cenário deve usar os 5 demo, ou o gerador de volume ganha um passo de criação via Admin API (posso ajudar). O `senha` do manifesto de volume ficou com um valor-sentinela. |
| **w8-correcoes** | O bug conhecido do molde (`@panel/(.)[id]` captura `novo`) agora morde o E2E `02-requisicao` de forma intermitente na navegação client-side — foi o único vermelho das duas corridas completas da suite. |
| **Orquestrador** | Migração (§3); merge de `w8/integracao` já feito no meu branch; nota de que o job `integration` do CI (Testcontainers) não foi corrido por mim localmente — os testes de integração legados no `pnpm check` correram e estão verdes. |

## 5. Ambiente usado (transparência sobre estado partilhado)

- **BD**: criei `gespro_identidade` na instância Postgres partilhada e apontei o meu
  `apps/erp/.env` (git-ignored) para ela — `migrate deploy` + `db push` + `pnpm db:seed`. **A BD
  partilhada `gespro` não foi tocada** (só leituras: verificação de duplicados e o `migrate diff`).
- **Keycloak**: recreei os contentores `gespro-keycloak`/`gespro-db-init` no projecto `gespro`
  (após o aviso do orquestrador) com o meu compose; **apaguei e reimportei o realm `gespro`**
  (o esqueleto da fase 1 não tinha clientes/utilizadores; o import é IGNORE_EXISTING, portanto
  exigiu delete via admin + restart). O `gespro-mailpit` foi recriado (a rede antiga tinha morrido).
- Antes do aviso, um `docker compose up` meu criou o projecto `w8-identidade` — o orquestrador
  já restaurou; os contentores/volumes órfãos desse projecto foram removidos.

## 6. O que NÃO ficou provado / fora do âmbito

- **CI no GitHub**: os jobs `e2e`/`a11y` alterados não correram num runner real (sem push). O
  desenho segue o ADR (step pós-checkout, health-poll), mas a primeira execução pode precisar de
  afinação de tempos.
- **`pnpm test:integration`** (Testcontainers) não foi corrido por mim; os testes de integração
  legados incluídos no `pnpm check` correram contra a minha BD e estão verdes.
- **Clique no link do e-mail de acções fim-a-fim** (definir palavra-passe no Keycloak e cair no
  dashboard): provei a entrega do e-mail e as acções pendentes; não automatizei o clique (o URL
  do Mailpit é extraível — bom candidato a E2E futuro do fluxo de registo).
- **Produção/fornecedor**: nada de ECS/ALB/Secrets (ADR-0026 mantém tudo local); o realm de
  produção herdará este ficheiro com segredos e URLs por ambiente — os `redirectUris` estão
  hardcoded para localhost:3000/8080 e terão de ser parametrizados quando houver domínio (nota
  para a fase 5).
- A pilha `--profile full` (erp-1/erp-2 atrás do proxy) não foi levantada com a imagem nova —
  o gate «publicação em duas fases contra as 2 instâncias» é do fecho de fase, com a migração.

## 7. Sete deltas — checklist

| Delta | Estado |
|---|---|
| 1. Organizations adiadas (realm simples, sub→User→tenantId) | ✅ |
| 2. `User.email` `@unique` global + mensagem das duas empresas | ✅ (registo, convite e testes) |
| 3. `TokenHandoff` e todo o aparato removidos | ✅ |
| 4. `permsVersion` removido; re-resolução na renovação, nunca por pedido | ✅ |
| 5. `primeiroAcessoEm` + convite idempotente por e-mail | ✅ |
| 6. Durações por ambiente (15 min/8 h/12 h) + E2E de renovação escrevível | ✅ (E2E corre com 8 s) |
| 7. Keycloak no perfil por omissão; CLAUDE.md; CI em steps | ✅ (CI por provar em runner real) |
