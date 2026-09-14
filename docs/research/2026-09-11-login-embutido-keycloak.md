## Contexto

Hoje `/auth/login` não é um ecrã nosso: é um redireccionamento. O
`apps/erp/src/app/(auth)/auth/login/page.tsx` dispara `signIn('keycloak')` e o browser
salta para o ecrã do Keycloak (Authorization Code + PKCE, cliente confidencial
`gespro-erp`). O realm importado tem `directAccessGrantsEnabled: false` e
`standardFlowEnabled: true` (`infra/keycloak/realm-gespro.json`).

Isto foi decidido, não aconteceu por omissão: **ADR-0012 §8** fixa que «a porta de entrada do
produto passa a ser servida pelo Keycloak», com o tecto da personalização em CSS de marca,
logótipo e `messages_pt_PT.properties` — *templates* FreeMarker não se tocam.

## O que se pede

Que o início de sessão aconteça **na UI do GestPro** — formulário próprio, tokens de
`packages/brand`, PT-PT, tema claro/escuro — falando com o Keycloak por API em vez de
redireccionar para o ecrã dele.

## Conflito com decisões aceites — é isto que trava o ticket

O **ADR-0012 §8** rejeita expressamente o *Direct Access Grant* nestes termos: «Devolvia o
aspecto, mas punha o ERP a receber palavras-passe outra vez e matava MFA e federação, que são
as duas coisas pelas quais se adoptou o Keycloak (ADR-0010)».

Pela governação do repositório (ADR-0023; `Usage.md`), um ADR aceite não se reescreve: **esta
mudança exige um ADR novo** que substitua o §8. O próximo número livre é **0028**
(`docs/decisions/README.md`). Enquanto esse ADR não existir, a issue **não** é `ready-for-agent`
— a decisão ainda não está tomada, e pô-la assim faria um agente escolher o que não é seu.

## Alternativas

| Opção | Prós | Contras |
|---|---|---|
| **A. Direct Access Grant (ROPC)** — form nosso → Server Action → `POST /protocol/openid-connect/token` com `grant_type=password` | UI 100% nossa, sem salto de domínio; o segredo do cliente fica no servidor | Mata federação (IdP brokering) e login social; MFA só via fluxo *direct grant* com OTP, sem WebAuthn nem *step-up*; o ERP volta a ver palavras-passe; sem cookie de SSO no Keycloak; desaconselhado pela BCP de segurança do OAuth 2.0 — [RFC 9700 §2.4](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.4): *«the resource owner password credentials grant MUST NOT be used»* |
| **B. Manter Authorization Code + PKCE e levantar o tecto do §8** — substituir os *templates* FreeMarker do tema `gespro` (`login.ftl`, `login-update-password.ftl`, `login-verify-email.ftl`, `login-reset-password.ftl`) | Aspecto e cópia 100% nossos sem perder nada: MFA, federação, *required actions*, SSO e protecção anti-força-bruta ficam onde estão; zero código de autenticação no ERP | O salto de domínio continua visível; revalidar os *templates* a cada actualização trimestral do Keycloak (ponto 6 do ADR-0012) — exactamente o custo recorrente que o §8 quis evitar |
| **C. Híbrido** — form nosso a submeter para `login-actions/authenticate` do fluxo em curso | Aspecto nosso mantendo o fluxo padrão | Endpoint interno, sem contrato público; parte em qualquer actualização. Não recomendado |
| **D. Status quo** | Custo zero | Não resolve o requisito |

**Recomendação técnica: B.** Resolve o problema real — «o ecrã de entrada não parece nosso» —
sem pagar com as capacidades pelas quais se adoptou o Keycloak. A opção A só se justifica se o
requisito for mais forte do que estética: por exemplo, ausência total de salto de domínio como
requisito contratual, ou login por número de telefone/credencial que o Keycloak não modela.

## O que a opção A obriga a resolver (não é só trocar o provider)

