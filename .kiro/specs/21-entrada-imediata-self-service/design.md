# Design: Entrada imediata no produto após o registo self-service

## 1. A decisão que comanda todas as outras: onde vive o formulário

O requisito «a sessão tem de existir no fim da submissão» colide com «o *cookie* pertence a
`app.gestpro.co.mz`». Só há três formas de o resolver, e a escolha determina tudo o resto.

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **P1 — Registo servido pelo ERP** ✅ | `/comecar` do site encaminha para `app.gestpro.co.mz/registo`; o ERP provisiona e faz `signIn` na mesma origem | Sem *token* de passagem, sem tabela nova, sem migração; a palavra-passe nunca toca no servidor do site; `SameSite=Lax` intacto; reaproveita `/auth/login` e `/auth/mudar-palavra-passe` que já existem | Salto de domínio visível a meio do funil; analytics passa a ser *cross-domain*; a página pública entra na app autenticada (CSP, *bundle*) |
| P2 — Formulário no site, `fetch` do browser para o ERP | O browser chama o ERP *cross-origin* com `credentials: 'include'` e o ERP devolve `Set-Cookie` | Funil num só domínio; zero mudanças visuais | Exige `SameSite=None` no *cookie* de sessão — **de todo o ERP**, não só do registo. Regressão de CSRF em toda a aplicação por causa de um ecrã. Recusado |
| P3 — Ressuscitar o `TokenHandoff` | Registo no site, *token* de uso único, `/auth/registo-callback` troca-o por sessão | Funil num só domínio, sem tocar em `SameSite` | Reverte o ADR-0013 §5 no ponto em que ele é mais forte: segredo próprio, TTL de 60 s, `jti` único, consumo atómico, limitador, rota e componente de callback — ~145 linhas de serviço + modelo + migração, para poupar um salto de domínio. E a palavra-passe continuaria a atravessar o servidor do site, ou o utilizador entraria sem nunca a ter definido |

**Recomendação: P1.** O ADR-0013 §5 argumentou que «um *token* que não concede nada não
precisa de ser protegido» para matar o handoff; o simétrico é igualmente verdadeiro — um
*token* que **concede** uma sessão obriga a todo o aparato, e a única razão para o ter é
manter o formulário noutro domínio. Servir o formulário na origem que emite o *cookie*
elimina o problema em vez de o proteger. O custo real é a medição do funil (Requisito 7),
que se resolve com um evento servidor→Plausible, e o salto de domínio, que já existe hoje no
botão «Entrar» do site.

P3 fica como reversão documentada caso o salto de domínio se venha a revelar caro na
conversão medida: a decisão é reversível sem tocar no provisionamento, porque o Requisito 1.5
obriga a que a lógica pública viva numa só função partilhada.

## 2. Sequência ponta a ponta

```
gestpro.co.mz/precos            → CTA «Experimentar 14 dias» (?plano=PROFISSIONAL)
gestpro.co.mz/comecar           → 307 app.gestpro.co.mz/registo?plano=…&utm_*=…
app.gestpro.co.mz/registo       → formulário (empresa, NUIT, província, admin, senha, Turnstile)
   └─ Server Action `registarTenantPublico`
        ├─ registarTenant()  ← função partilhada com POST /api/publico/registo
        │    1. captcha (fail-closed) + rate-limit (IP, e-mail) + Zod
        │    2. reserva Idempotency-Key  (fingerprint SHA-256 do corpo)
        │    3. Keycloak: garantirUtilizador({ accoes: [], emailVerificado: false })
        │    4. Keycloak: definirPalavraPasse(sub, senha, { temporaria: false })
        │    5. prismaBase.$transaction: Tenant → ConfiguracaoFiscal → Assinatura(TRIAL)
        │                               → User(keycloakSub) → RBAC → PGC-NIRF → séries
        │                               → Notificacao(PENDENTE)
        │    6. conclui Idempotency-Key com { tenantSlug }
        ├─ signIn('credentials', { email, senha, redirect: false })   ← DAG (ADR-0029)
        ├─ void enviarEmailVerificacao(sub, email)        ← fora da transacção
        ├─ void plausible('registo_concluido', { plano, utm_* })
        └─ redirect('/dashboard?onboarding=1')
```

