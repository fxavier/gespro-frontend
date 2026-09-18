# Keycloak para pessoal de plataforma: mecanismos de acesso a organizações de clientes e o que cada um faz ao trilho de auditoria

- **Tipo**: nota de investigação (não é ADR, não decide nada)
- **Data**: 2026-09-11
- **Questão**: issue #48 de `fxavier/gespro-frontend`
- **Versão em análise**: Keycloak **26.7** — é a que o `docker-compose.yml` fixa (`quay.io/keycloak/keycloak:26.7.0`).
  Onde a documentação publicada só existe para um *patch* concreto, cita-se 26.7.2/26.7.3.
- **Relacionados**: [ADR-0010](../decisions/ADR-0010-keycloak-fornecedor-identidade.md),
  [ADR-0011](../decisions/ADR-0011-fronteira-autorizacao.md),
  [ADR-0012](../decisions/ADR-0012-alojamento-keycloak.md),
  [ADR-0013](../decisions/ADR-0013-migracao-identidade.md), `CONTEXT.md` §«Acesso de suporte»

---

## 0. Correcção de premissa, antes de tudo o resto

A pergunta parte de «Organizations (já usadas para tenants)». **Não estão.** Verificado no repositório:

| Facto | Onde se verifica |
|---|---|
| `infra/keycloak/realm-gespro.json` não contém a palavra `organization` — **zero ocorrências** | `grep -c -i organization infra/keycloak/realm-gespro.json` → `0` |
| As chaves de topo do realm são apenas `bruteForceProtected, clients, defaultLocale, displayName, duplicateEmailsAllowed, enabled, internationalizationEnabled, loginTheme, loginWithEmailAllowed, realm, registrationAllowed, resetPasswordAllowed, roles, smtpServer, sslRequired, ssoSessionIdleTimeout, ssoSessionMaxLifespan, supportedLocales, users, verifyEmail` | leitura directa do ficheiro |
| O realm `gespro` é único e o tenant resolve-se em Postgres | ADR-0010 §1 e nota de revisão de 2026-08-29: «as Organizations ficam para depois» |

O ADR-0013 §2 ainda diz «criar a **Organization** no Keycloak», mas o próprio §3 corrige-se («com as
Organizations adiadas (ADR-0010), a reconciliação desce ao nível do utilizador»), e o estado montado
concorda com a correcção, não com o §2. **O texto do ADR-0013 §2 está desactualizado face ao que
existe** — é uma dívida de redacção a corrigir, e é a única incoerência material encontrada entre os
ADRs e a infraestrutura.

Consequência para esta investigação: o mecanismo 5 («Organizations com membro externo de acesso
temporário») não é «usar melhor o que já lá está» — é **adoptar uma funcionalidade que hoje não está
ligada**, com o custo de provisionamento que o ADR-0010 explicitamente adiou.

### O resto do ponto de partida verificado no repositório

