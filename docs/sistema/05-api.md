# 5. API HTTP

> **Para quem:** engenheiros que mantêm o ERP, integram com ele ou operam a plataforma.
> **Código:** `apps/erp/src/app/api/**/route.ts` (24 ficheiros), `apps/erp/src/lib/api/with-api.ts`,
> `apps/erp/src/server/safe-action.ts`, `apps/erp/middleware.ts`.

Este capítulo descreve o que o ERP expõe por HTTP e o contrato das Server Actions. Tudo o que está
aqui foi copiado do código deste ramo. Onde o código e os comentários (ou os runbooks) discordam,
**vale o código** e a divergência está listada em [§6](#6-incoerências-conhecidas).

---

## 1. Modelo

### 1.1 Duas portas, duas finalidades

| Necessidade | Mecanismo | Onde |
|---|---|---|
| Mutação a partir da UI | **Server Action** (`createSafeAction`) | `src/server/actions/<modulo>.actions.ts` |
| Leitura de página | Server Component chama o serviço directamente, dentro de `runWithTenantContext` | `src/app/(dashboard)/**/page.tsx` |
| Exportação CSV/XLSX, PDF, download de documentos, webhook, cron, probes, funil público | **Route Handler** (`withApi`) | `src/app/api/**/route.ts` |

**As Server Actions não são uma API pública.** São chamadas pelo React através do protocolo interno do
Next.js (POST para a própria página com o cabeçalho `Next-Action`), o identificador de cada action é
gerado no build e muda entre versões. Não há contrato estável a que um cliente externo se possa ligar.

**Os Route Handlers também não são uma API REST de domínio.** Não há CRUD por HTTP: não se criam
facturas, clientes ou lançamentos por aqui. O que existe é um conjunto fechado de endpoints com uma
finalidade cada — descarregar um ficheiro, receber um evento do Stripe, correr uma tarefa agendada,
responder a uma sonda de saúde, servir o site de marketing.

### 1.2 Pipeline `withApi`

`withApi(handler, opts?)` (`src/lib/api/with-api.ts`) envelopa cada Route Handler:

```ts
interface WithApiOptions {
  permission?: string;        // permissão estática exigida (código do catálogo RBAC)
  public?: boolean;           // sem sessão e sem contexto de tenant (probes, crons, webhook, funil)
  permiteEmLeitura?: boolean; // deixa um método de escrita passar com o tenant em Leitura
}

interface ApiCtx {            // 2.º argumento do handler
  tenantId: string;           // '' em rotas public
  userId: string;             // '' em rotas public
  permissions: Set<string>;
  params: Record<string, string | string[]>; // parâmetros de caminho já resolvidos
}
```

Ordem de execução por pedido:

1. Gera `requestId` (UUID v4) e resolve `params`; normaliza a rota para métricas
   (`/api/faturacao/[id]/pdf`, nunca o id concreto).
2. **Sessão** (salvo `public: true`) — `auth()` do Auth.js; sem utilizador → `UnauthorizedError` (401).
3. **Permissão** — se `opts.permission` estiver definida e não constar de `session.user.permissions`
   → `ForbiddenError` (403).
4. **Modo de leitura** — se `session.user.acesso === 'leitura'`, o método for `POST`, `PUT`, `PATCH`
   ou `DELETE` e a rota não declarar `permiteEmLeitura` → `AcessoLeituraError` (409).
5. **Contexto** — `runWithRequestContext({requestId, tenantId, userId})` e, fora das rotas públicas,
   `runWithTenantContext({tenantId, userId})`, que activa o isolamento multi-tenant da extensão Prisma.
6. **Handler.** A validação de entrada (Zod) acontece **aqui, dentro de cada handler** — `withApi`
   não tem opção `schema`, ao contrário do `createSafeAction`. Handlers com permissão dinâmica
   (por módulo ou por recurso) verificam-na também aqui, com `ctx.permissions.has(...)`.
7. Regista `request start`/`request end` (logger estruturado), métricas RED (`recordRequest`) e
   `http_requests_total`/`http_request_duration_ms` (`recordHttpRequest`).
8. Acrescenta o cabeçalho **`x-request-id`** a todas as respostas, incluindo as de erro.

Qualquer excepção lançada pelo handler é apanhada: um `AppError` é traduzido para o envelope de erro
com o seu `status`; qualquer outra coisa vira `ERRO_INTERNO` (500), com a stack **só** no log do
servidor.

### 1.3 Envelope de resposta

Sucesso (convenção; ver as excepções em §6):

```json
{ "data": { "...": "..." } }
```

Erro — é exactamente o que o `catch` do `withApi` produz:

```json
{
  "error": {
    "code": "VALIDACAO",
    "message": "Parâmetros mes/ano inválidos",
    "details": { "formErrors": [], "fieldErrors": { "mes": ["Mês inválido"] } }
  }
}
```

`details` só aparece quando o erro o traz (em `VALIDACAO` é o `error.flatten()` do Zod). Um erro
inesperado chega assim, com `HTTP 500`:

```json
{ "error": { "code": "ERRO_INTERNO", "message": "Erro interno" } }
```

**traceId.** No `withApi`, o identificador de correlação é o cabeçalho `x-request-id`; o corpo do
500 **não** leva `traceId` (ao contrário do `createSafeAction`, que o põe em `error.details.traceId`).
A única rota que escreve `traceId` no corpo é `POST /api/publico/registo`, por contrato com o site.
Procurar nos logs: `requestId = <valor do x-request-id>`.

### 1.4 Hierarquia `AppError` → HTTP

`src/lib/errors.ts`:

| Classe | `code` | HTTP | Mensagem por omissão |
|---|---|---|---|
| `AppError` (base) | livre | 400 por omissão, ou o que o construtor receber | — |
| `ValidationError` | `VALIDACAO` | 422 | «Dados inválidos» |
| `UnauthorizedError` | `NAO_AUTENTICADO` | 401 | «Não autenticado» |
| `ForbiddenError` | `SEM_PERMISSAO` | 403 | «Sem permissão para esta operação» |
| `NotFoundError` | `NAO_ENCONTRADO` | 404 | «Recurso não encontrado» |
| `AcessoLeituraError` | `ACESSO_LEITURA` | 409 | «A sua subscrição terminou e a conta está em modo de leitura. Pode consultar e exportar tudo o que é seu; para voltar a gravar, subscreva um plano.» |
| `BusinessRuleError` | código estável do domínio (`TRANSICAO_INVALIDA`, `STOCK_INSUFICIENTE`, …) | 409 | — |
| (qualquer outro erro) | `ERRO_INTERNO` | 500 | «Erro interno» |

Regras que importam a quem consome:

- **Cross-tenant é 404, nunca 403.** Um id de outra empresa responde exactamente como um id
  inexistente.
- **`ACESSO_LEITURA` é 409, não 403**: não é falta de permissão, é o estado da subscrição. A UI usa o
  código para mostrar o caminho de saída.
- Há `AppError` com status próprio fora da tabela, p. ex. `STRIPE_WEBHOOK_NAO_CONFIGURADO` (503) em
  `src/server/billing/stripe-client.ts`.

### 1.5 Recusa em modo de leitura (`ACESSO_LEITURA`)

Uma `Assinatura` que sai de `TRIAL`/`ATIVA` passa 30 dias em `LEITURA` (ADR-0027 §6, ADR-0032).
A sessão abre; a escrita não passa. No `withApi`:

- `GET` passa sempre — **exportar nunca se trava** (ticket #33).
- Rotas `public` não têm sessão, logo não há estado de acesso a verificar: o webhook do Stripe e os
  crons continuam a escrever (é assim que o cliente sai da Leitura).
- Hoje só **duas** rotas autenticadas têm método de escrita e ficam, portanto, bloqueadas em Leitura:
  `POST /api/documentos/presign` e `PUT /api/documentos/local/{key}`. Nenhuma declara
  `permiteEmLeitura`.
- O estado vem de `session.user.acesso`, re-resolvido no intervalo do ADR-0011 — nunca se lê a
  `Assinatura` por pedido.

### 1.6 Limitação de tráfego

Porta em `src/server/security/rate-limiter.ts`; adaptador escolhido por `RATE_LIMIT_DRIVER`
(`memory` por omissão, por processo; `valkey` partilhado entre instâncias, exige `VALKEY_URL`).
A resposta 429 padrão (`rateLimitedResponse`) é:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 37

{"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Demasiados pedidos. Tente mais tarde."}}
```

Limitadores usados por Route Handlers:

| Limitador | Janela / máximo | Falha do Valkey | Chave | Onde |
|---|---|---|---|---|
| `exportLimiter` | 10 / 1 min | aberta | `${userId}::export` | `reconciliacao/periodos/[id]/export`, `rh/payroll/[id]/recibo`, `rh/payroll/mapas/inss`, `rh/payroll/mapas/irps` (balde **partilhado** pelas quatro) |
| `presignLimiter` | 30 / 1 min | aberta | `${userId}::presign` | `documentos/presign` |
| `registoLimiter` | 3 / 1 h | **fechada** | `${ip}::registo` e depois `${email}::registo` | `publico/registo` (dentro de `registarTenant`) |
| `verificacaoEmailLimiter` | 20 / 15 min | aberta | `${ip}::verificar-email` | `publico/verificar-email` |
| `webhookLimiter` | 100 / 1 min | aberta | `${ip}::stripe-webhook` | `webhooks/stripe` |
| `loginLimiter` | 10 / 15 min (conta falhas) | aberta | `${ip}::login` e `${identificador}::login` | `api/auth/*` (`authorize` do provider Credentials, `src/lib/auth.ts`) |

O IP sai de `x-forwarded-for` (primeiro valor) ou `x-real-ip`; sem nenhum, `unknown`. **Não** têm
limitação: `export/[modulo]`, `faturacao/[id]/pdf`, `financas/iva/mapas/[periodo]`, `audit`,
`documentos/[id]/download`. (Os limitadores `inviteLimiter`, `extractoLimiter` e
`reenvioVerificacaoLimiter` existem mas são usados por Server Actions.)

### 1.7 CORS

`src/lib/api/cors.ts` — só é usado pelas rotas do funil público (`publico/planos`, `publico/registo`).

- Allowlist em `ALLOWED_ORIGINS` (lista separada por vírgulas). **Nunca** emite
  `Access-Control-Allow-Origin: *`.
- Origem na allowlist → `Access-Control-Allow-Origin: <origem>`; fora dela, o cabeçalho não sai e o
  browser bloqueia. `Vary: Origin` e `Access-Control-Max-Age: 86400` saem sempre.
- `Access-Control-Allow-Credentials: true` só quando o chamador não passa `credentials: false`
  (as duas rotas públicas passam `false` no método principal).
- Omissões: métodos `GET, POST, OPTIONS`; cabeçalhos `Content-Type, Authorization, X-Requested-With`.
  O registo anuncia `Content-Type, Idempotency-Key`.
- As rotas autenticadas não emitem CORS: só respondem à mesma origem.

### 1.8 Middleware e `PUBLIC_PATHS`

`apps/erp/middleware.ts` corre em todos os pedidos excepto `_next/static`, `_next/image` e
`favicon.ico`. É o **único** dono dos cabeçalhos de segurança (CSP com nonce, HSTS, X-Frame,
nosniff, Referrer, Permissions) e dos caminhos públicos. Para qualquer caminho **fora** de
`PUBLIC_PATHS` sem JWT válido do Auth.js, responde

```http
HTTP/1.1 307 Temporary Redirect
Location: /auth/login?callbackUrl=%2Fapi%2Faudit
```

— **antes** de o handler correr. Na prática, um cliente sem sessão que chame uma rota autenticada
recebe 307, não o 401 do `withApi` (que só se vê com um cookie presente mas inválido para `auth()`).

`PUBLIC_PATHS` (correspondência por prefixo, `startsWith`):

```
/auth/            /api/auth/
/api/health       /api/ready          /api/metrics
/api/publico/registo   /api/publico/planos   /api/publico/verificar-email
/api/webhooks/stripe
/registo
/api/cron/
/contactos        /_next/             /favicon.ico
```

Uma rota nova que tenha de responder sem sessão **tem** de entrar aqui; senão as sondas e os
agendadores recebem 307 em vez de 200.

### 1.9 Autenticação por credencial própria

| Mecanismo | Rotas | Como |
|---|---|---|
| Sessão Auth.js (cookie JWT) + permissão | todas as de negócio | `withApi` sem `public` |
| `Authorization: Bearer <CRON_SECRET>` | `/api/cron/*` | comparação simples no handler; `CRON_SECRET` ausente → 401 sempre |
| `Authorization: Bearer <METRICS_SECRET>` | `/api/metrics` | comparação timing-safe (SHA-256 dos dois lados); **sem `METRICS_SECRET` o endpoint fica aberto** |
| `Stripe-Signature` | `/api/webhooks/stripe` | `stripe.webhooks.constructEvent` sobre o corpo cru com `STRIPE_WEBHOOK_SECRET` |
| Token HMAC-SHA256 na query (`?t=`) | `/api/publico/verificar-email` | `EMAIL_VERIFY_SECRET`, prazo de 24 h na carga assinada |
| Nenhuma (+ captcha, limite, `Idempotency-Key`) | `/api/publico/registo`, `/api/publico/planos`, `/api/health`, `/api/ready` | — |

---

## 2. Tabela-resumo

| Método | Caminho | Autenticação | Finalidade |
|---|---|---|---|
| GET | `/api/audit` | sessão + `admin:ver_auditoria` | Trilho de auditoria paginado |
| GET, POST | `/api/auth/[...nextauth]` | público (Auth.js) | Sessão: login por credenciais, CSRF, sessão, logout |
| GET | `/api/cron/abrir-exercicio` | `CRON_SECRET` | Abre exercício contabilístico por tenant |
| GET | `/api/cron/expirar-registos-nao-verificados` | `CRON_SECRET` | Expurga registos públicos não verificados (> 7 dias) |
| GET | `/api/cron/expirar-trials` | `CRON_SECRET` | Ciclo de vida das subscrições (Trial → Leitura → Fechada) |
| GET | `/api/cron/reconciliar-identidades` | `CRON_SECRET` | Reporta divergências Keycloak ↔ `User` |
| GET | `/api/cron/transporte-alertas` | `CRON_SECRET` | Recalcula estado dos documentos de frota e notifica |
| GET | `/api/documentos/[id]/download` | sessão + permissão dinâmica por recurso | Redirecciona para URL assinada (300 s) |
| PUT, GET | `/api/documentos/local/[...key]` | sessão (só `STORAGE_DRIVER=local`) | Backend de armazenamento local (dev/CI) |
| POST | `/api/documentos/presign` | sessão + permissão dinâmica por recurso | Assina upload directo para o armazenamento |
| GET | `/api/export/[modulo]` | sessão + permissão dinâmica por módulo | Exportação CSV/XLSX genérica |
| GET | `/api/faturacao/[id]/pdf` | sessão + `faturacao:ver` | PDF fiscal da factura |
| GET | `/api/financas/iva/mapas/[periodo]` | sessão + `financas:iva:mapas` | Mapas de suporte ao IVA (CSV) |
| GET | `/api/health` | público | Liveness |
| GET | `/api/metrics` | `METRICS_SECRET` (se definido) | Métricas Prometheus |
| GET, OPTIONS | `/api/publico/planos` | público (CORS) | Catálogo de planos para o site |
| POST, OPTIONS | `/api/publico/registo` | público (CORS, captcha, `Idempotency-Key`) | Registo self-service de uma empresa |
| GET | `/api/publico/verificar-email` | token HMAC na query | Confirma o e-mail do administrador |
| GET | `/api/ready` | público | Readiness (`SELECT 1`) |
| GET | `/api/reconciliacao/periodos/[id]/export` | sessão + `financas:banca:reconciliacao` | Mapa de fecho da reconciliação bancária |
| GET | `/api/rh/payroll/[id]/recibo` | sessão + `rh:payroll:read` | Recibo de vencimento em PDF |
| GET | `/api/rh/payroll/mapas/inss` | sessão + `rh:payroll:read` | Mapa mensal INSS (CSV) |
| GET | `/api/rh/payroll/mapas/irps` | sessão + `rh:payroll:read` | Mapa mensal IRPS (CSV) |
| POST | `/api/webhooks/stripe` | assinatura Stripe | Reconciliação do estado da subscrição |

Nos exemplos abaixo, `$ERP` é a origem do ERP (localmente `http://localhost:3000`, ou
`http://localhost:8080` atrás do proxy da pilha completa) e `$COOKIE` é o cookie de sessão do Auth.js
copiado de um browser autenticado (`authjs.session-token=…`; em HTTPS, `__Secure-authjs.session-token`).

---

## 3. Endpoints

### 3.1 Sessão

#### `GET, POST /api/auth/[...nextauth]`

`src/app/api/auth/[...nextauth]/route.ts` — reexporta `handlers` do Auth.js v5 (`src/lib/auth.ts`).
**Não** passa pelo `withApi` (não tem `x-request-id` nem métricas RED do pipeline).

- **Provider:** um só, `Credentials` (Direct Access Grant ao Keycloak, ADR-0029), com os campos
  `identificador` e `palavraPasse`. O formulário é nosso (`/auth/login`) e chama
  `signIn('credentials', …)` do cliente Auth.js; não há salto para o domínio do Keycloak.
- **Sessão:** `strategy: 'jwt'`, `maxAge` = tecto *SSO Session Max* do Keycloak; `pages.signIn =
  '/auth/login'`, `pages.error = '/auth/erro'`.
- **Limitação:** `loginLimiter` (ver §1.6) — conta **falhas**, não tentativas.
- **Sub-rotas úteis:** as do Auth.js (`/api/auth/csrf`, `/api/auth/session`,
  `/api/auth/callback/credentials`, `/api/auth/signout`). O contrato é o da biblioteca, não nosso.

```bash
# Ver a sessão corrente (JSON do Auth.js; {} ou null sem sessão)
curl -s "$ERP/api/auth/session" -H "Cookie: $COOKIE"
```

### 3.2 Auditoria

#### `GET /api/audit`

Trilho de auditoria do tenant, paginado por cursor. Lê `AuditLog` com `prismaBase` e filtro explícito
por `tenantId`.

| | |
|---|---|
| Permissão | `admin:ver_auditoria` (estática, no `withApi`) |
| Query | `cursor` — id do último registo da página anterior · `take` — tamanho da página, omissão `20`, tecto `100` · `entity` — filtra por entidade · `userId` — filtra por autor |
| Validação | nenhuma (sem Zod): os parâmetros são lidos em bruto |
| Sucesso | `200 application/json` — `{ "data": { "items": [...], "nextCursor": "<id>" \| null } }` |

Cada item: `id`, `entity`, `entityId`, `action`, `data`, `ip`, `createdAt`, `userId`,
`user: { id, nome, email }`. Ordenação `createdAt desc`. `nextCursor` é `null` na última página.

Erros: 403 `SEM_PERMISSAO`; um `take` não numérico chega ao Prisma como `NaN` e termina em 500.

```bash
curl -s "$ERP/api/audit?entity=Fatura&take=50" -H "Cookie: $COOKIE"
# página seguinte
curl -s "$ERP/api/audit?entity=Fatura&take=50&cursor=cm9x2k1a80001qz0g7h3l5b2d" -H "Cookie: $COOKIE"
```

### 3.3 Tarefas agendadas (`/api/cron/*`)

Contrato comum (horários, operação e resolução de falhas: **[runbook do agendador](../runbooks/agendador.md)**;
horários em `infra/local/cron/crontab`, chamada em `infra/local/cron/chamar.sh`):

- **Método** `GET`; **autenticação** `Authorization: Bearer <CRON_SECRET>`. Sem o cabeçalho, com
  valor errado **ou com `CRON_SECRET` por definir no servidor** →
  `401 {"error":{"code":"NAO_AUTENTICADO","message":"Token inválido."}}`.
- Estão em `PUBLIC_PATHS` (prefixo `/api/cron/`): o middleware não os redirecciona; a credencial é
  verificada dentro do handler.
- **Idempotentes**: repetir uma corrida tem o mesmo efeito que corrê-la uma vez.
- Falha inesperada → `500 {"error":{"code":"ERRO_INTERNO","message":"Erro no processamento do cron."}}`
  (reconciliar-identidades: `"Erro na reconciliação."`).
- Só dois dos cinco passam pelo `withApi` (`public: true`): `abrir-exercicio` e
  `expirar-registos-nao-verificados`. Os outros três são funções `GET` nuas — sem `x-request-id` nem
  métricas `http_requests_total`.
- Uma rota `/api/cron/*` nova tem de entrar no crontab **e** no runbook, ou não corre em lado nenhum.

| Rota | Crontab local (UTC) |
|---|---|
| `abrir-exercicio` | `0 2 * * *` |
| `expirar-trials` | `0 3 * * *` |
| `expirar-registos-nao-verificados` | `10 3 * * *` |
| `reconciliar-identidades` | `15 3 * * *` |
| `transporte-alertas` | `30 3 * * *` |

#### `GET /api/cron/abrir-exercicio`

Abertura do exercício contabilístico (ADR-0033 §3). `withApi({ public: true })`, `runtime = 'nodejs'`.

- **Candidatos:** tenants com `deletedAt = null` e `Assinatura.estado` em `TRIAL`, `ATIVA` ou
  `LEITURA`.
- **Sem `?ano`:** para cada tenant, lê `ConfiguracaoFiscal` (`aberturaExercicioAutomatica`,
  `diaAberturaExercicio`, `mesAberturaExercicio`; por omissão `true`, `1`, `12`). Se a abertura
  automática estiver desligada salta (`saltou: 'config'`); se hoje, em `Africa/Maputo`, não for o
  dia/mês configurado salta (`saltou: 'data'`). Caso contrário chama `abrirExercicio` para o ano
  civil corrente em Maputo **e** para o seguinte.
- **Com `?ano=AAAA`:** força a abertura desse ano em todos os candidatos, ignorando configuração e
  data. Caminho de recuperação.
- **Efeito:** `ExercicioContabil` + 13 `PeriodoContabil` + séries de documento, com `userId: 'cron'`.
  Idempotente por `@@unique([tenantId, codigo])`. A falha de um tenant não pára os outros: fica em
  `resultados[].erro`.

| | |
|---|---|
| Query | `ano` (opcional) — inteiro entre 2020 e 2099 |
| Erros | 401 `NAO_AUTENTICADO` · 400 `ANO_INVALIDO` («O ano tem de ser um inteiro entre 2020 e 2099.») |
| Sucesso | `200 application/json` |

```json
{
  "data": {
    "anoForcado": null,
    "anoMaputo": 2026,
    "totalTenants": 3,
    "nOk": 1, "nErro": 0, "nSaltouConfig": 0, "nSaltouData": 2,
    "resultados": [
      { "tenantId": "…", "slug": "demo", "seriesCriadas": 14 },
      { "tenantId": "…", "slug": "acme", "seriesCriadas": 0, "saltou": "data" }
    ],
    "timestamp": "2026-12-01T02:00:00.412Z"
  }
}
```

```bash
curl -s "$ERP/api/cron/abrir-exercicio" -H "Authorization: Bearer $CRON_SECRET"
# recuperação: forçar 2027 em todos os tenants
curl -s "$ERP/api/cron/abrir-exercicio?ano=2027" -H "Authorization: Bearer $CRON_SECRET"
```

#### `GET /api/cron/expirar-registos-nao-verificados`

Expurgo de tenants criados há mais de 7 dias cujo administrador nunca confirmou o e-mail (ADR-0016
Camada 4), em Postgres e no Keycloak (`expurgarRegistosNaoVerificados`,
`src/server/services/plataforma/expurgo.service.ts`). `withApi({ public: true })`.

Sucesso `200`:

```json
{ "data": { "elegiveisEncontrados": 2, "expurgados": 2, "falhas": 0, "timestamp": "2026-09-24T03:10:00.118Z" } }
```

```bash
curl -s "$ERP/api/cron/expirar-registos-nao-verificados" -H "Authorization: Bearer $CRON_SECRET"
```

#### `GET /api/cron/expirar-trials`

Ciclo de vida das subscrições (ADR-0032), `processarCicloDeVida()` em
`src/server/services/plataforma/assinatura.service.ts`. Três pernas numa corrida: fim do Trial →
Leitura; aviso a 7 dias do fecho; fim da Leitura → Fechada. Nada se apaga. Para o Trial o motor
primário é o Stripe e isto é rede de segurança; para o fecho da Leitura **é o único mecanismo**.
Idempotente por compare-and-set dentro das transições. **Sem `withApi`.**

Sucesso `200`:

```json
{ "data": { "trialsEmLeitura": 1, "fechadas": 0, "avisos": 2, "avaliadas": 3, "timestamp": "2026-09-24T03:00:00.051Z" } }
```

```bash
curl -s "$ERP/api/cron/expirar-trials" -H "Authorization: Bearer $CRON_SECRET"
```

#### `GET /api/cron/reconciliar-identidades`

Compara os utilizadores do realm `gespro` com os `User` locais e **reporta** divergências nas duas
direcções — nunca repara (ADR-0013 §3). `reconciliarIdentidades()` em
`src/server/auth/reconciliacao.ts`. **Sem `withApi`.**

Sucesso `200`:

```json
{
  "data": {
    "keycloakSemLocal": 0,
    "localSemKeycloak": 1,
    "sinteticosIgnorados": 0,
    "totalKeycloak": 12,
    "totalLocal": 13,
    "alerta": true,
    "timestamp": "2026-09-24T03:15:02.730Z"
  }
}
```

`localSemKeycloak > 0` significa utilizadores que **não conseguem entrar**.

```bash
curl -s "$ERP/api/cron/reconciliar-identidades" -H "Authorization: Bearer $CRON_SECRET"
```

#### `GET /api/cron/transporte-alertas`

Para cada tenant: recalcula `EstadoDocumento` (`VALIDO` / `PROXIMO_EXPIRAR` / `EXPIRADO`) de
`DocumentoViatura` e `DocumentoMotorista` (`recalcularEstadosDocumentos`), gera alertas
(`gerarAlertasDocumentos`) e emite notificações via `notificacaoService.emitir` para os
utilizadores activos com a permissão `transporte:viatura:listar`. Uma notificação falhada por
utilizador é ignorada. **Sem `withApi`**; regista com `console.log`/`console.error`, não com o logger
estruturado.

Sucesso `200`:

```json
{
  "data": {
    "tenants": 3,
    "totalViaturasActualizadas": 4,
    "totalMotoistasActualizados": 1,
    "totalNotificacoesEmitidas": 6,
    "resultados": [
      { "tenantId": "…", "slug": "demo", "viaturasActualizadas": 4, "motoistasActualizados": 1, "notificacoesEmitidas": 6 }
    ],
    "timestamp": "2026-09-24T03:30:00.905Z"
  }
}
```

(A grafia `motoistas` é a do código — é contrato de resposta.)

```bash
curl -s "$ERP/api/cron/transporte-alertas" -H "Authorization: Bearer $CRON_SECRET"
```

### 3.4 Documentos anexos (armazenamento de objectos)

Configuração comum em `src/lib/storage/documento-config.ts`:

| Recurso | Permissão exigida (upload **e** download) |
|---|---|
| `fornecedor` | `fornecedores:editar` |
| `ativo` | `ativos:write` |
| `viatura` | `transporte:viatura:documentos` |
| `motorista` | `transporte:motorista:documentos` |
| `colaborador` | `rh:colaboradores:update` |

- Tamanho máximo: `MAX_DOCUMENTO_BYTES` = 10 MB.
- Tipos permitidos: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `.docx`
  (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`), `.xlsx`
  (`…spreadsheetml.sheet`), `.pptx` (`…presentationml.presentation`), `text/plain`.
- A key é sempre derivada no servidor: `tenant/<tenantId>/<recurso>/<recursoId>/<uuid>-<nome-sanitizado>`.
  O cliente nunca envia key nem prefixo.
- Driver por `STORAGE_DRIVER`: `s3` (URLs assinadas pelo SDK da AWS) ou `local` (URLs relativas para
  `/api/documentos/local/...`).

Fluxo de upload (`src/components/patterns/upload-documento.tsx`): `POST /api/documentos/presign` →
`PUT <uploadUrl>` com `requiredHeaders` → Server Action de registo com `urlRef` (ou `key`).

#### `POST /api/documentos/presign`

| | |
|---|---|
| Permissão | dinâmica: `PERMISSAO_ESCRITA_POR_RECURSO[recurso]`, verificada no handler |
| Leitura | **bloqueado** (método de escrita, sem `permiteEmLeitura`) → 409 `ACESSO_LEITURA` |
| Limitação | `presignLimiter`, 30/min, chave `${userId}::presign` |
| Corpo (`PresignSchema`) | `recurso`: enum `fornecedor \| ativo \| viatura \| motorista \| colaborador` · `recursoId`: `z.string().cuid()` · `nome`: string 1–200 · `contentType`: enum dos tipos permitidos · `tamanho`: inteiro positivo ≤ 10 485 760 |
| Sucesso | `200 application/json` — **sem** envelope `data` |

```json
{
  "uploadUrl": "https://<bucket>.s3.<região>.amazonaws.com/tenant/…?X-Amz-Signature=…",
  "key": "tenant/cm9…/fornecedor/cm9…/5b1f…-alvara-2026.pdf",
  "requiredHeaders": { "Content-Type": "application/pdf" },
  "urlRef": "gestpro-storage:tenant/cm9…/fornecedor/cm9…/5b1f…-alvara-2026.pdf"
}
```

A URL de `PUT` do S3 expira em 60 s e assina o `Content-Type`: o cliente **tem** de reenviar
`requiredHeaders`. Com o driver local, `uploadUrl` é `/api/documentos/local/<key>`.

Erros: 422 `VALIDACAO` («Pedido de upload inválido», com `details`) · 403 `SEM_PERMISSAO` ·
429 `RATE_LIMIT_EXCEEDED` · 409 `ACESSO_LEITURA`. Sem efeitos persistentes (só emite a assinatura e
regista `presign emitido` no log).

```bash
curl -s -X POST "$ERP/api/documentos/presign" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '{"recurso":"fornecedor","recursoId":"cm9x2k1a80001qz0g7h3l5b2d","nome":"Alvará 2026.pdf","contentType":"application/pdf","tamanho":284113}'
```

#### `GET /api/documentos/[id]/download`

Encontra o metadado do documento **no tenant do contexto**, verifica a permissão do recurso, confirma
que a key vive sob `tenant/<tenantId>/` e redirecciona para uma URL assinada de 300 s. Regista o
acesso no log.

| | |
|---|---|
| Caminho | `id` — id do registo de metadados (`DocumentoFornecedor`, `DocumentoAtivo`, `DocumentoViatura` ou `DocumentoMotorista`) |
| Query | `recurso` (opcional) — `fornecedor \| ativo \| viatura \| motorista`; sem ele procura nas quatro tabelas por esta ordem. `colaborador` não tem tabela: não há download para esse recurso |
| Permissão | dinâmica: `PERMISSAO_ESCRITA_POR_RECURSO[recurso]` |
| Sucesso | `302 Found`, `Location: <URL assinada>` (driver local: URL absoluta para `/api/documentos/local/<key>`). Registos legados com `url` http(s) e sem key → `302` para essa URL |

Erros: 404 `NAO_ENCONTRADO` («Documento não encontrado» — inclui outro tenant e key fora do prefixo
do tenant; «Documento sem ficheiro associado») · 403 `SEM_PERMISSAO`.

```bash
curl -s -o alvara.pdf -L "$ERP/api/documentos/cm9x2p7q10004qz0gd1ke8r3a/download?recurso=fornecedor" \
  -H "Cookie: $COOKIE"
```

#### `PUT, GET /api/documentos/local/[...key]`

Faz de S3 em desenvolvimento e CI. **Só responde com `STORAGE_DRIVER=local`**; com `s3` devolve 404.
Exige sessão (não está em `PUBLIC_PATHS`). A key (todos os segmentos do caminho) não pode conter `..`
e tem de começar por `tenant/<tenantId-do-contexto>/`; senão 404.

- **`PUT`** — corpo binário, ≤ 10 MB (senão 422 `VALIDACAO` «Ficheiro excede o tamanho máximo»);
  grava com o `Content-Type` do pedido (omissão `application/octet-stream`). Resposta `200` sem corpo.
  Bloqueado em Leitura (409 `ACESSO_LEITURA`). Não verifica a permissão do recurso — confia na key
  emitida pelo presign.
- **`GET`** — devolve os bytes com o `Content-Type` gravado e `Cache-Control: no-store`
  (sem `Content-Disposition`). 404 «Objeto não encontrado».

```bash
curl -s -X PUT "$ERP/api/documentos/local/tenant/cm9…/fornecedor/cm9…/5b1f…-alvara-2026.pdf" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/pdf" --data-binary @alvara.pdf
```

### 3.5 Exportações e documentos fiscais

Todos são `GET`, logo passam em modo de leitura. Os CSV têm BOM UTF-8, separador `;` e fim de linha
`\r\n` (abrem directamente no Excel pt-PT); os valores `Decimal` saem como string com ponto decimal,
sem perda.

#### `GET /api/export/[modulo]`

Exportação genérica pelo registo `EXPORT_REGISTRY` (`src/server/services/plataforma/export.service.ts`).
Os builders lêem pelos serviços de domínio, reúnem páginas de 100 por cursor até **5000 linhas** e
truncam aí.

| `modulo` | Permissão | Parâmetros extra | Ficheiro |
|---|---|---|---|
| `clientes` | `clientes:ver` | — | `clientes.csv` / `.xlsx` |
| `producao-ordens` | `producao:ordens:read` | `status` (opcional): `PLANEADA \| LIBERADA \| EM_PRODUCAO \| CONCLUIDA \| CANCELADA \| PAUSADA` | `ordens-producao.*` |
| `cliente-historico` | `clientes:ver` | `clienteId` (**obrigatório**) | `historico-cliente-<clienteId>.*` |

| | |
|---|---|
| Query comum | `formato` — `csv` (omissão) ou `xlsx` |
| Sucesso CSV | `200 text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<nome>.csv"`, `Cache-Control: no-store` |
| Sucesso XLSX | `200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="<nome>.xlsx"` |

Erros: 404 `NAO_ENCONTRADO` (`Módulo de exportação "<modulo>" não encontrado`) · 403 `SEM_PERMISSAO`
· 422 `VALIDACAO` («Formato inválido — use csv ou xlsx»; `Parâmetro status inválido — valores: …`;
«Parâmetro clienteId é obrigatório»). Sem limitação de tráfego.

```bash
curl -s -OJ "$ERP/api/export/producao-ordens?formato=xlsx&status=EM_PRODUCAO" -H "Cookie: $COOKIE"
```

#### `GET /api/faturacao/[id]/pdf`

PDF fiscal (MZ) de uma factura, renderizado com `@react-pdf/renderer` em runtime Node a partir do
documento **emitido** (`obterModeloFatura`; nunca recalcula).

| | |
|---|---|
| Permissão | `faturacao:ver` |
| Caminho | `id` — id da `Fatura` |
| Sucesso | `200 application/pdf`, `Content-Disposition: attachment; filename="<designacao>-<numero>.pdf"` (normalizado por `safeFilename`: sem acentos, minúsculas, `[^a-z0-9._-]` → `-`; p. ex. `factura-fat-2026-000007.pdf`), `Cache-Control: no-store` |
| Erros | 404 «Factura não encontrada» (inclui outro tenant) · 403 |

`designacao` sai da série: `Factura`, `Recibo`, `Nota de Crédito`, `Nota de Débito`,
`Factura Pró-forma`, `Cotação` (ou `Documento`).

```bash
curl -s -OJ "$ERP/api/faturacao/cm9x3a0b20007qz0g1c4n6m8p/pdf" -H "Cookie: $COOKIE"
```

#### `GET /api/financas/iva/mapas/[periodo]`

Mapas de suporte ao cumprimento do IVA (ADR-0034 §8), gerados a partir do `ApuramentoIva` gravado
(o mais recente em `APURADO` ou `DECLARADO`), nunca recalculados.

| | |
|---|---|
| Permissão | `financas:iva:mapas` |
| Caminho + query (`ObterMapaIvaSchema`) | `periodo`: `/^\d{4}-\d{2}$/` («Período deve estar no formato AAAA-MM») · `tipo`: `declaracao` (omissão) \| `clientes` \| `fornecedores` \| `antiguidade` |
| Pré-condição | existir `PeriodoContabil` com esse `codigo` **e** um apuramento `APURADO`/`DECLARADO` para ele — também para `antiguidade`, que em si não depende do período |

| `tipo` | Colunas | `Content-Disposition` |
|---|---|---|
| `declaracao` | `Conta;Nome;Lado;BaseImponivel;Taxa;Imposto;Divergencia` + linhas de totais (IVA liquidado, IVA dedutível, saldo). Cabeçalhos extra `X-Mapa-Tipo: declaracao`, `X-Apuramento-Estado: <estado>` | `mapa-iva-declaracao-<idDoApuramento>-v<versao>.csv` |
| `clientes` | `Numero;Data;NUIT;AvNUIT;BaseImponivel;IVA;Total` — facturas `EMITIDA`, `PAGA`, `PARCIALMENTE_PAGA`, `VENCIDA` do período; `AvNUIT` avisa quando o NUIT é o actual do cliente e não o congelado no documento | `mapa-iva-clientes-<periodo>.csv` |
| `fornecedores` | `NumeroDocumento;Data;NUIT;TipoAquisicao;Base;Taxa;IVA` — `ContaPagar` do período com `baseIva` preenchida | `mapa-iva-fornecedores-<periodo>.csv` |
| `antiguidade` | `Periodo;DataInicio;SaldoOriginal;Estado;DeclaradoEm` — apuramentos com saldo a recuperar (todos os períodos) | `mapa-iva-antiguidade.csv` |

Sucesso `200 text/csv; charset=utf-8`. Erros: 422 `VALIDACAO` («Parâmetros inválidos») · 404
`Período <AAAA-MM> não encontrado` · 404 `Não existe apuramento de IVA para o período <AAAA-MM>.
Execute o apuramento primeiro.` · 403.

```bash
curl -s -OJ "$ERP/api/financas/iva/mapas/2026-08?tipo=clientes" -H "Cookie: $COOKIE"
```

#### `GET /api/reconciliacao/periodos/[id]/export`

Mapa de fecho de um período de reconciliação bancária (RF §17). A permissão é a de reconciliar, não a
de leitura financeira (ADR-0038): exportar expõe o mesmo que fazer.

| | |
|---|---|
| Permissão | `financas:banca:reconciliacao` |
| Limitação | `exportLimiter`, `${userId}::export` |
| Caminho | `id` — id do período de reconciliação |
| Query | `formato` — `csv` (omissão) ou `xlsx` |
| Conteúdo | metadados (`Estado`; `Mapa` = «gravado no fecho» ou «calculado no momento da exportação»; `Justificação` se houver) e 12 rubricas `Rubrica;Valor` (saldo inicial, movimentos, reconciliados, em trânsito, por contabilizar, diferenças, saldos finais, diferença residual) |
| Sucesso | como `exportResponse`: `Content-Disposition: attachment; filename="reconciliacao-<id>.csv"` (ou `.xlsx`), `Cache-Control: no-store` |
| Erros | 404 «Período de reconciliação não encontrado» · 422 formato · 429 · 403 |

```bash
curl -s -OJ "$ERP/api/reconciliacao/periodos/cm9x4d8e30011qz0g0f9b2h1k/export?formato=csv" -H "Cookie: $COOKIE"
```

#### `GET /api/rh/payroll/[id]/recibo`

Recibo de vencimento em PDF (Spec 06), gerado por `gerarPdf` (`src/lib/pdf/simple-pdf.ts`, sem
`@react-pdf`) a partir de `PayrollService.obterRecibo`.

| | |
|---|---|
| Permissão | `rh:payroll:read` |
| Limitação | `exportLimiter`, `${userId}::export` |
| Caminho | `id` — id do `Payroll` (linha de um colaborador) |
| Sucesso | `200 application/pdf`, `Content-Disposition: attachment; filename="recibo-<codigoColaborador>-<AAAA>-<MM>.pdf"` (sem `Cache-Control`) |
| Erros | 404 · 429 · 403 |

```bash
curl -s -OJ "$ERP/api/rh/payroll/cm9x5f2g40013qz0g8a7c1d3e/recibo" -H "Cookie: $COOKIE"
```

#### `GET /api/rh/payroll/mapas/inss` e `GET /api/rh/payroll/mapas/irps`

Mapas mensais para submissão às autoridades (Spec 06), a partir de `PayrollService.mapaMensal`.

| | |
|---|---|
| Permissão | `rh:payroll:read` |
| Limitação | `exportLimiter`, `${userId}::export` |
| Query (`ProcessarFolhaSchema`) | `mes`: inteiro 1–12 («Mês inválido») · `ano`: inteiro 2020–2100 («Ano inválido»); ambos com `z.coerce.number()` |
| INSS | colunas `Codigo;Nome;NUIT;NISS;SalarioBruto;INSS_Trabalhador_3;INSS_Entidade_4;INSS_Total`; ficheiro `mapa-inss-<AAAA>-<MM>.csv` |
| IRPS | colunas `Codigo;Nome;NUIT;SalarioBruto;IRPS_Retido`; ficheiro `mapa-irps-<AAAA>-<MM>.csv` |
| Sucesso | `200 text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="…"` |
| Erros | 422 `VALIDACAO` («Parâmetros mes/ano inválidos») · 429 · 403 |

```bash
curl -s -OJ "$ERP/api/rh/payroll/mapas/inss?mes=8&ano=2026" -H "Cookie: $COOKIE"
curl -s -OJ "$ERP/api/rh/payroll/mapas/irps?mes=8&ano=2026" -H "Cookie: $COOKIE"
```

### 3.6 Observabilidade (sondas)

Todas `withApi({ public: true })` e em `PUBLIC_PATHS`. Em produção devem ficar restritas por rede
(spec 17).

#### `GET /api/health`

Liveness: responde se o processo está de pé, sem tocar na base de dados. É o `HEALTHCHECK` do
`Dockerfile` e do App Runner.

```json
{ "status": "ok", "version": "dev", "timestamp": "2026-09-24T10:00:00.000Z" }
```

`200 application/json`, `Cache-Control: no-store`. `version` é `APP_VERSION` (omissão `dev`).

```bash
curl -s "$ERP/api/health"
```

#### `GET /api/ready`

Readiness: `SELECT 1` via `prismaBase`.

- `200` → `{ "status": "ready", "db": "ok", "timestamp": "…" }`
- `503` → `{ "status": "not_ready", "db": "error", "error": "<mensagem do driver>", "timestamp": "…" }`

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$ERP/api/ready"
```

#### `GET /api/metrics`

Métricas Prometheus (prom-client), raspadas pelo job `gespro-erp` do otel-lgtm
(`infra/local/observabilidade/prometheus.yaml`).

- Com `METRICS_SECRET` definido exige `Authorization: Bearer <METRICS_SECRET>` (comparação
  timing-safe); falhando → `401 {"error":"Unauthorized"}`. **Sem `METRICS_SECRET` fica aberto.**
- Sucesso: `200`, `Content-Type` = `registry.contentType` (formato de texto Prometheus),
  `Cache-Control: no-store`.
- Falha a gerar: `500 {"error":"Erro ao gerar métricas","detail":"…"}`.
- Séries: `http_requests_total{method,route,status_code,tenant_id}`,
  `http_request_duration_ms{method,route,tenant_id}`, `keycloak_available`,
  `keycloak_health_probe_duration_ms`, `keycloak_failures_total{reason}`, `valkey_available`,
  `valkey_operation_duration_ms{operation}`, `valkey_circuit_breaker_open_total`,
  `negocio_vendas_total{tenant_id}`, `negocio_faturas_emitidas_total{tenant_id}`,
  `negocio_stripe_webhook_falhas_total{event_type,tenant_id}`,
  `negocio_tarefas_agendadas_em_falta{tarefa,tenant_id}`, mais as de processo. `userId` e `requestId`
  nunca são etiquetas.

```bash
curl -s "$ERP/api/metrics" -H "Authorization: Bearer $METRICS_SECRET" | grep ^http_requests_total
```

### 3.7 Funil público (site de marketing e registo)

#### `GET, OPTIONS /api/publico/planos`

Catálogo de planos — **fonte única** de preços e limites para `apps/site` (spec 18). Sem dados de
tenant nem PII. `withApi({ public: true })`, CORS por allowlist.

Sucesso `200 application/json`, `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`:

```json
{
  "data": {
    "trialDias": 14,
    "planos": [
      {
        "id": "BASICO", "nome": "Básico",
        "descricao": "Para empresas em arranque que precisam de facturação e stock.",
        "limites": { "utilizadores": 3, "armazens": 1, "suporte": "Email (48h)" },
        "precoMensal": { "valor": 29, "moeda": "USD" },
        "precoAnual": { "valor": 290, "moeda": "USD" },
        "destaque": false
      }
    ]
  }
}
```

Os três planos (`BASICO`, `PROFISSIONAL`, `EMPRESARIAL`) vêm de `PLANOS` em `src/lib/planos.ts`;
`-1` nos limites significa ilimitado. `OPTIONS` responde `204` com `corsPreflightResponse`.

```bash
curl -s "$ERP/api/publico/planos" -H "Origin: https://gespro.mz"
```

#### `POST, OPTIONS /api/publico/registo`

Registo self-service de uma empresa (ADR-0031). O handler é **só um adaptador HTTP**: lê o corpo e
delega em `registarTenant()` (`src/server/provisioning/registo-publico.ts`), a mesma função usada
pelo ecrã `/registo` do ERP. Os códigos de erro são contrato publicado em
`docs/handoff/site-provisionamento.md` §2.

Ordem das defesas: limite por IP → `Idempotency-Key` → corpo legível → Zod → idempotência → limite por
e-mail → captcha (Turnstile) → identidade no Keycloak → transacção em Postgres (Tenant,
ConfiguracaoFiscal, Assinatura `TRIAL`, RBAC, User, PGC-NIRF, séries, Notificação).

| | |
|---|---|
| Cabeçalhos | `Content-Type: application/json` · **`Idempotency-Key`** obrigatório, 8–200 caracteres |
| Corpo (`RegistoTenantSchema`) | `empresa.nome` (2–200) · `empresa.nuit` (NUIT válido, 9 dígitos não repetidos) · `admin.nome` (2–150) · `admin.email` (e-mail, ≤ 254, normalizado para minúsculas) · `senha` (10–200) · `confirmacao` (igual a `senha`) · `planoId` (`BASICO \| PROFISSIONAL \| EMPRESARIAL`) · `provincia` (província de Moçambique de `getProvincias()`) · `captchaToken` (1–4096) |
| Sucesso | `201 application/json` — `{ "tenantSlug": "…", "mensagem": "Conta criada. Enviámos uma ligação de confirmação para a sua caixa de correio: confirme o endereço para poder emitir documentos e convidar colegas." }` (sem envelope `data`) |
| Efeito colateral | envia o e-mail de verificação (`enviarEmailVerificacao`) fora do caminho da resposta; um SMTP em baixo não torna o 201 num erro |

Formato de erro (contrato próprio, com `traceId` = `requestId`):

```json
{
  "traceId": "3f0c7a52-9d1e-4b8a-a0e4-6c2f8b1d7e90",
  "erro": "Dados de registo inválidos.",
  "error": { "code": "VALIDACAO", "message": "Dados de registo inválidos.", "details": { "fieldErrors": { "senha": ["A palavra-passe tem de ter pelo menos 10 caracteres"] }, "formErrors": [] } }
}
```

| HTTP | `code` | Quando |
|---|---|---|
| 429 | `LIMITE_EXCEDIDO_IP` | > 3 pedidos/h deste IP. **Corpo sem `error`**: só `{ traceId, erro }`, com `Retry-After` |
| 400 | `IDEMPOTENCY_KEY_OBRIGATORIA` | cabeçalho em falta ou fora de 8–200 |
| 400 | `JSON_INVALIDO` | corpo ilegível |
| 422 | `VALIDACAO` | Zod falhou (`details` = `flatten()`) |
| 409 | `REGISTO_EM_CURSO` | outro pedido com a mesma chave ainda a correr |
| 409 | `IDEMPOTENCY_KEY_REUTILIZADA` | mesma chave, corpo diferente (fingerprint SHA-256 do corpo) |
| 429 | `LIMITE_EXCEDIDO_EMAIL` | > 3 pedidos/h para este e-mail (idem: só `{ traceId, erro }`) |
| 403 | `CAPTCHA_INVALIDO` | captcha inválido ou não configurado (Turnstile inacessível → aceita em modo degradado, ADR-0016) |
| 4xx/5xx | código do `AppError` | recusa determinística do provisionamento (NUIT/e-mail já registados, …) |
| 500 | `ERRO_INTERNO` | «Não foi possível concluir o registo.» |

**Idempotência:** a reentrega da mesma `Idempotency-Key` com o mesmo corpo devolve o 201 gravado
(e reenvia o e-mail de verificação — de propósito). O `registoLimiter` falha **fechado**: com o Valkey
em baixo, o registo público fica bloqueado.

`OPTIONS` responde `204` anunciando `POST, OPTIONS` e `Content-Type, Idempotency-Key` — sem isso o
browser recusa o POST.

```bash
curl -s -X POST "$ERP/api/publico/registo" \
  -H "Origin: https://gespro.mz" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"empresa":{"nome":"Machava Comercial, Lda","nuit":"400123457"},
       "admin":{"nome":"Ana Machava","email":"ana@machava.co.mz"},
       "senha":"Correcta-Cavalo-9","confirmacao":"Correcta-Cavalo-9",
       "planoId":"PROFISSIONAL","provincia":"Maputo Cidade","captchaToken":"<token Turnstile>"}'
```

(O NUIT tem de passar `validarNUIT`; a província tem de constar de `getProvincias()`.)

#### `GET /api/publico/verificar-email`

Confirmação do endereço do administrador (ADR-0031 §5). Aberta a partir do cliente de e-mail, por isso
**responde sempre `303 See Other`**, nunca JSON. O efeito é pôr `emailVerified = true` no Keycloak
(`marcarEmailVerificado`) — idempotente e sem conceder sessão, por isso não há tabela nem consumo
atómico do token.

| | |
|---|---|
| Query | `t` — token assinado HMAC-SHA256 com `EMAIL_VERIFY_SECRET`, prazo de 24 h na carga |
| Limitação | `verificacaoEmailLimiter`, 20/15 min, `${ip}::verificar-email` |
| Destino | `/dashboard?verificacao=<desfecho>` com sessão; `/auth/login?verificacao=<desfecho>` sem sessão |

`desfecho`: `ok` · `expirada` (leva ao reenvio, ADR-0030 §4) · `invalida` (sem `t` ou assinatura
errada) · `erro` (Keycloak falhou) · `limitada` (limite excedido). A sessão em curso só vê o novo
estado na re-resolução seguinte (ADR-0011, 15 min).

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$ERP/api/publico/verificar-email?t=<token>"
```

### 3.8 Webhooks

#### `POST /api/webhooks/stripe`

Reconciliação do estado da subscrição a partir dos eventos do Stripe. `withApi({ public: true })`,
em `PUBLIC_PATHS`. **A autenticação é a assinatura do evento**: o corpo é lido como texto cru
(`req.text()`, nunca `req.json()`) e verificado com `stripe.webhooks.constructEvent(rawBody,
Stripe-Signature, STRIPE_WEBHOOK_SECRET)`. O tenant é resolvido pelos `stripeCustomerId` /
`stripeSubscriptionId` que **nós** guardámos, nunca pela metadata do evento.

Eventos tratados (`processarEventoWebhook`): `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`.

**Idempotência:** `EventoWebhookStripe.stripeEventId` é `@unique` e é inserido na mesma transacção
da lógica de negócio; uma reentrega devolve 200 com `duplicado: true` sem reprocessar.

| HTTP | Corpo | Quando / porquê |
|---|---|---|
| 200 | `{ "data": { "recebido": true, "duplicado": false } }` | processado (ou duplicado) |
| 400 | `ASSINATURA_AUSENTE` | falta `Stripe-Signature` |
| 400 | `ASSINATURA_INVALIDA` | assinatura não confere — o Stripe **não** reentrega |
| 429 | `RATE_LIMIT_EXCEEDED` («Demasiados pedidos.») + `Retry-After` | > 100/min do mesmo IP |
| 503 | `STRIPE_WEBHOOK_NAO_CONFIGURADO` | `STRIPE_WEBHOOK_SECRET` em falta: 503 e não 400, para o Stripe continuar a reentregar |
| 503 | `TENANT_NAO_RESOLVIDO` + `Retry-After: 30` | evento de faturação ainda sem tenant associado (criação da subscrição a decorrer) |
| 500 | `WEBHOOK_FALHOU` | erro no processamento; o erro fica em `EventoWebhookStripe.erro` e o Stripe reentrega |

Os 5xx são deliberados: um evento perdido significaria um tenant que pagou e continua bloqueado.

```bash
# Localmente, com a Stripe CLI a reencaminhar e a assinar:
stripe listen --forward-to "$ERP/api/webhooks/stripe"
stripe trigger invoice.paid
```

---

## 4. Server Actions

As Server Actions são a porta de **todas** as mutações da UI e de algumas leituras interactivas
(comboboxes remotas, KPIs, selectores). Não são documentadas uma a uma: o contrato é o mesmo para
todas e o que varia (schema, permissão, `revalidate`) está na própria declaração.

### 4.1 `createSafeAction` e `ActionResult<T>`

`src/server/safe-action.ts`:

```ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

createSafeAction({
  schema,            // Zod (opcional) — o mesmo de src/lib/validations/<modulo>.ts usado no formulário
  permission,        // código do catálogo prisma/seed/rbac.ts, formato modulo:accao
  revalidate,        // { paths?: string[]; tags?: string[] } — revalidatePath / updateTag após sucesso
  permiteEmLeitura,  // boolean (opcional) — ver 4.3
  handler,           // (input, { tenantId, userId, permissions }) => Promise<T>
})
// devolve: (raw) => Promise<ActionResult<Serializado<T>>>
```

Pipeline por invocação: `requestId` → sessão (`UnauthorizedError`) → permissão (`ForbiddenError`) →
**Leitura** (`AcessoLeituraError`, depois da permissão de propósito: quem não tem permissão continua
a ver 403) → Zod (`ValidationError` com `flatten()` em `details`) → `runWithRequestContext` +
`runWithTenantContext` → handler → `revalidate` → `serializarDecimais`.

**Nunca lança para o cliente.** Um `AppError` vira `{ ok: false, error: { code, message, details } }`
com o código estável; qualquer outro erro vira

```json
{ "ok": false, "error": { "code": "ERRO_INTERNO", "message": "Erro interno", "details": { "traceId": "<requestId>" } } }
```

com a stack só no log. O `status` HTTP do `AppError` não viaja (a action responde sempre 200 ao
protocolo do Next); o cliente decide pelo `code`.

### 4.2 Serialização de `Decimal`

O retorno atravessa a fronteira RSC para um Client Component, onde um `Prisma.Decimal` rebenta a
serialização — **depois** de a transacção ter feito commit. Por isso o `createSafeAction` passa
sempre o resultado por `serializarDecimais` (`src/server/serializar.ts`):

- `Prisma.Decimal` → `string` via `.toString()` (convenção da casa: perde zeros à direita, nunca
  perde valor);
- arrays e objectos simples (`Object.prototype` ou `null` como protótipo) são percorridos em
  profundidade;
- `Date`, funções e instâncias de outras classes passam intactas.

O tipo acompanha: `ActionResult<Serializado<T>>`, em que `Serializado<Decimal>` é `string`.
No cliente, um valor monetário devolvido por uma action é **sempre** string.

### 4.3 `permiteEmLeitura`

Com o tenant em Leitura, por omissão **nenhuma** action corre (409 `ACESSO_LEITURA`, também para
leituras — ao contrário do `withApi`, o `createSafeAction` não distingue por método). Declaram
`permiteEmLeitura: true`, e só estes dois tipos:

- **leituras** — `listar*`, `obter*`, `procurar*` (e afins como `gerarBalancete`, `razaoConta`):
  sem a bandeira, o cliente em Leitura nem vê o que é seu;
- **as três de subscrição** — `iniciarCheckout`, `abrirPortalCliente`, `cancelarSubscricao`
  (`onboarding.actions.ts`): são escritas e passam de propósito, porque pagar nunca se trava.

O gate de CI `gate-leitura` (`apps/erp/scripts/gate-*.mjs`) recusa qualquer action **sem
`revalidate`** que também não declare a bandeira: a omissão não é decisão. Nunca se usa a bandeira
numa escrita de negócio para «desbloquear» um ecrã.

### 4.4 Inventário por ficheiro

25 ficheiros em `apps/erp/src/server/actions/`, **379** actions (`export const … = createSafeAction(`),
das quais **67** declaram `permiteEmLeitura: true`. Contagem por
`grep -cE '^export const \w+ = createSafeAction'`.

| Ficheiro | Actions | Leitura | Domínio |
|---|---:|---:|---|
| `beneficios.actions.ts` | 9 | 2 | RH — benefícios e atribuições |
| `caixa.actions.ts` | 10 | 5 | Caixa — sessões de caixa, sangria, reforço |
| `clientes.actions.ts` | 12 | 1 | Comercial — clientes, endereços, contactos, segmentação |
| `comissoes.actions.ts` | 6 | 0 | Comercial — regras de comissão, aprovação e pagamento |
| `compras.actions.ts` | 17 | 0 | Compras — workflow de aprovação, requisições, cotações, pedidos de compra |
| `contabilidade.actions.ts` | 28 | 12 | Finanças — PGC, diários, centros de custo, lançamentos, contas bancárias, exercícios e períodos, mapas |
| `faturacao.actions.ts` | 29 | 9 | Finanças — séries, facturas, notas de crédito/débito, pró-formas |
| `financas-iva.actions.ts` | 4 | 1 | Finanças — apuramento do IVA |
| `fornecedores.actions.ts` | 12 | 0 | Compras — fornecedores, contactos, documentos, avaliações, contas a pagar |
| `inventario.actions.ts` | 45 | 1 | Inventário — categorias, produtos, variantes, localizações, movimentos de stock |
| `notificacoes.actions.ts` | 3 | 0 | Plataforma — notificações e preferências |
| `onboarding.actions.ts` | 3 | 3 | Plataforma — subscrição (checkout, portal Stripe, cancelamento) |
| `payroll.actions.ts` | 11 | 3 | RH — processamento salarial, tabelas INSS e escalões IRPS |
| `plataforma.actions.ts` | 13 | 0 | Plataforma — tenant, configuração fiscal, utilizadores, papéis |
| `producao.actions.ts` | 19 | 4 | Produção — centros de trabalho, estruturas (BOM), ordens |
| `projetos.actions.ts` | 30 | 6 | Projectos — equipas, projectos, tarefas |
| `reconciliacao.actions.ts` | 11 | 2 | Finanças — reconciliação bancária (extractos, períodos, correspondências) |
| `recrutamento.actions.ts` | 12 | 2 | RH — vagas, candidatos, entrevistas, admissão |
| `rh.actions.ts` | 18 | 2 | RH — colaboradores, férias, ausências, assiduidade, avaliações, formação |
| `servicos.actions.ts` | 14 | 0 | Serviços — catálogo, técnicos, agendamentos, avaliações, contratos |
| `tesouraria.actions.ts` | 6 | 3 | Tesouraria — projecção e compromissos |
| `tickets.actions.ts` | 14 | 2 | Suporte — tickets, categorias, equipas, base de conhecimento |
| `transporte.actions.ts` | 29 | 6 | Transporte — viaturas, motoristas, documentos, manutenção, actividades |
| `vendas.actions.ts` | 23 | 2 | Vendas — vendas, sessões POS, encomendas, devoluções, trocas, vendedores |
| `verificacao-email.actions.ts` | 1 | 1 | Plataforma — reenvio da ligação de verificação de e-mail |

Há ainda duas actions **fora** deste directório e **fora** do `createSafeAction`, por decisão
documentada no próprio ficheiro (ambas correm sem sessão estabelecida):
`src/app/registo/actions.ts` (`registarTenantPublico`, que delega em `registarTenant()` como o
`POST /api/publico/registo`) e `src/app/(auth)/auth/mudar-palavra-passe/actions.ts`
(`mudarPalavraPasse`).

---

## 5. Acrescentar um endpoint

1. Confirmar que é mesmo um Route Handler (download, webhook, cron, consumidor externo). Mutação da
   UI é Server Action.
2. `export const GET|POST = withApi(handler, { permission })` em `src/app/api/<modulo>/**/route.ts`;
   `export const runtime = 'nodejs'` se tocar em PDF, S3, Stripe ou `node:crypto`.
3. Validar query/corpo com um schema Zod de `src/lib/validations/` e lançar `ValidationError` com
   `parsed.error.flatten()`; ids com `idEntidade()`, nunca `.cuid()`.
4. Permissão nova → `prisma/seed/rbac.ts` **e** `pnpm db:seed`.
5. Exportação → `exportLimiter` com `${ctx.userId}::export`.
6. Sem sessão → entrada em `PUBLIC_PATHS` do `middleware.ts` e credencial própria no handler.
7. `/api/cron/*` → `infra/local/cron/crontab` **e** [runbook do agendador](../runbooks/agendador.md).
8. Método de escrita que tenha de passar em Leitura → `permiteEmLeitura: true`, justificado.

---

## 6. Incoerências conhecidas

Encontradas ao escrever este capítulo; o código é o que vale, nada disto foi corrigido aqui.

**Pipeline e envelope**

- **Três crons sem `withApi`**: `expirar-trials`, `reconciliar-identidades` e `transporte-alertas` são
  funções `GET` nuas — sem `x-request-id`, sem `http_requests_total`, fora do Grafana. O comentário de
  `expirar-registos-nao-verificados` já o aponta como achado da revisão da spec 19. `transporte-alertas`
  usa ainda `console.log`/`console.error` em vez do logger estruturado.
- **`withApi` não devolve `traceId` no corpo** do 500, ao contrário do que diz o `CLAUDE.md`
  («erros inesperados devolvem `traceId`»); a correlação é só pelo cabeçalho `x-request-id`.
- **`withApi` não tem Zod**: o `CLAUDE.md` descreve-o como «sessão→permissão→Zod→…», mas a validação
  é manual em cada handler. `audit` e `cron/abrir-exercicio` não usam Zod; em `audit`, `take=abc`
  chega ao Prisma como `NaN` (500) e `take` negativo não é recusado.
- **Envelope `{ data }` não é universal**: `documentos/presign` devolve o objecto nu; `health`/`ready`
  têm formato próprio; `metrics` responde `{"error":"Unauthorized"}` e `{"error": "...", "detail": ...}`
  fora do envelope; `publico/registo` tem contrato próprio (201 nu, erros com `traceId`/`erro`, 429 sem
  `error`).
- **`/api/ready` e `/api/metrics` expõem a mensagem crua do erro** (`error`/`detail`) a um chamador sem
  autenticação.
- **Sem sessão, as rotas autenticadas respondem 307** (middleware), não 401 — um consumidor
  programático tem de tratar o redireccionamento.

**Autenticação e `PUBLIC_PATHS`**

- `docs/runbooks/agendador.md` diz que as rotas de cron «**não** estão em `PUBLIC_PATHS`»; o comentário
  de `expirar-trials` diz o mesmo. Falso: `middleware.ts` tem `'/api/cron/'`. (O comentário de
  `expirar-registos-nao-verificados` está certo.)
- `/api/metrics` fica **aberto** quando `METRICS_SECRET` não está definido (comportamento documentado
  no código, mas não há verificação de arranque que o impeça em produção).

**Permissões**

- Todas as permissões citadas pelos Route Handlers existem em `prisma/seed/rbac.ts`
  (`admin:ver_auditoria`, `faturacao:ver`, `financas:iva:mapas`, `financas:banca:reconciliacao`,
  `rh:payroll:read`, `clientes:ver`, `producao:ordens:read`, `fornecedores:editar`, `ativos:write`,
  `transporte:viatura:documentos`, `transporte:motorista:documentos`, `rh:colaboradores:update`,
  `transporte:viatura:listar`).
- **Download exige a permissão de escrita** do recurso (`PERMISSAO_ESCRITA_POR_RECURSO`): quem só pode
  ver um fornecedor não descarrega os seus documentos.
- **`colaborador` aceita upload mas não download**: está em `RECURSOS_DOCUMENTO` (o presign assina),
  mas `documentos/[id]/download` não tem buscador para ele.
- **`PUT /api/documentos/local/*` não verifica a permissão do recurso** — só o prefixo do tenant
  (âmbito dev/CI).
- `presign` valida `recursoId` com `z.string().cuid()`, contra a regra do `CLAUDE.md` (`idEntidade()`).
- `presign` valida o `tamanho` **declarado**; o `PUT` assinado do S3 não amarra o tamanho
  (`maxBytes` não entra na assinatura), só o `Content-Type`.

**Limitação de tráfego**

- O `CLAUDE.md` diz «rate-limit em … exports», mas `export/[modulo]`, `faturacao/[id]/pdf` e
  `financas/iva/mapas/[periodo]` não têm limitador.
- `rh/payroll/*` comenta «20 exportações por utilizador por hora»; o `exportLimiter` é **10 por
  minuto** (e o balde é partilhado com a reconciliação).
- `src/lib/auth.ts`/`rate-limiter.ts` descrevem «5/15 min por identificador» no login, mas as duas
  chaves usam o mesmo `loginLimiter` (10/15 min).
- `publico/planos` responde ao preflight com `corsPreflightResponse` por omissão
  (`GET, POST, OPTIONS` e `Allow-Credentials: true`), diferente do que o `GET` anuncia
  (`GET, OPTIONS`, sem credenciais).

**Agendador**

- O runbook abre com «**Quatro** rotas»; a tabela e o crontab têm **cinco**.
- Horários nos comentários das rotas ≠ crontab: `expirar-registos-nao-verificados` diz 03:30 (crontab
  03:10); `transporte-alertas` diz 02:00 (crontab 03:30).
- `transporte-alertas` diz processar «todos os tenants activos», mas faz `tenant.findMany()` sem
  filtro — inclui tenants apagados e com assinatura `FECHADA` (os outros crons filtram por
  `deletedAt`/estado).

**Conteúdo das exportações**

- `financas/iva/mapas/[periodo]?tipo=declaracao`: constrói um objecto `dados` (resumo, avisos de
  divergência) que é **descartado** — só sai o CSV; o nome do ficheiro usa o **id** do apuramento, não o
  código do período (`periodo: apuramento.id` no mesmo objecto).
- `tipo=antiguidade` ignora o período, mas falha com 404 se esse período não tiver apuramento.
- `rh/payroll/[id]/recibo` formata a data de pagamento com `toLocaleDateString('pt-PT')` no servidor
  (UTC), contra a regra de `src/lib/format-date.ts` (fuso `Africa/Maputo`); também não envia
  `Cache-Control: no-store`, ao contrário do PDF da factura.
- A grafia `motoistasActualizados` / `totalMotoistasActualizados` na resposta de
  `transporte-alertas` é um erro de digitação que já é contrato.
