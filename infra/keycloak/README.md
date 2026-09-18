# infra/keycloak — realm `gespro` e tema

> Propriedade exclusiva do `w8-identidade` durante a Wave 8.
> A configuração do realm **é código** (ADR-0012 §7): importada no arranque
> (`start --import-realm`), nunca clicada na consola. O JSON não admite
> comentários nem campos desconhecidos (o import rejeita-os) — daí este README.

## realm-gespro.json

- **Realm único, sem Organizations** (adiadas — ADR-0010, nota de revisão de
  2026-08-29): o tenant resolve-se `sub → User → tenantId` em Postgres, não de
  um claim do token.
- **Durações de sessão são parâmetros de ambiente** (ADR-0011/ADR-0013 §6),
  substituídos no import via `${env.…}`:
  - `GESPRO_SSO_IDLE_SECONDS` — *SSO Session Idle* (omissão do compose: 28800 = 8 h)
  - `GESPRO_SSO_MAX_SECONDS` — *SSO Session Max* (omissão do compose: 43200 = 12 h)
  O terceiro valor da tabela do ADR-0011 (15 min) é do lado do ERP:
  `AUTH_SESSION_MAX_AGE` (intervalo de re-resolução do Auth.js).
  Fixar estes valores aqui tornaria o cenário E2E obrigatório de
  expiração/renovação não-escrevível — nenhum teste espera 15 minutos.
- **`GESPRO_ERP_CLIENT_SECRET`** — segredo do cliente OIDC `gespro-erp`,
  também por substituição de ambiente. Zero segredos no repositório; o
  compose injecta um placeholder de dev.
- **`GESPRO_SMTP_HOST`/`GESPRO_SMTP_PORT`** — o Keycloak envia os e-mails de
  verificação/definição de palavra-passe (`execute-actions-email`); na pilha
  local apontam ao Mailpit (perfil `full`).
- **Cinco utilizadores de demonstração** com `id` (= `sub` OIDC) **fixo** e
  palavra-passe `demo1234` (fixture local, por decisão — ADR-0013 §7). O seed
  Prisma grava exactamente estes `sub` a partir de
  `apps/erp/prisma/seed/demo-users.ts`; o teste
  `apps/erp/src/server/auth/__tests__/realm-demo-sync.test.ts` falha no
  `pnpm check` se os dois ficheiros divergirem.
- **`plataforma-admin`** — único papel que vive no Keycloak (ADR-0011 §5):
  administra identidades, não dá acesso a dados de nenhum cliente. Sem membros
  neste ficheiro.
- A conta de serviço do `gespro-erp` tem `view-users`/`manage-users`: é com ela
  que o ERP provisiona utilizadores (registo público e convites — ADR-0013 §2 e
  §5-bis) e dispara o `execute-actions-email`.

## themes/gespro

Tema **deliberadamente mínimo** (ADR-0012 §8): estende `keycloak.v2` e
substitui apenas as variáveis CSS derivadas de `packages/brand` (incluindo o
tema escuro), o logótipo e as cadeias de ortografia pré-AO. Os *templates*
FreeMarker **não** são tocados — substituí-los obrigaria a revalidação a cada
actualização trimestral.

Nota sobre o nome do ficheiro de mensagens: o ADR-0012 §8 fala de
`messages_pt_PT.properties`, mas o locale do realm é `pt` (o pacote `pt` do
Keycloak 26.7.0 já é português europeu — verificado no jar). Pela regra de
resolução de `ResourceBundle`, a sobreposição eficaz para o locale `pt`
chama-se `messages_pt.properties`. É essa que existe.

## Iterar no tema em dev — armadilha do cache gzip

O Keycloak em modo `start` guarda cópias comprimidas dos recursos do tema em
`/opt/keycloak/data/tmp/kc-gzip-cache/…` **que sobrevivem a `docker compose
restart`** (o browser pede `Accept-Encoding: gzip` e recebe a cópia velha; um
`curl` sem compressão recebe a nova — depurar isto custou uma hora). Depois de
editar CSS/mensagens do tema:

```bash
docker exec gespro-keycloak rm -rf /opt/keycloak/data/tmp/kc-gzip-cache
docker compose restart keycloak
```

Em CI e em contentores recém-criados o problema não existe.