| Facto | Onde se verifica | Porque importa |
|---|---|---|
| **Nenhum evento é guardado.** O realm não define `eventsEnabled` nem `adminEventsEnabled`; ambos ficam no valor por omissão, que é **desligado** | ausência das chaves em `realm-gespro.json`; [keycloak/keycloak#20503](https://github.com/keycloak/keycloak/issues/20503) descreve o estado por omissão como desactivado *(rastreador do projecto — confiança média, não é documentação)* | Toda a coluna «o que o auditor vê na consola» deste documento é, **hoje, vazia**. Ver §4 |
| Sem `--features` no serviço `keycloak` | `docker-compose.yml` L162-195 | Valem os defaults do perfil: `impersonation:v1`, `organization:v1`, `token-exchange-standard:v2` e `workflows:v1` **activos**; `token-exchange:v1` **inactivo** |
| O cliente `gespro-erp` tem `serviceAccountsEnabled: true` e a conta de serviço tem os papéis `realm-management` → `view-users`, `manage-users` | `realm-gespro.json`, bloco `clients[0]` | Já existe uma conta de serviço em produção. **Não tem** o papel `impersonation` |
| Existe um papel de realm `plataforma-admin`, e mais nenhum | `realm-gespro.json`, `roles.realm` | É um papel *nu*: não é composto de nenhum papel de cliente `realm-management`, portanto **por si só não dá acesso nenhum à consola de administração**. Ver §5 |
| O autor auditado pelo ERP é o utilizador da sessão, sem excepção | `apps/erp/src/server/db/audit-extension.ts`: `userId: ctx.userId`, com `ctx = getTenantContext()` | É o facto que decide tudo o que se segue |
| `AuditLog` tem `tenantId`, `userId` (FK para `User`), `keycloakSub`, `requestId` | `apps/erp/prisma/schema/auth.prisma` L85-105 | Não há campo para «em nome de» nem para um segundo autor |

---

## 1. Quadro comparativo

Duas colunas de autoria porque **são dois trilhos separados**, como o ADR-0011 já reconhece
(«auditoria de acesso fica repartida»). A que conta para um auditor fiscal é a segunda.

| Mecanismo | Autor no trilho do **Keycloak** | Autor no **`AuditLog`** do ERP | Expiração | O que o auditor vê na consola | Veredicto face a ADR-0011 / `CONTEXT.md` |
|---|---|---|---|---|---|
| **1. Realm separado para a plataforma** | O técnico, com a sua identidade do realm da plataforma | **Não chega a haver acção no ERP.** Um utilizador de outro realm não obtém sessão no ERP | Nenhuma nativa: `UserRepresentation` não tem `validUntil`/`expiresAt` | Eventos de administração no realm alvo, com `authDetails.userId` do técnico e `authDetails.realmId` do realm da plataforma | **Compatível, mas resolve outro problema.** Dá administração de *identidade*, não acesso a dados de cliente |
| **2. API de impersonação** | O técnico, num único evento `IMPERSONATE` cujo `userId` é o **cliente** e cujo *detail* `impersonator` é o **username** do técnico | **O cliente.** O ERP recebe uma sessão indistinguível de um login genuíno | Nenhuma própria: herda *SSO Session Idle/Max* do realm | Nada nos **eventos de administração**. Um evento de utilizador, e só se «Save events» estiver ligado | **Incompatível.** Viola directamente `CONTEXT.md` §«Acesso de suporte». Já rejeitado no ADR-0011 §5 |
| **3. Conta de serviço (client credentials)** | O utilizador `service-account-<clientId>`, UUID sem pessoa por trás | **Ninguém, ou o ERP.** Não há `User` local para a conta de serviço → sem sessão, sem `tenantId`, sem autor | Nenhuma para a conta; só o `expires_in` do token | Eventos `CLIENT_LOGIN` e eventos de administração com `authDetails = {realmId, clientId, userId, ipAddress}` — **um UUID e um client id, nenhuma pessoa** | **Incompatível como identidade de um técnico.** Se N pessoas partilham o cliente, os eventos são indistinguíveis entre elas |
| **4. Token exchange** | *Standard v2*: o utilizador do *subject token* — que não muda. *Legacy v1*: o utilizador alvo | Idem: v2 **não consegue** trocar de sujeito; v1 consegue e então o autor é **o cliente**, tal como na impersonação | Só o tempo de vida do token trocado | Evento `TOKEN_EXCHANGE`, com `subject_token_client_id` a identificar o cliente original | **v2: irrelevante** para este problema. **v1: incompatível**, é impersonação por outra porta, e é *preview* + *deprecated* |
| **5. Membro de Organization com acesso temporário** | O técnico, com a sua identidade | **O técnico**, se e só se tiver um `User` local no tenant | **Não é nativa.** A adesão não tem qualquer campo temporal; só o *convite* expira | `ORGANIZATION_MEMBERSHIP` + `CREATE`/`DELETE` nos eventos de administração | **Compatível** — e é, de facto, o ADR-0011 §5 com um invólucro. O invólucro não traz a expiração que faltava |

---

## 2. Mecanismo a mecanismo

### 2.1 Realm separado vs Organizations no mesmo realm

**O que a documentação fixa.** «Realms are isolated from one another and can only manage and
authenticate the users that they control.» O único caminho entre realms é o `master`: «Users in the
Keycloak master realm can be granted permission to manage zero or more realms.» Cada realm é
representado no `master` por um cliente chamado `<realm name>-realm`, cujos papéis de cliente
(`manage-users`, `view-users`, `impersonation`, `manage-organizations`, …) é que concedem o acesso.
Dentro do próprio realm, o equivalente é o cliente `realm-management` e o seu papel composto
`realm-admin`.
Limite duro, citado à letra: **«You cannot do cross realm fine grain permissions. Admins in the
master realm are limited to the predefined admin roles.»**
Fonte: <https://www.keycloak.org/docs/26.7.2/server_admin/index.html>

**O que isto significa aqui — e é a parte que costuma passar ao lado.** Um realm separado para o
pessoal da GestPro é uma decisão sobre **quem administra o Keycloak**, não sobre **quem vê os dados
do cliente**. O ERP está ligado a um único `issuer`
(`KEYCLOAK_ISSUER=http://localhost:8081/realms/gespro`, `docker-compose.yml` L80): um token emitido
por outro realm não é aceite pelo Auth.js. E mesmo que fosse, o `callbacks.signIn` recusa quem não
tenha `User` local (ADR-0011, «Consequências»). **Um técnico num realm da plataforma não consegue,
por esse facto, praticar uma única acção no ERP.** É por isso que o ADR-0011 §5 pode dizer, sem
contradição, que `plataforma-admin` «não dá acesso aos dados de nenhum cliente».

O que o `master` *dá* é o poder de conceder `impersonation` no realm `gespro` — isto é, o realm
separado não é um substituto da impersonação, é o sítio de onde ela se autoriza.

**Organizations no mesmo realm** é a alternativa simétrica: em vez de outro realm, uma fronteira
*dentro* do realm. Uma organização é um agrupamento de utilizadores do realm — «An organization
member is basically a realm user but with a link to one or more organizations» — com domínios de
e-mail, fornecedor de identidade próprio e convites. Um membro **pode pertencer a várias
organizações** (`GET .../members/{member-id}/organizations`), o que é precisamente o que tornaria um
técnico membro de vários tenants em simultâneo.

Histórico de versões, das notas de lançamento oficiais:

| Versão | O que mudou | Fonte |
|---|---|---|
| 25.0.0 | Organizations entram como *technology preview* | <https://www.keycloak.org/2024/06/keycloak-2500-released> |
| 26.0.0 | Passam a **supported**; continuam a ligar-se **por realm** (Realm Settings → Organizations → On) | <https://www.keycloak.org/2024/10/keycloak-2600-released> |
| 26.5.0 | Convites persistentes, separador «Invitations», endpoints REST de convite | <https://www.keycloak.org/2026/01/keycloak-2650-released> |
| 26.6.0 | `inviteLink` deixa de ser devolvido; grupos de organização | <https://www.keycloak.org/2026/04/keycloak-2660-released> |
| 26.7.0 | Papéis dedicados `manage-organizations` / `view-organizations` / `query-organizations`; organizações passam a recurso de primeira classe no FGAP | <https://www.keycloak.org/2026/07/keycloak-2670-released> |

Ao nível do servidor, `organization:v1` está na tabela de *supported features* e **activo por
omissão** (<https://www.keycloak.org/server/features>) — mas continua a ter de ser ligado em cada
realm, e no `realm-gespro.json` não está.

**Auditoria.** As operações de organização **são** eventos de administração: o `ResourceType` de
26.7 inclui `ORGANIZATION`, `ORGANIZATION_MEMBERSHIP`, `ORGANIZATION_GROUP` e
`ORGANIZATION_GROUP_MEMBERSHIP`
(<https://raw.githubusercontent.com/keycloak/keycloak/release/26.7/server-spi-private/src/main/java/org/keycloak/events/admin/ResourceType.java>).
`OrganizationMemberResource` emite `CREATE` ao adicionar e `DELETE` ao remover, ambos sob
`ORGANIZATION_MEMBERSHIP`. Um auditor filtra por esse tipo de recurso e vê quem entrou e saiu de
que organização, e quando — desde que os eventos de administração estejam ligados.

---

### 2.2 A API de impersonação

**O endpoint.** `POST /admin/realms/{realm}/users/{id}/impersonation`. Exige a funcionalidade
`impersonation` (`ProfileHelper.requireFeature(Profile.Feature.IMPERSONATION)` — desligá-la com
`--features-disabled=impersonation` mata o endpoint, não só o botão da consola) e a permissão
`auth.users().requireImpersonate(user)`, que corresponde ao papel `impersonation` do cliente
`realm-management` (composto dentro de `realm-admin`) ou do cliente `<realm>-realm` no `master`
(composto dentro de `admin`).

**Não devolve um token.** Devolve um mapa JSON com duas chaves — `sameRealm` e `redirect` — e o seu
efeito real é uma chamada a `AuthenticationManager.createLoginCookie(...)`, que põe o cookie
`KEYCLOAK_IDENTITY` (`CookieType.IDENTITY`) na resposta HTTP **ao chamador**. É por isso um
mecanismo ligado ao navegador: não há artefacto utilizável fora dele. No mesmo realm, a sessão do
próprio administrador é destruída primeiro (`expireIdentityCookie` + `backchannelLogout`) — a
documentação di-lo por palavras suas: *«If the administrator and the user are in the same realm,
then the administrator will be logged out and automatically logged in as the user being
impersonated.»*
Fontes: <https://raw.githubusercontent.com/keycloak/keycloak/release/26.7/services/src/main/java/org/keycloak/services/resources/admin/UserResource.java> ·
<https://www.keycloak.org/docs/latest/server_admin/#con-user-impersonation>

**O que fica registado — e é menos do que se supõe.**

| Pergunta | Resposta verificada |
|---|---|
| Há evento de **utilizador**? | Sim, exactamente um: `EventType.IMPERSONATE`, declarado com `saveByDefault = true` |
| Que *details* leva? | Exactamente dois: `impersonator_realm` e `impersonator` — e `impersonator` é o **username**, não o id. Não há `impersonator_id` no evento |
| Quem é o `userId` do evento? | **O utilizador impersonado**, não o administrador (confirmado pelo teste `ImpersonationTest` de 26.7) |
| Há evento de **administração**? | **Não.** `OperationType` tem só `CREATE, UPDATE, DELETE, ACTION`; `ResourceType` não tem nenhum valor com `IMPERSON`; e `UserResource.impersonate()` nunca toca no `AdminEventBuilder`. **Quem auditar apenas eventos de administração não vê impersonação nenhuma** |
| E as tentativas recusadas? | `IMPERSONATE_ERROR` existe no *enum* mas **não é emitido em lado nenhum do servidor** — as recusas são lançadas antes de o `EventBuilder` sequer ser construído. Uma tentativa negada **não deixa rasto** |

**O que a aplicação consegue ver.** A sessão fica com duas *notes*: `IMPERSONATOR_ID` e
`IMPERSONATOR_USERNAME`. Os *mappers* correspondentes («Impersonator User ID» / «Impersonator
Username», claims `impersonator.id` e `impersonator.username`) existem — mas registados apenas no
catálogo `builtins` do `OIDCLoginProtocolFactory`, **não em nenhum *client scope* por omissão**. Por
omissão, portanto, **o token que o ERP recebe é idêntico ao de um login genuíno do cliente**.

Há uma excepção, e só uma: o *endpoint* de *introspection* devolve `"act": {"sub": "<username do
impersonador>"}` sem qualquer configuração (`AccessTokenIntrospectionProvider`). É o único sinal
gratuito — e o ERP não faz *introspection*, valida o JWT.

**Expiração.** Nenhuma própria. A sessão é criada com
`createUserSession(..., "impersonate", false, null, null)` e o `max-age` do cookie sai de
`realm.getSsoSessionMaxLifespan()`. Em GestPro isso são os **12 h** de *SSO Session Max* e as **8 h**
de *idle* fixadas no ADR-0011. *Não há doc que o afirme; é inferência a partir do código.*

**Veredicto.** É exactamente o cenário que o `CONTEXT.md` proíbe: «Nunca se assume a Identidade de
outra pessoa. O autor de cada acção auditada tem de ser quem a praticou.» E o custo é pior do que o
ADR-0011 §5 já descrevia, porque o ADR assume um trilho do lado do Keycloak que compense: na
realidade esse trilho é **um evento, sem id do impersonador, ausente dos eventos de administração,
sem registo das tentativas recusadas — e, neste repositório, hoje nem sequer persistido**. A
rejeição do ADR-0011 sai reforçada, não enfraquecida.

---

### 2.3 Contas de serviço com client credentials

**Como funciona.** Cliente confidencial com *Service accounts roles* ligado; o Keycloak cria o
utilizador `service-account-<clientId>` (prefixo constante em `ServiceAccountConstants`), a que se
atribuem papéis no separador *Service Account Roles*. A documentação é explícita quanto ao ciclo de
vida: *«Only the access token is returned by default. No refresh token is returned and no user
session is created… issued access tokens can be revoked by sending requests to the OAuth2 Revocation
Endpoint.»*
Fonte: <https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts>

**Autoria.** O `ClientCredentialsGrantType` faz `event.user(clientUser)` com
`session.users().getServiceAccount(client)` e emite `CLIENT_LOGIN`. Nos eventos de administração, o
`AdminEventBuilder` preenche `authDetails = {realmId, clientId, userId, ipAddress}` — logo o `userId`
é o **UUID da conta de serviço**, e o `clientId` é o cliente que apresentou o token.

Dito em português simples: **o auditor vê um UUID e um identificador de cliente. Não vê uma pessoa.**
Se três técnicos usarem o mesmo cliente, os eventos são indistinguíveis entre eles. E do lado do
ERP a conta de serviço não tem `User` local — pelo ADR-0011 não entra, e portanto não produz
`AuditLog` nenhum; se alguém lhe criasse um `User`, o autor auditado passaria a ser «o ERP», que é
uma resposta pior do que nenhuma.

É, no entanto, **o mecanismo certo para o que já faz**: o `gespro-erp` usa-o para provisionar
utilizadores via Admin API (ADR-0013 §2/§5-bis). Aí o actor é mesmo o sistema, e é verdade que o
seja.

**Expiração.** Não existe nativamente. `UserRepresentation` tem `id, username, firstName, lastName,
email, emailVerified, attributes, userProfileMetadata, enabled, self, origin, createdTimestamp,
totp, federationLink, serviceAccountClientId, credentials, disableableCredentialTypes,
requiredActions, federatedIdentities, realmRoles, clientRoles, clientConsents, notBefore,
verifiableCredentials, issuedVerifiableCredentials, groups, access` — e **nenhum campo de validade**.
`notBefore` é uma marca de revogação («invalida tokens emitidos antes de T»), não uma expiração. O
único limite temporal nativo é o `expires_in` do token.

---

### 2.4 Token exchange

**A distinção que decide a questão.** Em 26.7 coexistem duas implementações:

| | `token-exchange-standard:v2` | `token-exchange:v1` |
|---|---|---|
| Estado | **Supported**, **activo por omissão** | **Preview** *e* **deprecated**, inactivo por omissão |
| Chave no `Profile.java` | `TOKEN_EXCHANGE_STANDARD_V2`, `Type.DEFAULT` (também escrito `token-exchange-standard-v2`) | `TOKEN_EXCHANGE`, `Type.PREVIEW` |
| Troca de cliente, mesmo realm, mesmo utilizador | Sim — é o único caso que cobre | Sim |
| **Impersonação de sujeito** (`requested_subject`) | **«Not implemented yet»** | «Implemented as a preview» |
| Dependências | — | Exige **FGAP:v1** (`admin-fine-grained-authz`), também *deprecated*: *«FGAP v2 does not have support for token exchange permissions… there is no plan to add token exchange permissions to FGAP:v2»* |

O `StandardTokenExchangeProvider` rejeita o parâmetro à cabeça:
`context.setUnsupportedReason("Parameter 'requested_subject' is not supported for standard token
exchange")`. E a nota de lançamento de 26.2, que introduziu o v2, di-lo por palavras suas: *«It does
not yet cover use cases related to identity brokering or subject impersonation.»*
Fontes: <https://www.keycloak.org/securing-apps/token-exchange> ·
<https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/java/org/keycloak/protocol/oidc/tokenexchange/StandardTokenExchangeProvider.java> ·
<https://www.keycloak.org/2025/04/keycloak-2620-released> · <https://www.keycloak.org/server/features>

**Conclusão directa**: para o problema desta issue, **o token exchange suportado não serve** (não
muda de sujeito) e **o que serve é impersonação com outro nome**, em *preview*, *deprecated* e a
arrastar uma segunda funcionalidade *deprecated* atrás.

**A claim `act` não existe.** Verificado em `IDToken.java`: sob o comentário
`// RFC 8693 - OAuth 2.0 Token Exchange` está declarada **uma** constante, `MAY_ACT = "may_act"`. Não
há constante `act`, e uma pesquisa no repositório não encontra produtor nenhum. Um token trocado leva
`azp` = cliente requerente e `sub` = utilizador original; **a aplicação a jusante não consegue ver a
cadeia de delegação a partir do token**. O `may_act` só é preenchido pela funcionalidade
experimental de delegação (§2.4-bis) e é uma claim de *permissão*, não de auditoria.

**Auditoria.** `TOKEN_EXCHANGE` e `TOKEN_EXCHANGE_ERROR` existem no `EventType` de 26.7. O evento
regista o utilizador do *subject token* como `user`, e leva os *details* `subject_token_client_id`
(o cliente **original**), `requested_token_type` e `audience`. O actor e o sujeito só se reconstroem
**a partir do registo de eventos do Keycloak**, nunca a partir do token.

#### 2.4-bis. Token Exchange Delegation — a nota de rodapé que interessa

O 26.7.0 introduz, **como experimental**, `token-exchange-delegation`: *«adds a new `delegation`
parameterized scope type that validates whether the requesting user is authorized to act on behalf
of the target user before the exchange is granted»*, com **consentimento do utilizador** e
reavaliação a cada renovação do token; o token emitido leva `may_act` com o `sub` do actor.
Fonte: <https://www.keycloak.org/2026/07/keycloak-2670-released>

É o único mecanismo do Keycloak que tenta resolver «agir em nome de» **com consentimento e com um
actor identificado na claim** — ou seja, o único que não é assumir a identidade de outra pessoa às
escondidas. É também **experimental**, não aparece nas tabelas de funcionalidades suportadas, e
continua a não resolver o problema do lado do ERP: o `AuditLog` não tem onde guardar um segundo
autor. **Vale como gatilho de reabertura, não como opção hoje.**

---

### 2.5 Organizations: membro externo com acesso temporário e expiração

Esta era a pergunta mais concreta da issue. A resposta é inequívoca.

**A adesão não tem expiração — nem sequer um campo onde pudesse ter.**

- `OrganizationRepresentation` tem exactamente: `id, name, alias, enabled, description, redirectUrl,
  attributes, domains, members, identityProviders, groups`. Nenhum campo temporal.
- **Não existe `OrganizationMemberRepresentation`.** Um membro é um `MemberRepresentation`, que
  `extends UserRepresentation` e acrescenta **exactamente um** campo: `membershipType`, de valores
  `UNMANAGED` | `MANAGED`. Verificado por diferença directa dos dois esquemas no OpenAPI publicado, e
  no código-fonte de `release/26.7`.
- `POST /admin/realms/{realm}/organizations/{org-id}/members` recebe **uma simples string JSON** com
  o id do utilizador. Não há objecto de opções — **não há sequer onde passar uma data**. A remoção é
  `DELETE .../members/{member-id}` e mais nada.

Fontes: <https://www.keycloak.org/docs-api/26.7.2/rest-api/openapi.json> ·
<https://raw.githubusercontent.com/keycloak/keycloak/release/26.7/core/src/main/java/org/keycloak/representations/idm/MemberRepresentation.java>

**O que expira é o convite, não o acesso.** `OrganizationInvitationRepresentation` tem `id,
organizationId, email, firstName, lastName, sentDate, expiresAt, status, inviteLink` (este último já
*deprecated*), com `status ∈ {PENDING, EXPIRED}`. O TTL vem de
`OrganizationInvitationResource.getActionTokenLifespan()` → `realm.getActionTokenGeneratedByAdminLifespan()`,
isto é, do parâmetro de realm **«Default Admin-Initiated Action Lifespan»** — «the maximum time
before an action permission sent to a user by an administrator expires». **Depois de aceite, o
convite é apagado e a adesão é perpétua até alguém a apagar à mão.**

**A distinção é a que interessa a um auditor:** um convite que expira limita **quando é que a pessoa
pode entrar pela primeira vez**; não limita **durante quanto tempo fica lá dentro**. A issue perguntou
pela segunda coisa, e o Keycloak não a tem.

**A coisa mais próxima de expiração nativa, e não é isto.** O 26.7 traz `workflows:v1` — na tabela de
*supported features*, activo por omissão — para automatizar o ciclo de vida de recursos do realm por
eventos, condições e agendas (YAML com `on:` / `steps:` / `after: 30d`). Mas a documentação de
administração de 26.7.2 limita o alcance: *«At the moment, workflows can be defined for the
following realm resources: **Users**»*. Logo: **dá para desactivar automaticamente o *utilizador*
temporário ao fim de N dias; não dá para expirar a adesão a uma organização.**
Fontes: <https://www.keycloak.org/docs/26.7.2/server_admin/index.html> · <https://www.keycloak.org/server/features>

Isto é relevante para o ADR-0011 por outra razão: o ADR prescreve uma identidade
`suporte+<slug>@gestpro.mz` que «se desactiva ao fechar» o incidente — **um passo manual, sem prazo,
que depende de alguém se lembrar**. `workflows:v1`, aplicando-se a utilizadores, é precisamente a
peça que tornaria esse passo automático. Não foi verificado se o catálogo de passos inclui um que
desactive um utilizador numa data — ver §6.

---

## 3. O que os ADRs permitem, e o que forçam

**ADR-0011 («Keycloak autentica, a base de dados autoriza») impõe três restrições que eliminam
sozinhas quatro dos cinco mecanismos:**

1. **«O token do Keycloak transporta identidade, não autorização.»** Nada que um mecanismo do
   Keycloak coloque no token altera quem pode o quê. Um técnico só age no ERP se tiver **papéis
   atribuídos em Postgres**, no tenant do cliente.
2. **«Um utilizador que exista no Keycloak mas não em Postgres não tem permissões — e não entra»**
   (`callbacks.signIn` recusa). Isto é o que anula o realm separado e a conta de serviço como vias de
   acesso a dados: nenhum dos dois traz um `User` local.
3. **«O `tenantId` tem uma só fonte: o `User` local.»** Não há superfície transversal, e o ADR
   rejeita-a «sem discussão». Qualquer mecanismo que dê a uma identidade acesso a vários tenants
   **não tem onde aterrar no ERP** — a extensão de tenant existe para o impossibilitar.

**ADR-0013 acrescenta duas, de natureza prática:**

4. **E-mail único em todo o sistema** (`@unique`, não `@@unique([tenantId, email])`), porque o realm
   único recusa duplicados com 409. Uma identidade por pessoa, um tenant por identidade. É a razão
   pela qual o ADR-0011 recorre ao sub-endereçamento (`suporte+<slug>@`) — cada incidente é uma
   identidade nova, não a mesma pessoa em cinquenta sítios.
5. **A gestão de utilizadores escreve nos dois lados, Keycloak primeiro**, com idempotência por
   e-mail. Um acesso de suporte criado só no Keycloak é inofensivo (não autoriza nada); criado só em
   Postgres seria um `User` órfão. A ordem já está decidida e o mecanismo de convite já existe — é o
   `execute-actions-email`, o mesmo do registo público (§5-bis).

**`CONTEXT.md` fecha a porta que restava.** «Nunca se assume a Identidade de outra pessoa.» Isto não
é uma preferência de estilo: num ERP cujos documentos são *append-only* e cujo `AuditLog` é a peça
que se mostra a um auditor fiscal, atribuir ao cliente um acto de um técnico **corrompe o artefacto
que justifica o sistema existir**. A impersonação e o token exchange v1 são tecnicamente triviais de
ligar — o papel `impersonation` é uma caixa para assinalar — e são **exactamente** o que a regra
proíbe. Estão disponíveis; não estão em cima da mesa.

**O único mecanismo compatível é o que o ADR-0011 já escolheu**: identidade própria e temporária do
técnico, com `User` local de papel `LEITURA` no tenant do cliente, desactivada ao fechar o incidente.
Organizations acrescentariam a esse desenho **uma fronteira visível e eventos de administração
dedicados** (`ORGANIZATION_MEMBERSHIP` + `CREATE`/`DELETE`) — melhor legibilidade do trilho — mas
**não** a expiração, que continua a ter de ser construída.

---

## 4. O pré-requisito transversal que hoje falha

Toda a coluna «o que o auditor vê na consola» deste documento assume que o Keycloak está a guardar
eventos. **Não está.** O `realm-gespro.json` não define `eventsEnabled` nem `adminEventsEnabled`, e
ambos valem, por omissão, desligado.

Consequências concretas, hoje, neste repositório:

- Um `IMPERSONATE` não seria persistido — logo a única compensação que a impersonação oferecia não
  existe sequer.
- As operações da conta de serviço `gespro-erp` (que tem `manage-users`: cria, altera e desactiva
  utilizadores) **não deixam registo administrativo nenhum**.
- O ADR-0011 afirma que «a auditoria de acesso fica repartida — autenticação no Keycloak, autorização
  no `AuditLog`». Metade dessa afirmação é, neste momento, falsa: **o lado do Keycloak está vazio**.

A correcção é de configuração, não de arquitectura: `eventsEnabled`, `adminEventsEnabled`,
`adminEventsDetailsEnabled` e as respectivas retenções no ficheiro de realm versionado — o que é
coerente com o ADR-0012 §«A configuração do realm é código». Nota de implementação verificada:
`eventsExpiration` vive na raiz da representação de realm, mas `adminEventsExpiration` vive dentro de
`attributes` ([keycloak/keycloak#40843](https://github.com/keycloak/keycloak/issues/40843) —
*rastreador do projecto, confiança média*).

Isto é um achado lateral à pergunta da issue, mas é a precondição de qualquer resposta a ela.

---

## 5. Achado lateral: `plataforma-admin` não concede nada

O ADR-0012 §4 diz que o acesso à consola de administração é «com autenticação obrigatória em MFA
para o papel `plataforma-admin`». No `realm-gespro.json`, `plataforma-admin` é um papel de realm
**simples**: não é composto por nenhum papel de cliente `realm-management`, e nenhum utilizador o
tem atribuído. Pela documentação, o acesso administrativo vem dos papéis de `realm-management` (ou
dos papéis do cliente `<realm>-realm` no `master`) — **um papel de realm nu não dá acesso à consola**.
Para o mesmo efeito a documentação é explícita noutro ponto adjacente: papéis de administração
atribuídos apenas por um *protocol mapper* «will be ignored when the user authenticates».

Não foi verificado se o efeito pretendido está a ser obtido por outra via (política de
autenticação, configuração fora do ficheiro de realm, ou simplesmente ainda por fazer). Registado
como divergência a confirmar, não como defeito confirmado.

---

## 6. O que continua por saber

**Não verificado contra fonte primária:**

1. **Se o catálogo de passos do `workflows:v1` inclui um passo que desactive ou apague um utilizador
   numa data.** Confirmou-se que a funcionalidade é *supported*, activa por omissão, e que se aplica
   a `Users`; não se leu o catálogo de passos. É a diferença entre «a expiração da conta de suporte
   pode ser nativa» e «tem de ser construída» — e não está resolvida.
2. **Se a consola de administração expõe `ORGANIZATION_*` no filtro de tipo de recurso dos eventos.**
   Leram-se o *enum* e os emissores, não o código da consola.
3. **A disposição literal da coluna «Auth» na consola** (realm / cliente / utilizador / IP). Está
   inferida dos campos de `AuthDetailsRepresentation`; a página de documentação sobre eventos de
   administração descreve como os ligar, não como são apresentados.
4. **O estado por omissão de `eventsEnabled`/`adminEventsEnabled`** está sustentado por ausência das
   chaves no ficheiro de realm e por um *issue* do projecto, **não** por uma frase da documentação.
   É a base de todo o §4, e merece confirmação empírica — que é barata: `docker compose up -d`,
   abrir a consola em `:8081`, Realm settings → Sessions/Events.
5. **Se um passo do Keycloak fora dos representados pode dar expiração de adesão a organizações**
   (um SPI, por exemplo). A ausência está inferida dos esquemas completos e das assinaturas dos
   *endpoints* — é um argumento por ausência, forte mas não uma negação documentada.
6. **O tempo de vida de uma sessão impersonada** não é abordado por nenhuma página de documentação,
   em nenhum sentido. A conclusão de que herda o *SSO Session Max* vem da leitura do código.
7. **A divergência de caminho `orgs` vs `organizations`**: a prosa do guia de administração escreve
   `/admin/realms/{realm}/orgs/{orgId}/invitations`, o OpenAPI escreve `organizations`. Nenhum pedido
   foi executado contra um servidor real. Presumir `organizations`.
8. **`sub` = UUID da conta de serviço e `azp` = clientId** não foi confirmado por frase de
   documentação nem por linha de código lida; decorre de a conta de serviço ser o `UserModel` do
   token.

**Fora do âmbito e por decidir (não é falta de informação, é falta de decisão):**

9. **O ADR-0013 §2 continua a dizer «criar a Organization no Keycloak»** enquanto o §3, o ADR-0010 e
   a infraestrutura dizem o contrário. Precisa de correcção de redacção.
10. **Se a conta de suporte temporária deve ter prazo imposto pelo sistema.** Nenhum dos cinco
    mecanismos o oferece nativamente para o que o ADR-0011 desenhou. As opções são: `workflows:v1`
    (se o ponto 1 confirmar), um atributo de utilizador com um varredor próprio, ou uma coluna em
    `User` com uma tarefa agendada no ERP — que é o sítio onde o ADR-0011 diz que a autorização vive,
    e portanto provavelmente o sítio certo.

---

## 7. Fontes

**Alta confiança — documentação e código-fonte oficiais**

- Guia de administração 26.7.2 — realms, master realm, papéis de administração, Organizations, convites, workflows, eventos: <https://www.keycloak.org/docs/26.7.2/server_admin/index.html>
- Impersonação (guia de administração): <https://www.keycloak.org/docs/latest/server_admin/#con-user-impersonation>
- Contas de serviço: <https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts>
- Token exchange (guia «securing apps»), incluindo a tabela v1/v2: <https://www.keycloak.org/securing-apps/token-exchange>
- Tabela de funcionalidades do servidor (`impersonation:v1`, `organization:v1`, `token-exchange-standard:v2`, `token-exchange:v1`, `workflows:v1`): <https://www.keycloak.org/server/features>
- Referência da Admin REST API / OpenAPI 26.7.2: <https://www.keycloak.org/docs-api/26.7.2/rest-api/openapi.json>
- Notas de lançamento: [25.0.0](https://www.keycloak.org/2024/06/keycloak-2500-released) · [26.0.0](https://www.keycloak.org/2024/10/keycloak-2600-released) · [26.2.0](https://www.keycloak.org/2025/04/keycloak-2620-released) · [26.5.0](https://www.keycloak.org/2026/01/keycloak-2650-released) · [26.6.0](https://www.keycloak.org/2026/04/keycloak-2660-released) · [26.7.0](https://www.keycloak.org/2026/07/keycloak-2670-released)
- Código-fonte, ramo `release/26.7` / tag `26.7.3`: `events/EventType.java` · `events/Details.java` · `events/admin/OperationType.java` · `events/admin/ResourceType.java` · `models/ImpersonationSessionNote.java` · `services/resources/admin/UserResource.java` · `services/resources/admin/AdminEventBuilder.java` · `protocol/oidc/tokenexchange/StandardTokenExchangeProvider.java` · `protocol/oidc/grants/ClientCredentialsGrantType.java` · `protocol/oidc/AccessTokenIntrospectionProvider.java` · `representations/IDToken.java` · `representations/idm/UserRepresentation.java` · `representations/idm/MemberRepresentation.java` · `representations/idm/AuthDetailsRepresentation.java` · `organization/admin/resource/OrganizationInvitationResource.java` · `organization/admin/resource/OrganizationMemberResource.java` · `common/Profile.java` · `common/constants/ServiceAccountConstants.java`

**Confiança média — rastreador de *issues* do projecto (não é documentação)**

- [keycloak/keycloak#20503](https://github.com/keycloak/keycloak/issues/20503) — estado por omissão de «Save events»
- [keycloak/keycloak#40843](https://github.com/keycloak/keycloak/issues/40843) — `eventsExpiration` na raiz vs `adminEventsExpiration` em `attributes`

**Repositório GestPro** — `docker-compose.yml`, `infra/keycloak/realm-gespro.json`,
`apps/erp/src/server/db/audit-extension.ts`, `apps/erp/prisma/schema/auth.prisma`,
`docs/decisions/ADR-001{0,1,2,3}-*.md`, `CONTEXT.md`

Nenhum *blog post* ou resposta de Stack Overflow foi usado como base de qualquer afirmação deste
documento.
