# Handoff — spec 21, lane L4 (`s21-verificacao-email`), tarefa 4

Ramo: `s21-verificacao-email`, criado de `ws-21`.
Governa: **ADR-0031 §5 e §6** (inverte o ADR-0013 §4), ADR-0011 (re-resolução de 15 min),
ADR-0029/0030 (como o ERP fala com o Keycloak), `design.md` §4.
**Migrations: nenhuma.** O `TokenVerificacaoEmail` continua morto e não foi ressuscitado.

## 1. O que ficou feito

| Tarefa | Estado |
|---|---|
| 4.1 `enviarEmailVerificacao(sub, email)` + ligação assinada, 24 h | feito |
| 4.2 `GET /api/publico/verificar-email` — 303, idempotente, rate-limit por IP | feito |
| 4.3 `marcarEmailVerificado(sub)` (Admin API) | feito |
| 4.4 `email_verified` → JWT → sessão, na emissão **e** na re-resolução | feito |
| 4.5 Aviso persistente no `/dashboard` com reenvio + checklist | feito |

`pnpm check` verde (90 ficheiros, 1298 testes), `pnpm gates` verde, `pnpm build` verde.

## 2. O formato exacto da ligação assinada

```
token   = base64url(JSON.stringify({ sub, email, exp })) + "." + base64url(HMAC-SHA256(segredo, carga))
carga   = a parte à esquerda do ÚLTIMO ponto
exp     = epoch em SEGUNDOS, = emissão + 86 400 (24 h)
URL     = ${APP_URL}/api/publico/verificar-email?t=<token urlencoded>
```

- O segredo é `EMAIL_VERIFY_SECRET`, **distinto do `AUTH_SECRET`** (ADR-0031 §5).
- Comparação da assinatura por `timingSafeEqual`, com verificação de comprimento antes.
- **A assinatura é verificada ANTES do prazo.** Pela ordem inversa, um `exp` forjado decidia a
  resposta sozinho. Há um teste só para isto.
- Ausência do claim ou de campos na carga ⇒ `malformada`; nunca uma excepção para cima.

Implementação: `apps/erp/src/server/auth/ligacao-verificacao.ts`
(`assinarTokenVerificacao`, `validarTokenVerificacao`, `urlVerificacao`, `baseAplicacao`,
`PRAZO_VERIFICACAO_SEGUNDOS`).

### Porque não há tabela, `jti` nem consumo atómico

Está escrito por extenso no cabeçalho de `src/app/api/publico/verificar-email/route.ts`, que é
onde quem investigar um incidente vai primeiro — como pedido. Em resumo: o efeito da ligação é
pôr um booleano a `true` no Keycloak; é idempotente e **não concede sessão nenhuma**. É o mesmo
critério com que o ADR-0013 §5 dispensou o aparato do `TokenHandoff`, aplicado a um caso onde é
verdadeiro. O simétrico continua a valer, e é por isso que o handoff continua morto.

## 3. Variáveis de ambiente

| Variável | Obrigatória | Omissão |
|---|---|---|
| `EMAIL_VERIFY_SECRET` | **sim em produção** | em dev, marcador `gespro-email-verify-dev-secret`; em produção lança no **runtime** (não no `next build`, que não tem segredos) — mesma política do `KEYCLOAK_CLIENT_SECRET` |

Reutilizadas, não introduzidas: `APP_URL`/`NEXTAUTH_URL` (base do link), `EMAIL_PROVIDER` +
SMTP (spec 13), `RATE_LIMIT_DRIVER`/`VALKEY_URL` (ADR-0014).

**`EMAIL_VERIFY_SECRET` NÃO foi acrescentado ao `.env.example`**: esse ficheiro é da L3
(tarefa 3.5). Fica aqui o pedido explícito — sem a entrada, quem montar produção descobre-o
pela excepção do primeiro envio.

## 4. `email_verified` — o caminho, ponta a ponta

```
Keycloak (access token, claim email_verified)
  ├─ login:          direct-grant.ts → autenticarPorPalavraPasse → { …, emailVerificado }
  │                    → authorize → callbacks.jwt (emissão) → token.emailVerificado
  └─ re-resolução:   renovarTokens → emailVerificadoDoToken(accessToken) → token.emailVerificado
                       → callbacks.session → session.user.emailVerificado
```

- **Sem coluna em Postgres. Sem uma chamada ao Keycloak por pedido.** O claim vem de borracha
  com o token que a re-resolução já ia buscar de qualquer maneira.
