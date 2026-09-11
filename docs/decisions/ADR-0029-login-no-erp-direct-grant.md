# ADR-0029 — O início de sessão volta ao ERP (Direct Access Grant)

- **Estado**: Proposto
- **Data**: 2026-09-12
- **Contexto**: Issue #57 · Wave 8
- **Substitui**: [ADR-0012](./ADR-0012-alojamento-keycloak.md) §8 e [ADR-0028](./ADR-0028-ecra-de-entrada-templates-do-tema.md) §2, **na parte que rejeitava o Direct Access Grant**
- **Relacionados**: [ADR-0010](./ADR-0010-keycloak-fornecedor-identidade.md), [ADR-0011](./ADR-0011-fronteira-autorizacao.md), [ADR-0013](./ADR-0013-migracao-identidade.md), [ADR-0014](./ADR-0014-cache-e-rate-limit-distribuido.md)

## Contexto

O ADR-0012 §8 entregou a porta de entrada ao Keycloak e rejeitou o *Direct Access Grant*. O
ADR-0028 levantou o tecto da personalização — a disposição do ecrã passou a ser nossa — e
**reconfirmou** a rejeição.

Executado o ADR-0028, o ecrã passou a ter a cara do produto: cartão com o raio e o contorno da
marca, largura dos formulários do ERP, tipografia própria, logótipo e língua. **O salto de domínio
manteve-se**, porque era o que estava decidido: a resposta ao levantamento de requisitos foi que o
problema era coerência de marca, não a mudança de endereço.

Não chegou. Com o ecrã já a parecer nosso, o salto continuou a ser o que incomoda, e a decisão
inverte-se: **o formulário volta para dentro do ERP**, falando com o Keycloak pela API.

Este ADR existe para que ninguém tenha de reconstruir o raciocínio, e sobretudo para que o que se
perde fique escrito onde não se pode ignorar.

## Decisão

### 1. O ERP autentica por Direct Access Grant

O formulário vive em `/auth/login`, no ERP. As credenciais vão para o servidor e de lá para o
*endpoint* de token do Keycloak com `grant_type=password`. O realm passa a ter
`directAccessGrantsEnabled: true` — configuração é código (ADR-0012 §7).

O segredo do cliente **nunca** sai do servidor. A palavra-passe **nunca** entra num log, num URL
ou em armazenamento — só em corpo de POST, e só até à chamada ao Keycloak.

### 2. A fronteira de autorização do ADR-0011 não muda — é o que não pode regredir

`sub` do Keycloak → `User` local → permissões em Postgres. A re-resolução de 15 minutos
mantém-se, e o `kcRefreshToken` continua a ser renovado no mesmo ciclo. Revogar um papel,
desactivar um utilizador ou suspender uma subscrição continua a fazer efeito **no máximo em 15
minutos**, sem o utilizador ter de sair.

O que muda é apenas **de onde vem o `sub` na emissão inicial**: sai do *access token* devolvido
pelo *direct grant*, em vez do `profile` do fluxo OIDC.

### 3. O que se perde, e não é omissão

| Capacidade | Estado |
|---|---|
| **Federação / SSO empresarial** (Azure AD, Google Workspace) | **Perdida.** O *direct grant* não medeia identidade de terceiros. Um cliente que peça SSO próprio não pode ser servido sem reverter esta decisão |
| **MFA** | **Reduzida a OTP** pelo fluxo de *direct grant*. Sem WebAuthn, sem *passkeys*, sem *step-up* por acção sensível |
| **Cookie de SSO no Keycloak** | Deixa de existir. Não há sessão partilhada entre aplicações do realm |
| **Protecção anti-força-bruta do Keycloak** | Degradada: todas as tentativas chegam com o IP do servidor. O bloqueio por IP do Keycloak deixa de distinguir atacantes — daí o ponto 4 |
| **Primeiro acesso e recuperação de palavra-passe** | **Partem-se.** Ver ponto 5 |

O ADR-0010 adoptou o Keycloak por federação e MFA. Esta decisão desfaz metade dessa razão. Fica
dito: se qualquer uma delas voltar a ser requisito, é este ADR que se substitui.

A [RFC 9700 §2.4](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.4) desaconselha
expressamente este fluxo — «the resource owner password credentials grant MUST NOT be used». A
decisão é tomada contra essa recomendação, com conhecimento dela, por o salto de domínio ser
julgado inaceitável para o produto.

### 4. Limite de tentativas próprio

Como o Keycloak deixa de ver o IP de quem tenta, o ERP impõe o seu: limite por **IP** e por
**identificador tentado**, na rota de autenticação, com o adaptador do ADR-0014. O
`X-Forwarded-For` é lido do proxy, não do pedido directo.

### 5. O primeiro acesso e a recuperação continuam no Keycloak — por agora

O ADR-0013 §2/§5-bis cria os utilizadores **sem credencial**, com `VERIFY_EMAIL` e
`UPDATE_PASSWORD` pendentes, e é o e-mail de acções do Keycloak que dá entrada no produto. O
*direct grant* **recusa** contas com acções obrigatórias pendentes (`invalid_grant`).

Consequência aceite: **a UI fica meia nossa, meia dele.** O início de sessão é nosso; definir a
primeira palavra-passe e recuperá-la continuam a acontecer no ecrã do Keycloak — que, graças ao
ADR-0028, já tem a cara do produto.

A alternativa — o ERP escrever credenciais pela Admin API — **não é adoptada agora**: põe o
produto a gerir palavras-passe, que é precisamente o que o ADR-0010 quis tirar de cima. Se a
costura incomodar, é um ADR próprio.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Direct Access Grant** ✅ | Sem salto de domínio; UI inteiramente nossa | Perde federação e reduz MFA; o ERP recebe palavras-passe; desaconselhado pela RFC 9700 |
| Manter o Authorization Code com o tema do ADR-0028 | Nada se perde; já está feito e verificado | O salto mantém-se — e foi o salto que se julgou inaceitável |
| Subdomínio de marca (`contas.gespro.mz`) | DNS e uma linha de realm; zero código | Arruma o endereço, não elimina o salto |
| Híbrido, submetendo para `login-actions/authenticate` | Aspecto nosso no fluxo padrão | *Endpoint* interno sem contrato público; parte em qualquer actualização |

## Consequências

- **`src/lib/auth.ts`** troca o provider `Keycloak` por `Credentials`. As recusas que viviam no
  `callbacks.signIn` passam para o `authorize()`, que é onde passa a haver identidade.
- **A rota de *logout*** deixa de fazer sentido como RP-initiated logout: sem cookie de SSO, o
  encerramento passa a ser a revogação do *refresh token*.
- **O portão de acessibilidade volta a apontar a `/auth/login`**, e os 32/32 WCAG AA passam a ser
  medidos no nosso ecrã.
- **O tema `gespro` continua a ser necessário** — serve o primeiro acesso e a recuperação (ponto 5).
  O trabalho do ADR-0028 não se desperdiça; muda de âmbito.
- **`e2e/auth.setup.ts`, `01-login` e `07-sessao`** reescrevem-se: deixa de haver salto a esperar.
- **Risco que fica em aberto:** a superfície de autenticação passa a ser nossa, e com ela a
  responsabilidade de a proteger. O ponto 4 é o mínimo; não é tudo.