1. **Primeiro acesso e recuperação partem-se.** Pelo ADR-0013 §2/§5-bis os utilizadores são
   criados **sem credencial**, com `VERIFY_EMAIL` + `UPDATE_PASSWORD` pendentes, e é o e-mail de
   acções do Keycloak que dá entrada no produto. O *direct grant* recusa contas com acções
   obrigatórias pendentes (`invalid_grant` / «Account is not fully set up»). Ou se constroem
   ecrãs próprios para definir palavra-passe e verificar e-mail — e aí o ERP passa a **escrever**
   credenciais pela Admin API —, ou estes fluxos continuam no Keycloak e a UI fica meio nossa,
   meia dele.
2. **`src/lib/auth.ts`**: `Keycloak(...)` → `Credentials(...)`. O `callbacks.signIn` deixa de
   receber `profile`; `resolverUtilizadorLocal` passa para o `authorize()`, e o `sub` passa a sair
   do *access token*. A re-resolução de 15 min e o `kcRefreshToken` do ADR-0011 **mantêm-se
   intactos** — é o contrato que não pode regredir.
3. **Força bruta.** A detecção do Keycloak continua a aplicar-se, mas todas as tentativas chegam
   com o IP do servidor: o bloqueio por IP degrada-se. Exige limite próprio por IP+utilizador em
   `src/server/security/rate-limiter.ts` (ADR-0014), com `X-Forwarded-For` tratado no proxy.
4. **Higiene da palavra-passe no nosso perímetro**: nunca em log (redacção explícita no
   `logger`), nunca em `searchParams`, nunca persistida, só POST.
5. **Realm**: `directAccessGrantsEnabled: true` no `realm-gespro.json` — configuração é código.
6. **Terminar sessão**: sem cookie de SSO, `GET /api/auth/logout-keycloak` (RP-initiated logout)
   perde sentido; o *logout* passa a ser revogação do *refresh token*.
7. **Portão de acessibilidade**: o `e2e/a11y.a11y.ts` aponta hoje ao ecrã do Keycloak nos dois
   temas (Consequências do ADR-0012). Volta a apontar a `/auth/login` — 32/32 WCAG AA mantém-se.
8. **E2E a reescrever**: `e2e/auth.setup.ts`, `e2e/01-login.spec.ts`, `e2e/07-sessao.spec.ts`.

## Critérios de aceitação

**Transversais (qualquer opção)**
- [ ] ADR-0028 escrito, com o índice `docs/decisions/README.md` actualizado no mesmo PR, a
      declarar o ADR-0012 §8 substituído nessa parte.
- [ ] Ecrã de entrada em PT-PT, tokens de `packages/brand`, claro e escuro, 32/32 WCAG AA.
- [ ] `pnpm check` e `pnpm e2e` verdes.

**Se a decisão for A (direct grant)**
- [ ] Autenticação por formulário próprio, sem salto de domínio, com mensagens de erro
      distinguindo credenciais inválidas, conta inactiva, conta por activar e subscrição suspensa.
- [ ] Palavra-passe não aparece em nenhum log nem URL (teste que o prove).
- [ ] Limite de tentativas por IP e por utilizador, com teste.
- [ ] Garantias do ADR-0011 inalteradas: re-resolução ≤ 15 min, revogação de papel/desactivação
      /suspensão de subscrição a fazer efeito no mesmo intervalo (cenário E2E existente a passar).
- [ ] Fluxos de primeiro acesso e recuperação de palavra-passe definidos e implementados.
- [ ] ADR-0028 regista MFA, federação e *step-up* como capacidades **perdidas**, não omitidas.

**Se a decisão for B (templates do tema)**
- [ ] `login.ftl` e as páginas de credenciais servidas pelo tema `gespro` com a marca do produto.
- [ ] Procedimento de revalidação do tema na actualização trimestral do Keycloak, no runbook.

## Blocked by

Nenhuma issue. Bloqueada por **decisão**: sem ADR-0028 não há trabalho a pegar.