- **Fail-closed**: claim ausente conta como `false`, tanto na leitura do token como na sessão.
  Um JWT emitido antes deste ramo não tem o campo; a re-resolução seguinte (≤15 min) corrige.
- **`indisponivel` na renovação mantém o valor anterior** — uma avaria do Keycloak não levanta
  nem impõe travões.
- **Consequência a assumir**: confirmar o e-mail só se reflecte na sessão em curso na
  re-resolução seguinte (até 15 min, ADR-0011). É o mesmo preço já pago por retirar um papel.
  O aviso do painel di-lo com todas as letras a quem acabou de confirmar (`?verificacao=ok`),
  senão toda a gente carregava em «reenviar» sem necessidade.

Tipos estendidos em `src/types/next-auth.d.ts`: `Session.user.emailVerificado: boolean`
(sempre presente) e `JWT.emailVerificado?: boolean` (opcional — tokens antigos).

**Para a L5 (travões, tarefa 5):** o valor a ler é `session.user.emailVerificado`. É um
booleano já resolvido; não há serviço para chamar nem chamada ao Keycloak a fazer.

## 5. Ficheiros tocados

**Novos**
- `apps/erp/src/server/auth/ligacao-verificacao.ts`
- `apps/erp/src/server/email/templates/verificacao-email.ts`
- `apps/erp/src/app/api/publico/verificar-email/route.ts`
- `apps/erp/src/server/actions/verificacao-email.actions.ts`
- `apps/erp/src/components/onboarding/aviso-email-por-confirmar.tsx`
- testes: `src/server/auth/__tests__/ligacao-verificacao.test.ts`,
  `src/server/auth/__tests__/verificacao-email.test.ts`,
  `src/app/api/publico/__tests__/verificar-email-handler.test.ts`

**Alterados (dentro do que a lane possui)**
- `apps/erp/src/server/auth/keycloak.ts` — **só acrescentado** no fim:
  `marcarEmailVerificado`, `enviarEmailVerificacao`. Nada do que lá estava foi tocado.
- `apps/erp/src/lib/auth.ts` — **só** a propagação de `email_verified` (3 pontos).
- `apps/erp/middleware.ts` — `/api/publico/verificar-email` **e** `/registo` em `PUBLIC_PATHS`
  (a segunda é da L3, antecipada para este ficheiro não ter dois donos), e o comentário que
  dizia «o ADR-0013 removeu /api/publico/verificar-email» corrigido.
- `apps/erp/src/types/next-auth.d.ts` — `emailVerificado` na sessão e no JWT.
- `apps/erp/src/app/dashboard/page.tsx` + `src/components/onboarding/checklist-onboarding.tsx`
  — montagem do aviso e o primeiro item da checklist (tarefa 4.5).

**Alterados FORA da lista de propriedade da lane — precisam de olho do orquestrador**

1. `apps/erp/src/server/auth/direct-grant.ts` — o claim `email_verified` só existe no *access
   token*, e o access token do login só passa por aqui. `subDoToken` foi generalizado em
   `payloadDoToken`; acrescentou-se `emailVerificadoDoToken` (exportada, usada também pelo
   `auth.ts` na renovação) e o campo `emailVerificado` ao resultado de sucesso. Sem isto a 4.4
   era impossível sem uma chamada ao Keycloak no login. Nenhuma outra lane do spec 21 declara
   este ficheiro.
2. `apps/erp/src/server/auth/__tests__/direct-grant.test.ts` — a asserção `toEqual` do caminho
   feliz partia com o campo novo. Corrigida + um teste novo para a propagação.
3. `apps/erp/src/server/security/rate-limiter.ts` — `verificacaoEmailLimiter` deixou de estar
   `@deprecated` («Keycloak trata verificação de e-mail» passou a ser falso com o ADR-0031) e
   passou a `createRateLimiterFromEnv`; acrescentou-se `reenvioVerificacaoLimiter` (3/h por
   `sub`). É a casa canónica destas instâncias — o ficheiro diz para não instanciar limitadores
   fora dele. Nenhuma outra lane o declara.

## 6. Decisões tomadas dentro da lane

1. **`enviarEmailVerificacao` vive em `keycloak.ts`** porque o `design.md` §3 e o mapa de donos
   o mandam, mas o transporte entra por `await import()` e não por import estático:
   `@/server/email` resolve o provider (e carrega o nodemailer) no momento do import, e
   `keycloak.ts` é importado por `src/lib/auth.ts`, ou seja por quase todos os Server
   Components. Um import estático punha o cliente SMTP no grafo de arranque da aplicação
   inteira para servir um caminho que corre uma vez por conta.
