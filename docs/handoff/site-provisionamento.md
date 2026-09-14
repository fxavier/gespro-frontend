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
  "admin":   { "nome": "string", "email": "string" },
  "senha": "string",                        # mín. 10 caracteres (ADR-0031)
  "confirmacao": "string",                  # tem de coincidir com `senha`
  "planoId": "BASICO" | "PROFISSIONAL" | "EMPRESARIAL",
  "provincia": "string",                    # lista MZ validada server-side
  "captchaToken": "string"                  # hCaptcha/Turnstile
}

201 Created
{ "tenantSlug": "string", "mensagem": "string" }   # mensagem de «confirme o e-mail»

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
| 409 | `EMAIL_JA_REGISTADO` | O e-mail já pertence a uma conta GestPro — **é único em todo o sistema** (CONTEXT.md). A mensagem explica que quem gere duas empresas precisa de dois endereços; o site deve mostrá-la tal e qual |
| 409 | `REGISTO_EM_CURSO` | Mesma `Idempotency-Key` ainda a ser processada |
| 409 | `IDEMPOTENCY_KEY_REUTILIZADA` | Mesma chave com corpo diferente |
| 429 | — | Rate-limit (por IP e por email); ver `Retry-After` |
| 500 | `ERRO_INTERNO` | Falha inesperada; só `traceId` |

⚠ **notas de implementação**:
- A `Idempotency-Key` tem de ter entre 8 e 200 caracteres (um UUID serve).
- Repetir a chave com o **mesmo** corpo devolve **201 com a mesma resposta**. A repetição não
  reenvia o e-mail de activação nem toca no fornecedor de identidade.
- `provincia` é validada contra a lista de províncias de Moçambique (`getProvincias()`).
- O campo `senha` **voltou** (ADR-0031, que inverte o ADR-0013 §5), agora **de topo** e
  acompanhado de `confirmacao`: mínimo de 10 caracteres, mesma regra de
  `/auth/mudar-palavra-passe` (ADR-0030). É escrita no Keycloak com `temporaria: false` **antes**
  de haver tenant em Postgres — com `VERIFY_EMAIL` pendente o Direct Access Grant recusaria a
  sessão e o registo não daria entrada nenhuma. O ERP continua a **nunca** guardar nem verificar
  palavras-passe: ela vive um salto só, do corpo do pedido para a Admin API.
- Um `admin.senha` residual (o sítio onde o campo vivia antes do ADR-0013) continua a ser
  descartado pelo Zod e nunca é lido.
- **A entrada de referência deixou de ser este endpoint**: quem se regista fá-lo em
  `app.gestpro.co.mz/registo`, servido pelo ERP, que chama a mesma função partilhada
  (`src/server/provisioning/registo-publico.ts`) e abre a sessão na mesma submissão. Este
  endpoint mantém-se como contrato público, com os mesmos códigos de erro.
- O e-mail de verificação **não** é disparado por esta função: quem a chama é que o envia,
  depois de dar a sessão (ADR-0031). `sub` e `email` viajam no resultado para esse efeito.

Comportamento do lado do site:
1. Submete o formulário para este endpoint (do servidor do site, nunca do cliente, para não
   expor a origem a CORS desnecessário).
2. Em 201, mostra a página «verifique a sua caixa de correio» (pode usar `mensagem` da
   resposta). **Não há redireccionamento para o ERP**: a entrada no produto faz-se pelo link do
   e-mail de activação do Keycloak, onde o utilizador confirma o e-mail e define a palavra-passe.
3. Em 4xx/5xx, degrada para uma mensagem de erro no próprio site (nunca expõe `traceId`/stack ao utilizador final).

## 3. Handoff SSO (site → app) — REMOVIDO

O `handoffToken`, a rota `/auth/registo-callback` e o segredo `HANDOFF_SIGNING_SECRET` foram
removidos pelo ADR-0013 §5. O que os substitui é o e-mail de acções do Keycloak: o utilizador
clica, verifica o e-mail, define a palavra-passe **no Keycloak** e cai autenticado no ERP.
Perde-se a entrada instantânea pós-formulário — custo de funil aceite e registado no ADR.

## 4. Verificação de email — agora do Keycloak

`GET /api/publico/verificar-email` foi removido. A verificação faz-se no link do e-mail de
acções do Keycloak (acções `VERIFY_EMAIL` + `UPDATE_PASSWORD` pendentes na criação). O site
apenas informa o utilizador de que deve confirmar o e-mail (copy na página pós-registo).

## 5. Pré-requisitos operacionais

- A **origem** do site de marketing (domínio de produção e de staging) tem de constar em
  `ALLOWED_ORIGINS` (CORS por allowlist, nunca wildcard) **antes** do deploy do spec 19.
- `POST /api/publico/registo`, `GET /api/publico/planos` e `POST /api/webhooks/stripe` estão
  listados em `PUBLIC_PATHS` do `middleware.ts` do ERP (senão devolvem 307 → `/auth/login`).
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
| `ALLOWED_ORIGINS` / `PUBLIC_PATHS` | spec 19 + spec 17 (headers) | — |
| Copy/UX do formulário e páginas | site (spec 18) | — |

Mudanças a qualquer linha «dono = spec 19» são versionadas aqui pelo orquestrador antes de
qualquer alteração no site.


## 7. Verificação do contrato (spec 19 implementado)

| Item | Onde |
|---|---|
| Catálogo | `apps/erp/src/lib/planos.ts` · `src/app/api/publico/planos/route.ts` |
| Registo | `src/server/provisioning/registo-publico.ts` (fronteira partilhada) · `src/app/api/publico/registo/route.ts` (adaptador HTTP) · `src/server/services/plataforma/tenant-provisioning.service.ts` |
| Provisionamento no Keycloak | `src/server/auth/keycloak.ts` (Admin API, `execute-actions-email`) |
| CORS/allowlist | `src/lib/api/cors.ts` (lê `ALLOWED_ORIGINS` em runtime) |

Testes que fixam o contrato: `src/lib/__tests__/assinatura-state-machine.test.ts` (catálogo),
`src/app/api/publico/__tests__/registo-handler.test.ts` e
`src/server/services/plataforma/__tests__/tenant-provisioning.service.test.ts`.

> **Revisão de 2026-08-30 (w8-identidade, ADR-0013):** contrato alterado — sem `senha`, sem
> `handoffToken`, novo `EMAIL_JA_REGISTADO`. O site (spec 18) tem de: remover o campo de
> palavra-passe, substituir o redirect pós-registo pela página «verifique o e-mail», e mapear o
> novo código de erro. Pedido registado no handoff `docs/handoff/w8-identidade.md`.

> **Revisão de 2026-09-15 (spec 21, ADR-0031):** o corpo ganha `senha` + `confirmacao` (topo,
> mín. 10 caracteres) e a lógica pública passou a viver numa função partilhada,
> `registarTenant()` — o Route Handler é agora só o adaptador HTTP e **todos os códigos de erro
> publicados se mantêm**. O 429 continua sem `error.code`, com `Retry-After`. O site (spec 18)
> deixa de submeter este endpoint: `/comecar` encaminha para `app.gestpro.co.mz/registo`
> (lane L2 do spec 21).