O `signIn` corre **depois** de o provisionamento estar concluído e **antes** do envio do
e-mail: o utilizador entra mesmo que o SMTP esteja em baixo, exactamente como o spec 19 já
decidiu para o e-mail de acções («não é fatal — o tenant existe»).

Repetição com a mesma `Idempotency-Key`: a função partilhada devolve a resposta guardada, o
`signIn` corre à mesma com as credenciais submetidas, e o Keycloak decide. Ao contrário do
handoff (gap 3 do spec 19 — *token* já expirado na repetição), aqui a repetição é
naturalmente segura: a credencial é a mesma e a prova é a palavra-passe, não um *token*
guardado numa resposta.

## 3. Deltas de código

### `apps/erp`

| Ficheiro | Mudança |
|---|---|
| `src/server/provisioning/registo-publico.ts` | **Novo.** Extrai o corpo do Route Handler para `registarTenant(entrada, contexto)`: captcha, rate-limit, Zod, idempotência, Keycloak, transacção. Sem `NextResponse` — devolve um resultado discriminado |
| `src/app/api/publico/registo/route.ts` | Passa a adaptador HTTP: mapeia o resultado para 201/4xx/5xx, mantendo os códigos publicados em `site-provisionamento.md` |
| `src/app/registo/page.tsx` + `registo-form.tsx` | **Novo.** Server Component + folha cliente (`useActionState`, Turnstile, `plano` por *query string*). Sem modais (`ui-conventions`) |
| `src/app/registo/actions.ts` | **Novo.** `registarTenantPublico` — `registarTenant()` → `signIn` → e-mail → evento → `redirect`. Não usa `createSafeAction` (não há sessão nem tenant); a validação e o anti-abuso vêm da função partilhada |
| `src/lib/validations/onboarding.ts` | `RegistoTenantSchema` ganha `senha` + `confirmacao` (mín. 10, igual ao ecrã de mudança) |
| `src/server/auth/keycloak.ts` | `enviarEmailVerificacao(sub, email)` e `marcarEmailVerificado(sub)` (Admin API `PUT /users/{id}` com `emailVerified: true`) |
| `src/app/api/publico/verificar-email/route.ts` | **Novo.** Valida HMAC + prazo, chama `marcarEmailVerificado`, 303 para `/auth/login?verificacao=ok` (ou `/dashboard` se houver sessão) |
| `src/lib/auth.ts` | Propaga `email_verified` do *access token* para o JWT e para a sessão, na emissão e na re-resolução de 15 min |
| `src/server/services/**` | Dois travões: emissão de documento fiscal e criação/reactivação de `User` |
| `middleware.ts` | `/registo` em `PUBLIC_PATHS` (`/api/publico/*` já lá está) |
| `next.config.ts` | CSP da rota pública: `challenges.cloudflare.com` em `script-src`/`frame-src`, sem alargar as rotas autenticadas |
| `.env.example` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `EMAIL_VERIFY_SECRET`, `PLAUSIBLE_*` |

### `apps/site`