2. **Não grava `Notificacao`.** O contrato da assinatura é `(sub, email)` — sem `tenantId` nem
   `userId`, e a tabela exige os dois. O «persistir-depois-enviar» existe para não perder o
   efeito duradouro de uma notificação; aqui o efeito duradouro é o booleano no Keycloak, que
   a ligação escreve. Fica o evento estruturado `verificacao.enviada`. Se a plataforma quiser
   o rasto in-app, a assinatura tem de crescer — é decisão do orquestrador, não da lane.
3. **A action de reenvio não tem `permission`.** Confirmar o próprio endereço não é uma
   capacidade que se atribua a um papel, e o alvo é sempre a identidade da sessão. O catálogo
   em `prisma/seed/rbac.ts` não ganha entrada nenhuma.
4. **O reenvio lê `sub` e e-mail em Postgres pelo `userId` da sessão.** Nunca do corpo do
   pedido: escolher o destinatário a partir do cliente é o vector de amplificação que o
   captcha fecha no registo público.
5. **O aviso não é dispensável e não é modal.** Enquanto o endereço não estiver confirmado há
   dois actos travados; um aviso que se fecha seria lido uma vez e esquecido até à primeira
   recusa. E fechar o ecrã com um modal contrariava o ponto inteiro do ADR-0031.
6. **A rota responde sempre 303, nunca JSON.** Quem a abre é um browser vindo de um cliente de
   e-mail. Destino `/dashboard` com sessão, `/auth/login` sem ela, com
   `?verificacao=ok|expirada|invalida|erro|limitada`.
7. **O primeiro item da checklist passou a «Confirmar o endereço de e-mail»** e o item
   «Activar a conta» (`primeiroAcessoEm`) foi removido: com o ADR-0031 quem se regista entra na
   mesma submissão, portanto esse passo estaria sempre feito e a dizer uma coisa falsa
   («e-mail confirmado e palavra-passe definida»).

## 7. Gaps deixados, com motivo

1. **`EMAIL_VERIFY_SECRET` fora do `.env.example`** — o ficheiro é da L3 (tarefa 3.5). Se a L3
   mudar de âmbito, alguém tem de o acrescentar antes de produção.
2. **Ninguém chama `enviarEmailVerificacao` ainda.** O chamador é a Server Action de `/registo`
   (tarefa 3.2, L3) e, em segundo lugar, `registarTenant` (L1). A lane publica a função e o
   reenvio; a ligação ao fluxo de registo é da fase 2.
3. **Sem E2E.** A tarefa 9.2 (registo → sessão → aviso → verificação → travão levantado) é do
   orquestrador na fase 4, e metade do percurso ainda não existe. O que esta lane prova em
   unitários: assinatura, prazo, adulteração, 303, destino por sessão, idempotência da segunda
   visita, limite por IP, falha do Keycloak e escape de HTML no template.
4. **O aviso é só no `/dashboard`.** É o que a tarefa 4.5 pede. Quem entre directamente noutra
   rota não o vê até passar pelo painel — e vai bater no travão da L5 com a mensagem dele. Se
   isso se revelar pouco, o sítio certo é o layout, não mais um sítio a repetir a regra.
5. **`/api/cron/expirar-registos-nao-verificados` ficou com o nome a mentir.** Expurga tenants
   cujos utilizadores têm `primeiroAcessoEm` nulo — com o ADR-0031, quem se regista entra
   imediatamente e nunca mais é apanhado por ele. Não é regressão (não apaga ninguém a mais) e
   é matéria do ADR-0016 Camada 4, fora desta lane: **não foi tocado**. Alguém tem de decidir
   se o critério passa a ser `emailVerificado`, o que exigiria ler o Keycloak em lote.
6. **A conta demo e as contas convidadas não mostram aviso** porque o realm as tem com
   `emailVerified: true`. É o esperado; fica registado para não parecer que o aviso não funciona.

## 8. Contra o design — nada

Nenhuma decisão da lane contraria o ADR-0031 ou o `design.md`. Os três desvios de **propriedade
de ficheiro** estão na §5 e são deliberados, não descuidos: sem o `direct-grant.ts` a 4.4 não
se faz, e sem o `rate-limiter.ts` o limite da 4.2 teria de ser instanciado num sítio que o
próprio ficheiro proíbe.
