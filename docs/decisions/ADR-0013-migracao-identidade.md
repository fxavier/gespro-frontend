# ADR-0013 — Migração da identidade e provisionamento de tenants no Keycloak

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0010](./ADR-0010-keycloak-fornecedor-identidade.md), [ADR-0011](./ADR-0011-fronteira-autorizacao.md), [ADR-0012](./ADR-0012-alojamento-keycloak.md), [ADR-0016](./ADR-0016-anti-abuso-registo.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `api-conventions`

## Contexto

O ADR-0010 decide adoptar o Keycloak; este decide **como lá chegar sem partir o que já funciona**.

A situação é invulgarmente favorável: **não há utilizadores em produção**. Não há palavras-passe para
migrar, sessões para invalidar nem clientes para reeducar. O que existe é um *seed* de demonstração
com cinco utilizadores, uma suite de 1 199 testes que assume autenticação por credenciais, 37 cenários
E2E que fazem login com e-mail e palavra-passe, e um fluxo de registo público que cria o tenant e
estabelece a sessão por um token de transferência de uso único.

O problema central não é migrar dados. É que **criar um tenant deixa de ser uma transacção**. Hoje o
registo público cria `Tenant`, `User`, papéis e `ConfiguracaoFiscal` numa `$transaction` — tudo ou
nada. Com o Keycloak passam a existir dois sistemas com estado, sem transacção que os abranja: se a
escrita em Postgres confirmar e a chamada ao Keycloak falhar, fica um tenant sem forma de entrar; se
falhar ao contrário, fica uma organização órfã.

## Decisão

**Substituição completa, sem período de coexistência, com provisionamento idempotente e reconciliável.**

### 1. Sem autenticação dupla

Não há bandeira de funcionalidade que mantenha os dois caminhos activos. Manter `Credentials` e OIDC
em paralelo significaria manter `passwordHash` vivo, duplicar as regras de bloqueio de subscrição e
ter duas superfícies de ataque — para proteger uma migração que não tem utilizadores para proteger.
A troca é feita de uma vez, numa *branch* de integração, e o gate de entrada é a suite E2E verde.

### 2. Ordem de provisionamento: Keycloak primeiro, Postgres depois

O registo público passa a esta sequência, protegida pela `ChaveIdempotencia` que já existe:

1. Criar a **Organization** no Keycloak e o utilizador administrador — **sem palavra-passe**, com as
   acções obrigatórias `VERIFY_EMAIL` e `UPDATE_PASSWORD` pendentes.
2. Criar `Tenant`, `User` (com `keycloakSub`), papéis e `ConfiguracaoFiscal` numa `$transaction`.
3. Disparar o `execute-actions-email` da Admin API do Keycloak. É este e-mail — e só ele — que dá
   entrada no produto (ver ponto 5).

A ordem é deliberada: **o lado que não tem transacção vai primeiro**. Se o passo 1 falhar, nada foi
escrito em Postgres e o pedido é simplesmente repetível. Se o passo 2 falhar, fica uma organização no
Keycloak sem tenant — estado detectável, reparável e **inofensivo**, porque sem `User` local não há
autorização nenhuma (ADR-0011). O contrário — tenant sem identidade — seria um cliente pago sem forma
de entrar.

### 3. Reconciliação como rede de segurança

Uma tarefa agendada diária, através de `withApi` como todas as outras, compara **utilizadores** do
realm `gespro` com `User` em Postgres, por `keycloakSub`, e reporta divergências nas duas direcções.
**Reporta, não repara automaticamente**: reparação automática de identidade é como se cria um
incidente pior do que aquele que se resolve. As divergências vão para o registo estruturado e
disparam alerta.

> Na versão inicial deste ADR a comparação era entre **organizações** e `Tenant`. Com as Organizations
> adiadas (ADR-0010), a reconciliação desce ao nível do utilizador — que é onde a divergência
> realmente magoa, porque é o utilizador que não consegue entrar.

### 4. Tabelas descontinuadas

| Tabela | Schema | Destino |
|---|---|---|
| `PasswordResetToken` | `auth.prisma` | Removida — recuperação de palavra-passe é do Keycloak |
| `UserInvite` | `auth.prisma` | Removida — ver ponto 5-bis |
| `LoginAttempt` | `auth.prisma` | Removida — detecção de força bruta é nativa do Keycloak |
| `TokenVerificacaoEmail` | **`plataforma.prisma`** | Removida — verificação é do Keycloak |
| `TokenHandoff` | `plataforma.prisma` | **Removida** — ver ponto 5 |
| `ChaveIdempotencia` | `plataforma.prisma` | Mantida — reutilizada no provisionamento (ponto 2) |
| `User.passwordHash` | `auth.prisma` | Coluna removida; `User` ganha `keycloakSub` único e não nulo |

> **Atenção ao ficheiro.** Três das quatro tabelas removidas estão em `auth.prisma`, mas
> `TokenVerificacaoEmail` está em **`plataforma.prisma`** — onde também vivem `Assinatura` e
> `ConfiguracaoFiscal`, que o `w8-billing` toca na mesma fase. O mapa de propriedade do handoff
> declara `w8-identidade` como dono de `plataforma.prisma` na Fase 2; o `w8-billing` **pede**
> alterações a esse ficheiro em vez de as escrever.

A remoção é feita numa migração escrita à mão. **`keycloakSub` entra `NOT NULL` com
`DEFAULT gen_random_uuid()::text`, seguido de `DROP DEFAULT`, numa só migração** — um `ADD COLUMN
NOT NULL` sem valor por omissão falha em qualquer tabela com linhas. Em CI a tabela está vazia e é
indiferente; localmente cada linha existente ganha um `sub` único que não corresponde a nenhum
utilizador do Keycloak, e essa pessoa deixa de conseguir entrar — que é o comportamento correcto por
ADR-0011, e não um efeito secundário. Recusar a migração e exigir *reseed* pouparia duas linhas de SQL
ao preço de partir o `pnpm db:migrate` de quem tenha dados locais. O `email` passa de
`@@unique([tenantId, email])` a `@unique`, e `User` ganha `primeiroAcessoEm DateTime?` (ponto 5-bis). A dependência `@node-rs/argon2` sai do
`package.json`, e com ela o campo `senha` do formulário público de registo — o ERP deixa de ver,
transportar ou guardar palavras-passe em qualquer ponto.

### 5. O token de transferência desaparece — o e-mail de verificação passa a ser a porta de entrada

A versão inicial deste ADR mantinha o `TokenHandoff` «a transportar apenas o destino pretendido».
Isso contradizia o ponto 1: o **único** consumidor do `TokenHandoff` é o provider `handoff`, que é um
dos dois `Credentials` que o ponto 1 manda apagar. Preservava-se uma tabela cujo consumidor estava a
ser removido, para um trabalho que o `callbackUrl` do Auth.js e o `state` do OIDC já fazem sem tabela.

E o aparato à volta dele não se justifica sem sessão em jogo: segredo de assinatura dedicado
(`HANDOFF_SIGNING_SECRET`), TTL de 60 s, `jti` com índice único, consumo atómico de uso único,
limitador por IP, índice de expiração para limpeza, 145 linhas de serviço, a rota
`/auth/registo-callback` e o seu componente cliente. Tudo isso existe porque o token **concedia uma
sessão**. Um token que não concede nada não precisa de ser protegido: reproduzir «vai para o painel»
é inofensivo.

**Sai tudo** — tabela, serviço, provider, limitador, segredo, rota de callback e o campo `senha` do
formulário de registo.

O que o substitui é mais simples e é a mesma coisa que o ponto 2 já descrevia: o registo não pede
palavra-passe nenhuma; cria o utilizador no Keycloak com `VERIFY_EMAIL` e `UPDATE_PASSWORD`
pendentes e dispara o e-mail de acções. O utilizador clica uma vez, verifica o e-mail, define a
palavra-passe **no Keycloak** e cai autenticado no ERP.

**Custo assumido, e é de funil e não de engenharia**: hoje o utilizador entra no produto no instante
em que submete o formulário; a partir daqui tem de passar pela caixa de correio antes de ver o
primeiro ecrã. Perde-se conversão. Aceita-se pelo que se ganha do outro lado: menos uma tabela, menos
um segredo em produção, o ERP a nunca ver uma palavra-passe, e um campo de palavra-passe a menos num
formulário público não autenticado — o que também alivia o ADR-0016. Se a medição de conversão vier
a mostrar que a troca não compensa, a correcção é um ADR que a reverta, com números.

### 6. Testes: um duplo de identidade, não um Keycloak em cada teste

- **Unitários** (a esmagadora maioria dos 1 199): não tocam em autenticação. Não mudam.
- **Integração** e **E2E**: `docker-compose` levanta o Keycloak com o realm importado do ficheiro
  versionado. O E2E autentica-se de verdade, contra um Keycloak real, uma vez, e reutiliza o estado
  de sessão nos restantes cenários — que é o que a suite já faz hoje com `auth.setup.ts`.
- **Novo cenário obrigatório**: expiração e renovação silenciosa de sessão. É a aresta conhecida do
  Auth.js v5 identificada no ADR-0010 e não pode ser verificada por inspecção de código.
- **Requisito que decorre do anterior**: nenhum teste espera 15 minutos, quanto mais 8 horas. As três
  durações de sessão fixadas no ADR-0011 — `maxAge` do Auth.js, *SSO Session Idle* e *SSO Session
  Max* — **têm de ser parâmetros de ambiente**, não valores fixos no `realm-gespro.json`, para o
  ambiente de E2E as pôr em segundos. Se ficarem fixas no ficheiro, o cenário obrigatório acima não é
  escrevível.

### 7. Utilizadores de demonstração preservados

Os cinco utilizadores do *seed* (`admin@demo.mz` e restantes, palavra-passe `demo1234`) continuam a
existir — agora criados **no ficheiro de realm versionado**, com as mesmas credenciais e com `sub`
fixos. O `prisma/seed` grava exactamente esses `sub`; **dois ficheiros que têm de concordar levam um
teste** que falha no `pnpm check`, não num E2E enigmático.

O comando muda, e não havia forma honesta de evitar: **o serviço `keycloak` sai do perfil `full` e
passa ao perfil por omissão do `docker-compose.yml`**. A alternativa — manter o arranque leve e dar
aos programadores um atalho de autenticação só para dev — é precisamente a bandeira de funcionalidade
que o ponto 1 proíbe, e envelheceria como código morto com poder de emitir sessões. O arranque local
passa a ser `docker compose up -d` (agora com Postgres **e** Keycloak), `pnpm db:seed`, `pnpm dev`.
O `CLAUDE.md` é actualizado em conformidade.

### 5-bis. Convidar um colaborador é o mesmo mecanismo do registo

A versão inicial deste ADR apagava o `UserInvite` porque «convites são do Keycloak, com organização
associada». Essa justificação caiu com o adiamento das Organizations (ADR-0010): o Keycloak **sem**
Organizations não tem conceito de convite — convite de organização *é* uma funcionalidade das
Organizations. A conclusão mantém-se, mas por outra razão: o mecanismo do ponto 5 já serve. Criar o
utilizador via Admin API com `VERIFY_EMAIL` e `UPDATE_PASSWORD` pendentes e disparar o
`execute-actions-email` **é** o convite. Um mecanismo, duas portas — registo público e ecrã de gestão
de utilizadores.

Isto arruma de caminho uma duplicação anterior a esta wave: havia **dois** caminhos para criar um
colaborador — a rota `/api/auth/invite` com `UserInvite`, e o `user-admin.service.ts`, que definia a
palavra-passe do colega directamente. Ambos desaparecem. O ERP deixa de ver, transportar ou guardar
uma palavra-passe em qualquer ponto, público ou administrativo.

**Idempotência sem chave nova.** O registo público protege-se com a `ChaveIdempotencia`; o ecrã de
administração não tem chave — é um humano a carregar num botão, e se a criação no Keycloak passar e a
transacção em Postgres falhar, o segundo clique criaria um segundo utilizador Keycloak. Como o e-mail
é **único em todo o sistema** (ver `CONTEXT.md`), o e-mail *é* a chave de idempotência: procura-se por
e-mail no realm antes de criar e reutiliza-se o `sub` se já existir. Nenhuma tabela nova.

**O estado «por activar» passa a ser uma coluna local.** O `UserInvite.acceptedAt` era onde vivia o
«convidei-o, ainda não entrou»; sem a tabela, essa verdade fica no Keycloak, nas acções pendentes do
utilizador — e desenhar a lista de utilizadores do ERP a partir daí seria uma chamada de rede por
linha. Em vez disso, `User` ganha **`primeiroAcessoEm DateTime?`**, escrita uma única vez no
`callbacks.signIn` bem sucedido. «Por activar» é `primeiroAcessoEm == null`. Mede deliberadamente
outra coisa do que o campo que substitui — não «aceitou o convite» mas «já entrou alguma vez» —, o
que é mais útil e é verdade para todos os utilizadores, incluindo os de demonstração.

O `roleId` do convite não precisa de substituto: o `User` e o `UserRole` locais são criados no acto,
portanto o papel é atribuído à partida em vez de viajar dentro de um convite.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Substituição completa, sem coexistência** ✅ | Uma só superfície de autenticação; sem código morto; aproveita a janela única de não haver utilizadores reais | Sem retorno gradual: a reversão é reverter a *branch* inteira |
| Coexistência com bandeira de funcionalidade | Reversão instantânea; migração gradual dos utilizadores | Mantém `passwordHash` e duas superfícies de ataque vivas; duplica regras de bloqueio; complexidade permanente para proteger uma migração sem utilizadores |
| Postgres primeiro, Keycloak depois | O caminho feliz parece mais natural | A falha deixa **tenant sem identidade** — um cliente que pagou e não entra. Inverte exactamente o modo de falha que interessa evitar |
| Reconciliação com reparação automática | Sem intervenção manual | Reparação automática de identidade cria incidentes piores do que resolve. Detectar e alertar é a escolha conservadora certa |
| Federação de utilizadores do Keycloak contra o Postgres actual | Sem migração de palavras-passe; o Keycloak lê os utilizadores existentes | Resolve um problema que não temos — não há palavras-passe a preservar. Acrescenta um fornecedor de armazenamento personalizado, em Java, para manter |

## Consequências

- **`prisma/schema/auth.prisma` encolhe de 9 para 6 modelos**: `User`, `Role`, `Permission`,
  `UserRole`, `RolePermission` e `AuditLog`. Saem três — `PasswordResetToken`, `UserInvite` e
  `LoginAttempt`. A quarta tabela removida, `TokenVerificacaoEmail`, está em `plataforma.prisma`,
  que passa de 8 para 7 modelos.
- **`User.keycloakSub` é único e não nulo**, com índice. É a chave de correlação entre os dois
  sistemas e o que liga o trilho de autenticação ao trilho de auditoria de negócio (ADR-0015).
- **Um utilizador que exista no Keycloak sem `User` local não entra**, por decisão do ADR-0011. A
  mensagem de erro tem de dizer «contacte o administrador da sua empresa», não «utilizador
  desconhecido» — é o caso legítimo de um colaborador federado ainda não provisionado.
- **A gestão de utilizadores no ERP passa a escrever nos dois sítios**: convidar um colaborador cria
  o utilizador no Keycloak (com acções pendentes) e o `User` local com os seus papéis. Desactivar
  desactiva nos dois. A ordem é a mesma do registo — Keycloak primeiro — e a idempotência é por
  e-mail (ponto 5-bis). Ambas as ordens são seguras na desactivação: seja qual for o lado que falhe,
  o resultado é o acesso fechado, nunca aberto.
- **`User` ganha `primeiroAcessoEm DateTime?`** e perde `passwordHash`; `auth.prisma` perde ainda as
  relações `passwordResetTokens` e `sentInvites`. O delta de schema desta fase é maior do que a
  versão inicial deste ADR previa — inclui também a remoção do `TokenHandoff` em `plataforma.prisma`
  (ponto 5). O `w8-identidade` é dono dos dois ficheiros na Fase 2; o `w8-billing` **pede**.
- **`docker-compose.yml` ganha o serviço Keycloak**, e o arranque local passa a ser mais lento. É o
  custo aceite; documenta-se no `CLAUDE.md`.
- **A suite E2E passa a depender de um serviço a mais no CI.** Os jobs `e2e` e `a11y` ficam mais
  lentos e mais frágeis. Mitiga-se com o realm importado de ficheiro (arranque determinístico) e com
  verificação de saúde antes de correr os cenários.
- **No CI o Keycloak sobe num *step*, não em `services:`.** Os *service containers* do GitHub Actions
  arrancam **antes** do `actions/checkout`, portanto `infra/keycloak/realm-gespro.json` ainda não
  existe no disco quando o contentor subiria — nenhuma montagem de volume resolve isso. O passo é
  `docker compose up -d keycloak` depois do checkout, o que dá de graça paridade exacta dev↔CI por ser
  literalmente a mesma definição. Se o tempo do job doer, a evolução é publicar uma imagem
  pré-construída com o realm embutido; regista-se então em ADR próprio.
- **O e-mail passa a ser único em todo o sistema, não por tenant.** Uma Identidade pertence a
  exactamente um Tenant (ver `CONTEXT.md`), e o realm único do Keycloak recusa e-mails duplicados com
  409. O `@@unique([tenantId, email])` do `User` promete o que o fornecedor de identidade vai negar,
  e passa a `@unique`. Consequência assumida: quem gere duas empresas precisa de dois endereços — o
  registo tem de o dizer com essas palavras, não com «e-mail inválido».
- **Ponto de não retorno**: depois de removidas as tabelas e a coluna `passwordHash`, voltar atrás é
  reverter a migração e a *branch*. Por isso o gate desta migração é mais exigente do que o habitual —
  E2E verdes **contra um Keycloak real**, não contra um duplo.