| Ficheiro | Mudança |
|---|---|
| `src/app/[locale]/(marketing)/comecar/page.tsx` | Passa a `redirect(307)` com `plano` + `utm_*` preservados e `<a>` de reserva |
| `src/components/marketing/formulario-registo.tsx`, `campos.tsx` (parte), `turnstile.tsx` | **Removidos** |
| `src/actions/registo.ts`, `src/lib/registo.ts`, `src/lib/validations.ts` (parte), `src/lib/rate-limit.ts` (se ficar sem uso) | **Removidos** |
| `messages/pt.json`, `messages/en.json` | Remover `comecar.campos.*` e `comecar.erros.*`; manter o essencial da página de passagem |
| `.env.example` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` sai do site |

**Sem migração Prisma.** Nada de novo em Postgres: o estado de verificação vive no Keycloak
e chega pela sessão; o `TokenHandoff` e o `TokenVerificacaoEmail` continuam mortos.

## 4. A ligação de verificação

Assinada e **sem estado**: `base64url({ sub, email, exp })` + HMAC-SHA256 com
`EMAIL_VERIFY_SECRET` (distinto de `AUTH_SECRET`). Não há tabela, não há `jti`, não há
consumo atómico — e não é descuido: o efeito da ligação é pôr um booleano a `true` no
Keycloak, é idempotente, e **não concede sessão nenhuma**. É literalmente o critério que o
ADR-0013 §5 usou para dispensar o aparato do handoff, aplicado a um caso onde é verdadeiro.

Prazo 24 h; reenvio a partir do aviso do `/dashboard`, com limitação por `sub`. A recusa por
prazo expirado leva ao reenvio, nunca a um beco sem saída (mesma regra do ADR-0030 §4).

## 5. O que a verificação pendente trava, e porquê só isso

| Acto | Sem verificação | Racional |
|---|---|---|
| Emitir documento fiscal | **Recusado** | É o acto irreversível e com efeito para terceiros. Um registo com o e-mail de outra pessoa não pode emitir um documento fiscal em nome dela |
| Criar/reactivar `User` | **Recusado** | Convidar terceiros a partir de uma conta não confirmada é o vector de abuso que o e-mail de verificação existe para fechar |
| Configurar, importar, explorar | Passa | É o tempo-até-valor que este spec existe para reduzir |
| Checkout, Portal, pagar | Passa | Nunca se trava quem quer pagar (ADR-0027 §6) |
| Exportar | Passa | Os dados são do cliente |

A verificação é feita **em cada um dos dois serviços**, com o seu próprio `COUNT`/leitura, sem
abstracção partilhada — mesma escolha e mesmo racional do ADR-0027 §3 para os limites de
plano. Cada travão tem teste da transição nos dois sentidos (`estado-com-escritor`).

## 6. Segurança

- **Caminho da palavra-passe**: browser → Server Action do ERP → Admin API do Keycloak.
  Um salto a menos do que qualquer alternativa que mantenha o formulário no site. Nunca em
  log, URL, Postgres ou `respostaJson`. Herda a exposição já aceite e documentada pelo
  ADR-0029/0030 («o ERP vê a palavra-passe em claro»), sem a agravar.
- **`fingerprint` da idempotência** é SHA-256 do corpo, que inclui a palavra-passe. É um
  digest de um corpo de alta entropia, não um verificador de credencial, e não é
  reversível — mas fica documentado no ficheiro, porque quem o ler daqui a um ano vai
  perguntar.
- **Enumeração de contas**: a superfície passa a aceitar credenciais, logo a limitação de
  tráfego distribuída (ADR-0014/Redis) deixa de ser dívida herdada e passa a pré-requisito
  de abertura (Requisito 5.2).
- **`SameSite` não muda.** É o ponto inteiro do P1.
- **CSP**: a excepção para o Turnstile é da rota `/registo`, não do ERP.

## 7. Observabilidade

Eventos estruturados sem PII: `registo.iniciado`, `registo.concluido` (com `plano`, `utm_*`),
`registo.falhado` (com `code`, `traceId`), `verificacao.enviada`, `verificacao.concluida`,
`verificacao.expirada`, `entrada.imediata.falhou` — este último é o que interessa vigiar: um
provisionamento bem-sucedido cujo `signIn` falha deixa um tenant válido com um utilizador
confuso, e o ecrã DEVE nesse caso encaminhar para `/auth/login` com a mensagem certa em vez
de mostrar erro genérico.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| `signIn` falha depois do provisionamento | Resultado tratado: mensagem «conta criada — inicie sessão» + ligação para `/auth/login` já com o e-mail preenchido. Alerta em `entrada.imediata.falhou` |
| Registo com e-mail de terceiro entra no produto | Travões do §5 + Turnstile + limitação de tráfego. O que ele **não** consegue fazer é o que causaria dano |
| Conversão cai com o salto de domínio | Medível pelo Requisito 7; P3 fica documentado como reversão, contida na camada de apresentação |
| ADR-0027 entra em paralelo e toca no mesmo pipeline de escrita | Tarefa 0: decidir a ordem antes de começar |
| Keycloak em baixo no momento do registo | Já é o caso hoje; ordem Keycloak-primeiro mantém o pedido repetível sem lixo em Postgres |
