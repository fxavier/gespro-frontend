# Contrato de Fronteira — Site (spec 18) ⇄ Provisionamento (spec 19)

Documento de contrato entre o **site de marketing** (`apps/site`, spec 18, *consumidor*) e a
**plataforma de onboarding/provisionamento** (`apps/erp`, spec 19, *dono do contrato*). O site
nunca acede à base de dados do ERP nem ao Stripe: consome apenas os endpoints públicos abaixo.
Qualquer alteração a este contrato é decidida no spec 19 e reflectida aqui.

- **Dono do contrato**: spec 19 (`feat-onboarding-provisionamento`).
- **Consumidor**: spec 18 (`feat-website-marketing`), via `apps/site/src/lib/planos.ts` e o CTA de trial.
- **Versão**: v1 (`/api/publico/*`). Mudanças incompatíveis → novo prefixo de versão.
- **Estado**: **implementado** no spec 19 (branch `ws-19`). As secções abaixo descrevem o
  comportamento real dos endpoints, não uma intenção. Diferenças face ao contrato congelado
  estão assinaladas com «⚠ nota de implementação».

## 1. Catálogo de planos (fonte única de preços)

```
GET /api/publico/planos
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600

200 OK
{
  "data": {
    "trialDias": 14,
    "planos": [
      {
        "id": "BASICO" | "PROFISSIONAL" | "EMPRESARIAL",
        "nome": "string",
        "descricao": "string",
        "limites": {
          "utilizadores": number,      // -1 = ilimitado
          "armazens": number,          // -1 = ilimitado
          "documentosMes": number,     // -1 = ilimitado
          "produtos": number,          // -1 = ilimitado
          "suporte": "string"
        },
        "precoMensal": { "valor": number, "moeda": "USD" },
        "precoAnual":  { "valor": number, "moeda": "USD" },
        "destaque": boolean
      }
    ]
  }
}
```

⚠ **nota de implementação**: a resposta vem dentro do envelope `{ data: … }` (convenção de
Route Handlers do projecto — `docs/handoff/feat-19-onboarding.md`). Os campos `descricao`,
`destaque` e `trialDias` são acréscimos compatíveis; `-1` em `limites` significa ilimitado.
Fonte única: `apps/erp/src/lib/planos.ts`.

Regras: o site **nunca** hardcoda preços/limites — renderiza o que este endpoint devolve
(`/precos`, JSON-LD `Product`, FAQ). A moeda é a servida pelo endpoint (ver ADR-0009: USD no
MVP). Enquanto o spec 19 não expõe o endpoint, o site usa um *mock* local com aviso `TODO spec 19`.

## 2. Registo + trial sem cartão

```
POST /api/publico/registo
Headers: Content-Type: application/json
         Idempotency-Key: <uuid>            # obrigatório; repetição devolve a mesma resposta

Body:
{
  "empresa": { "nome": "string", "nuit": "string" },
  "admin":   { "nome": "string", "email": "string", "senha": "string" },
  "planoId": "BASICO" | "PROFISSIONAL" | "EMPRESARIAL",
  "provincia": "string",                    # lista MZ validada server-side
  "captchaToken": "string"                  # hCaptcha/Turnstile
}

201 Created
{ "tenantSlug": "string", "handoffToken": "string" }   # token opaco para o site

4xx
{ "traceId": "string", "erro": "string",
  "error": { "code": "string", "message": "string", "details"?: {} } }
```

Códigos de erro estáveis (`error.code`), para o site mapear em copy própria:

| Estado | `error.code` | Significado |
|---|---|---|
| 400 | `IDEMPOTENCY_KEY_OBRIGATORIA` | Cabeçalho `Idempotency-Key` ausente ou fora de 8–200 caracteres |
| 400 | `JSON_INVALIDO` | Corpo não é JSON válido |
| 422 | `VALIDACAO` | Zod falhou; `details` traz `fieldErrors` |
| 403 | `CAPTCHA_INVALIDO` | Captcha recusado ou provedor indisponível (fail-closed) |
| 409 | `NUIT_JA_REGISTADO` | Já existe conta com esse NUIT |
| 409 | `REGISTO_EM_CURSO` | Mesma `Idempotency-Key` ainda a ser processada |
| 409 | `IDEMPOTENCY_KEY_REUTILIZADA` | Mesma chave com corpo diferente |
| 429 | — | Rate-limit (por IP e por email); ver `Retry-After` |
| 500 | `ERRO_INTERNO` | Falha inesperada; só `traceId` |

