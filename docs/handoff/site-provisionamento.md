# Contrato de Fronteira — Site (spec 18) ⇄ Provisionamento (spec 19)

Documento de contrato entre o **site de marketing** (`apps/site`, spec 18, *consumidor*) e a
**plataforma de onboarding/provisionamento** (`apps/erp`, spec 19, *dono do contrato*). O site
nunca acede à base de dados do ERP nem ao Stripe: consome apenas os endpoints públicos abaixo.
Qualquer alteração a este contrato é decidida no spec 19 e reflectida aqui.

- **Dono do contrato**: spec 19 (`feat-onboarding-provisionamento`).
- **Consumidor**: spec 18 (`feat-website-marketing`), via `apps/site/src/lib/planos.ts` e o CTA de trial.
- **Versão**: v1 (`/api/publico/*`). Mudanças incompatíveis → novo prefixo de versão.

## 1. Catálogo de planos (fonte única de preços)

```
GET /api/publico/planos
Cache-Control: público, curto (ISR no site, revalidate ~300s)

200 OK
{
  "planos": [
    {
      "id": "BASICO" | "PROFISSIONAL" | "EMPRESARIAL",
      "nome": "string",
      "limites": { "<chave>": number | string },
      "precoMensal": { "valor": number, "moeda": "USD" },
      "precoAnual":  { "valor": number, "moeda": "USD" }
    }
  ]
}
```

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
{ "traceId": "string", "erro": "string" }              # sem stack; site mostra mensagem amigável
```

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
- `POST /api/publico/registo` e `GET /api/publico/planos` estão listados em `PUBLIC_PATHS` do
  `middleware.ts` do ERP (senão devolvem 307 → `/auth/login`).
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