⚠ **notas de implementação**:
- A `Idempotency-Key` tem de ter entre 8 e 200 caracteres (um UUID serve).
- Repetir a chave com o **mesmo** corpo devolve **201 com a mesma resposta**, incluindo o
  `handoffToken` original — que dura 60 s. Num retry tardio esse token já expirou e o callback
  mostra «ligação inválida»; o utilizador entra pelo login depois de confirmar o email. É
  deliberado: emitir um token novo transformaria a `Idempotency-Key` numa credencial de sessão.
- `provincia` é validada contra a lista de províncias de Moçambique (`getProvincias()`).
- `admin.senha`: mínimo 8 caracteres, com letras e números.

Comportamento do lado do site:
1. Submete o formulário para este endpoint (do servidor do site, nunca do cliente, para não
   expor a origem a CORS desnecessário).
2. Em 201, **redirecciona** para `${APP_URL}/auth/registo-callback?token=<handoffToken>`.
3. O `handoffToken` é **opaco**: o site relaia-o, **não** o inspecciona, descodifica nem guarda.
4. Em 4xx/5xx, degrada para uma mensagem de erro no próprio site (nunca expõe `traceId`/stack ao utilizador final).

## 3. Handoff SSO (site → app)

```
Redirect (browser): ${APP_URL}/auth/registo-callback?token=<handoffToken>
```

- Token: JWT HS256 assinado com `HANDOFF_SIGNING_SECRET` (distinto de `AUTH_SECRET`), TTL ~60s,
  **uso único** (claim `jti` consumido atomicamente pelo callback).
- Credenciais (senha) **nunca** viajam na URL — apenas o token de handoff.
- O callback (spec 19) valida assinatura/expiração, consome o `jti`, estabelece a sessão
  NextAuth e encaminha para o dashboard com o checklist de onboarding.

## 4. Verificação de email (informativo para o site)

```
GET /api/publico/verificar-email?token=<token>     # link no email de boas-vindas
```

O login só é permitido após esta verificação, independentemente de `statusAtivo`. O fluxo é
tratado inteiramente pelo ERP (spec 19); o site apenas informa o utilizador de que deve
confirmar o email (copy na página pós-registo).

## 5. Pré-requisitos operacionais

- A **origem** do site de marketing (domínio de produção e de staging) tem de constar em
  `ALLOWED_ORIGINS` (CORS por allowlist, nunca wildcard) **antes** do deploy do spec 19.
- `POST /api/publico/registo`, `GET /api/publico/planos`, `GET /api/publico/verificar-email`,
  `POST /api/webhooks/stripe` e `/auth/registo-callback` estão listados em `PUBLIC_PATHS` do
  `middleware.ts` do ERP (senão devolvem 307 → `/auth/login`).
- O widget de captcha do site usa `NEXT_PUBLIC_CAPTCHA_SITE_KEY`; o segredo
  (`CAPTCHA_SECRET_KEY`) fica **só** no ERP. Provedor: Turnstile ou hCaptcha
  (`CAPTCHA_PROVIDER`). Em produção, `CAPTCHA_PROVIDER=none` faz o registo **recusar** pedidos.
- Rate-limit e captcha são aplicados **do lado do spec 19**; o site não precisa de credenciais
  de sessão para chamar estes endpoints.

## 6. Propriedade e mudança

| Item | Dono | Consumidor |
|---|---|---|
| Schema de `planos` e preços | spec 19 (`src/lib/planos.ts`) | site (`/precos`, JSON-LD) |
| Contrato de `POST /registo` | spec 19 | site (CTA de trial) |
| Formato/segurança do `handoffToken` | spec 19 | site (relaia, não lê) |
| `ALLOWED_ORIGINS` / `PUBLIC_PATHS` | spec 19 + spec 17 (headers) | — |
| Copy/UX do formulário e páginas | site (spec 18) | — |

Mudanças a qualquer linha «dono = spec 19» são versionadas aqui pelo orquestrador antes de
qualquer alteração no site.


## 7. Verificação do contrato (spec 19 implementado)

| Item | Onde |
|---|---|
| Catálogo | `apps/erp/src/lib/planos.ts` · `src/app/api/publico/planos/route.ts` |
| Registo | `src/app/api/publico/registo/route.ts` · `src/server/services/plataforma/tenant-provisioning.service.ts` |
| Handoff | `src/server/services/plataforma/handoff.service.ts` · `src/app/(auth)/auth/registo-callback/` · provider `handoff` em `src/lib/auth.ts` |
| Verificação de email | `src/app/api/publico/verificar-email/route.ts` |
| CORS/allowlist | `src/lib/api/cors.ts` (lê `ALLOWED_ORIGINS` em runtime) |

Testes que fixam o contrato: `src/lib/__tests__/assinatura-state-machine.test.ts` (catálogo),
`src/server/services/plataforma/__tests__/{handoff,tenant-provisioning}.service.test.ts`.
