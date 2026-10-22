# Runbook — produção no Railway (serviços, primeiro deploy e alertas)

**Governa:** ADR-0050 «Produção no Railway» (Proposto), ADR-0012 (Keycloak), ADR-0014 (Valkey),
ADR-0020 (continuidade), ADR-0032 (agendador), ADR-0019 §4 (alertas). **Issues:** #572 (serviços e
segredos em falta), #576 (alertas).
**Código:** `infra/railway/` — `servicos.ts` (IaC), `keycloak/`, `keycloak-borda/`, `cron/`.

> **Nunca exercido.** Nada disto correu ainda contra uma conta Railway. O que foi verificado
> localmente está em §Verificação; os passos marcados **[HUMANO]** exigem conta, domínio, DNS ou
> credenciais reais e são os que transformam isto em garantia.

## Topologia

Um projecto, um ambiente `production`, região **`europe-west4-drams3a`** (EU West, Amesterdão) em
todos os serviços e bases.

| Serviço | O que é | Domínio público | Na rede privada | Definido em |
|---|---|---|---|---|
| `erp` | ERP (imagem do `Dockerfile` da raiz), 2 réplicas, migrações em pre-deploy | `app.<domínio>` | `erp.railway.internal:3000` | `.railway/railway.ts` |
| `erp-db` | Postgres do ERP, com PITR | — | `PGHOST` do serviço | `.railway/railway.ts` |
| `keycloak` | Keycloak 26.7.0, `start --optimized`, tema `gespro` | **nenhum** | `keycloak.railway.internal:8080` (HTTP) e `:9000` (gestão) | `servicos.ts` |
| `keycloak-db` | Postgres próprio do Keycloak, com PITR | — | `PGHOST` do serviço | `servicos.ts` |
| `keycloak-borda` | Caddy: só deixa passar `/realms/gespro/*` e `/resources/*` | `auth.<domínio>` | — | `servicos.ts` |
| `valkey` | Valkey 8.1, contadores do rate limiting | **nenhum**, sem proxy TCP | `valkey.railway.internal:6379` | `servicos.ts` |
| `cron-<rota>` (×5) | uma chamada a `/api/cron/<rota>` no seu horário, e termina | — | — | `servicos.ts` |

Documentos (anexos, PDF fiscais) **não** ficam no Railway: os buckets do Railway não têm
versionamento nem Object Lock, e os documentos fiscais exigem-nos. Vão para o S3 externo criado pelo
Terraform de storage (outro nó) — §Variáveis do ERP.

Porque é que o Keycloak não tem domínio próprio: o Railway publica o domínio **inteiro**, sem filtro
por caminho, e o ADR-0012 §4 exige que a consola de administração e o realm `master` não estejam na
Internet. O domínio do login é da `keycloak-borda`, que responde 404 a tudo o que não seja o realm
`gespro` e os recursos do tema. O ERP fala com o Keycloak pela rede privada (backchannel OIDC e
Admin API), nunca pela borda.

## Infrastructure as Code — e porque não `railway.json`

O **Config as Code (`railway.json`/`railway.toml`) está descontinuado**: serviços novos já não o
podem adoptar, e os ficheiros existentes deixam de ser lidos a **2026-12-01**
([docs.railway.com/infrastructure-as-code](https://docs.railway.com/infrastructure-as-code)). O
substituto é um ficheiro de projecto, `.railway/railway.ts`, avaliado pela CLI
(`railway config plan` / `apply`). Num monorepo é **um** ficheiro para o ambiente inteiro (sem
`partial`), e o que ele omitir é apagado no `apply`.

`infra/railway/servicos.ts` é um **módulo** desse ficheiro: exporta `servicosDeApoio()` (Keycloak,
base, borda, Valkey + as variáveis que o ERP tem de receber, `envErp`) e `agendador()` (os cinco
crons, que precisam do serviço do ERP para lhe ler o domínio privado). O
[`.railway/railway.ts`](../../.railway/railway.ts) da raiz junta-os ao ERP e à sua base (`erp-db`).

O serviço `erp` declara:
- build pelo `Dockerfile` da raiz, com `checkSuites: true` (só faz deploy de commits com os checks
  do GitHub verdes);
- `preDeploy: /app/docker-entrypoint.sh migrar`, com tecto de 900 s (#574). As migrações correm uma
  vez, antes de trocar o tráfego, e a imagem já não migra no arranque;
- `healthcheck: /api/ready` (120 s). O Railway só sonda no deploy, e o `/api/ready` faz `SELECT 1`;
- 2 réplicas em `europe-west4-drams3a`, `ON_FAILURE`, `drainingSeconds: 30`;
- o domínio `app.<domínio>` e `privateNetworkEndpoint: erp`;
- as variáveis de §Variáveis do ERP, só por nome ou referência, nunca com valor.

Há três constantes **[HUMANO]** no topo do ficheiro, os domínios (`DOMINIO_APP`, `DOMINIO_AUTH`,
`URL_SITE`). Confirma-as antes do primeiro `plan`.

Requer a CLI do Railway **≥ 5.42.1** e o pacote `railway` (ensaiado com 3.16.0) disponível onde o
plano corre. **[HUMANO]** O pacote **ainda não** é dependência do repositório. Antes do primeiro
`plan`: `pnpm add -Dw railway@3.16.0` (versão exacta), ou correr o plano a partir de uma cópia com o
pacote instalado.

Segredos **nunca** no ficheiro: ou variáveis **partilhadas** do ambiente (`ctx.shared.X` compila
para `${{shared.X}}` — referencia, não cria), ou `preserve()` («mantém o valor que já lá está»),
postos à mão. Por isso o primeiro `apply` vem **depois** de criar as variáveis partilhadas.

## Primeiro deploy — por esta ordem

1. **[HUMANO] Conta e projecto.** Plano **Pro** (monitores e PITR com retenção útil). Criar o
   projecto `gespro`, ambiente `production`, ligar o repositório `fxavier/gespro-frontend` (GitHub
   App do Railway). `railway login && railway link` na raiz.
2. **[HUMANO] Variáveis partilhadas do ambiente** (Project → Settings → Shared Variables), todas
   **seladas** (*sealed*):

   | Variável | De onde vem |
   |---|---|
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `KEYCLOAK_CLIENT_SECRET` | `openssl rand -hex 32` — segredo do cliente OIDC `gespro-erp`, lido pelo ERP e importado no realm |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | fornecedor de e-mail transaccional (porta 587/STARTTLS — o realm de produção assume STARTTLS); usados pelo ERP **e** pelo Keycloak |

   Os valores não podem ter quebras de linha. Qualquer outro carácter é seguro (o `arranque.sh` do
   Keycloak escapa-os).
3. **`railway config plan`** na raiz — rever: cria `keycloak-db`, `keycloak`, `keycloak-borda`,
   `valkey`, cinco `cron-*` (mais o que o nó do ERP declarar). **[HUMANO]** confirmar, no primeiro
   plano, que o Railway aceita o `dockerfilePath` do `keycloak` relativo à *Root Directory* `infra`
   (`railway/keycloak/Dockerfile`); se não, passar a `infra/railway/keycloak/Dockerfile`.
4. **`railway config apply`.**
5. **[HUMANO] Variáveis `preserve()`**, por serviço (Variables → seladas):
   - `keycloak`: `KC_BOOTSTRAP_ADMIN_USERNAME` (ex.: `admin-temporario`) e
     `KC_BOOTSTRAP_ADMIN_PASSWORD` (`openssl rand -hex 24`). São do administrador **temporário** do
     realm `master` — apagado no passo 9.
   - `erp`: `AUTH_SECRET`, `METRICS_SECRET`, `EMAIL_VERIFY_SECRET` (`openssl rand -hex 32`),
     `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CAPTCHA_SECRET_KEY`,
     `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`,
     `AWS_SECRET_ACCESS_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` — origem
     em §Variáveis do ERP. A `NEXT_PUBLIC_TURNSTILE_SITE_KEY` entra no **build** (é `ARG` do
     `Dockerfile`): mudá-la exige um redeploy com build, não basta reiniciar.
   - `cron-*`: `CRON_HEARTBEAT_URL` — a URL de batimento de cada rota no monitor externo
     (§Alertas). Vazia, o cron corre na mesma e não avisa ninguém.
6. **[HUMANO] PITR nas duas bases**: `erp-db` e `keycloak-db` → separador **Backups** → *Enable
   PITR*. Cria um bucket `Postgres-PITR` por base, arquiva WAL continuamente (pgBackRest), base
   completa semanal + diferencial diária, ~4 semanas de janela. Confirmar que o seletor de data
   aparece nas duas (só depois da primeira cópia base).
7. **[HUMANO] Domínios.** `keycloak-borda` → `auth.<domínio>` e `erp` → `app.<domínio>`
   (Settings → Networking → Custom Domain; CNAME no DNS para o alvo que o Railway indica; o TLS é do
   Railway). O `auth.<domínio>` tem de coincidir com o `dominioAuth` do `.railway/railway.ts` — é o
   `KC_HOSTNAME`, o `iss` dos tokens e o `KEYCLOAK_ISSUER` do ERP.
8. **Deploys pela ordem das dependências**: `keycloak-db` → `keycloak` (o primeiro arranque cria o
   schema e importa o realm: ~1 min; a sonda espera até 300 s) → `keycloak-borda` → `valkey` →
   `erp-db` → `erp` → crons (os crons não arrancam até ao seu horário).
9. **[HUMANO] Keycloak, depois do primeiro arranque** — §Keycloak.
10. **Smoke pós-deploy (#572)** — §Verificação em produção.

## Variáveis por serviço

Só nomes e origem. `→ ref` é uma referência do Railway a outro serviço (resolvida no deploy);
`shared` é variável partilhada; `preserve` é posta à mão.

### `keycloak`

| Variável | Valor / origem |
|---|---|
| `PORT` | `8080` (a sonda do Railway usa o `PORT`) |
| `KC_HTTP_ENABLED`, `KC_PROXY_HEADERS` | `true`, `xforwarded` — o TLS termina na borda do Railway |
| `KC_HOSTNAME` | `https://auth.<domínio>` |
| `KC_HOSTNAME_BACKCHANNEL_DYNAMIC` | `false` — tokens pedidos pela rede privada levam `iss` público (ADR-0010 §3) |
| `KC_DB_URL_HOST`, `KC_DB_URL_PORT`, `KC_DB_URL_DATABASE`, `KC_DB_USERNAME`, `KC_DB_PASSWORD` | → ref `keycloak-db`: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` |
| `KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_BOOTSTRAP_ADMIN_PASSWORD` | preserve (passo 5) |
| `JAVA_OPTS_APPEND` | `-XX:MaxRAMPercentage=70` |
| `GESPRO_SSO_IDLE_SECONDS`, `GESPRO_SSO_MAX_SECONDS` | `28800`, `43200` (ADR-0011) |
| `GESPRO_ERP_URL` | `https://app.<domínio>` — `redirectUris` e post-logout do cliente `gespro-erp` |
| `GESPRO_ERP_CLIENT_SECRET` | shared `KEYCLOAK_CLIENT_SECRET` |
| `GESPRO_SMTP_HOST`, `_PORT`, `_FROM`, `_USER`, `_PASSWORD` | shared `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` |

Build (fixo na imagem, `kc.sh build`): `KC_DB=postgres`, `KC_HEALTH_ENABLED=true`,
`KC_METRICS_ENABLED=true`. O `arranque.sh` recusa arrancar se faltar uma das variáveis acima.

### `keycloak-borda`

`PORT=8080`, `KEYCLOAK_INTERNO=keycloak.railway.internal:8080`.

### `valkey`

Nenhuma. Comando: `valkey-server` sem persistência (`--appendonly no`), `maxmemory 200mb`
`allkeys-lru`, a escutar em IPv4 e, se houver, IPv6.

### `cron-<rota>`

`ERP_HOST` (→ ref `erp.RAILWAY_PRIVATE_DOMAIN`), `ERP_PORTA` (`3000`), `CRON_SECRET` (shared),
`CRON_HEARTBEAT_URL` (preserve). Contrato e comportamento: [`agendador.md`](./agendador.md).

### Variáveis do ERP

As da ligação a estes serviços vêm prontas em `servicosDeApoio().envErp`:

| Variável | Valor |
|---|---|
| `RATE_LIMIT_DRIVER` | `valkey` (o #655 recusa outro em produção) |
| `VALKEY_URL` | `redis://valkey.railway.internal:6379` |
| `KEYCLOAK_ISSUER` | `https://auth.<domínio>/realms/gespro` |
| `KEYCLOAK_ISSUER_INTERNO` | `http://keycloak.railway.internal:8080/realms/gespro` |
| `KEYCLOAK_URL` | `http://keycloak.railway.internal:8080` |
| `KEYCLOAK_HEALTH_URL` | `http://keycloak.railway.internal:9000/health/live` |
| `KEYCLOAK_CLIENT_ID` | `gespro-erp` |
| `KEYCLOAK_CLIENT_SECRET`, `CRON_SECRET` | shared |

As restantes (nó do ERP; aqui só para a lista do #572 ficar num sítio):

| Variável | Origem |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | → ref `erp-db.DATABASE_URL` (privado) |
| `AUTH_SECRET`, `METRICS_SECRET`, `EMAIL_VERIFY_SECRET` | `openssl rand -hex 32`, selados |
| `NEXTAUTH_URL`, `APP_URL` | `https://app.<domínio>` |
| `ALLOWED_ORIGINS` | `https://app.<domínio>`, `https://<domínio do site>` |
| `SITE_URL` | URL do site de marketing |
| `EMAIL_PROVIDER` | `smtp`; `SMTP_*` → shared |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | painel Stripe (o Price ID vem da tabela `Plano`, ADR-0049) |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `turnstile` + chaves do painel Cloudflare (sem elas o registo público é recusado) |
| `AUTH_SESSION_MAX_AGE`, `KEYCLOAK_SSO_MAX_SECONDS` | `900`, `43200` |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION` | outputs do Terraform de storage (bucket S3 na UE com Object Lock) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | utilizador IAM do Terraform de storage, só com acesso a esse bucket; selados. Sem `S3_ENDPOINT` nem `S3_FORCE_PATH_STYLE` (é S3 real) |
| `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | destino OTLP, quando houver (ADR-0019); sem endpoint o SDK não arranca |
| `APP_VERSION` | o SHA do commit (`RAILWAY_GIT_COMMIT_SHA`) |

## Keycloak

**O realm de produção não tem utilizadores.** A imagem deriva-o do realm de desenvolvimento
(`infra/keycloak/realm-gespro.json`, a fonte única) com `infra/railway/keycloak/realm-producao.jq`,
no build: saem os cinco `*@demo.mz` e o `plataforma@gespro.mz` (todos com a senha de demonstração),
fica só a conta de serviço `service-account-gespro-erp`; `redirectUris` apontam ao ERP; o SMTP passa
a autenticado com STARTTLS. **O build falha** se sobrar um utilizador que não seja conta de
serviço, a senha de demo, um e-mail de demo, `localhost`, ou uma descrição com mais de 255
caracteres.

**O import só corre com o realm ausente** (primeiro arranque). Depois disso, o ficheiro de realm já
não manda: mudanças ao realm aplicam-se pela Admin API (como o README de `infra/keycloak/` descreve
para o local) e entram também no `realm-gespro.json`, para dev e produção não divergirem. O mesmo
vale para o segredo do cliente: rodar o `KEYCLOAK_CLIENT_SECRET` é regenerá-lo no cliente
`gespro-erp` (Admin API) **e** actualizar a variável partilhada, por esta ordem, com o ERP a
reiniciar a seguir.

Depois do primeiro arranque — **[HUMANO]**:

1. **Acesso à consola**: a consola não está na Internet. Para a usar, gerar temporariamente um
   domínio Railway no serviço `keycloak` (Settings → Networking → Generate Domain, porta 8080),
   fazer o trabalho e **apagar o domínio** no fim. Fica registado nos eventos de administração do
   realm.
2. **Administrador definitivo** no realm `master`, com OTP obrigatório; entrar com ele; **apagar o
   temporário** e remover `KC_BOOTSTRAP_ADMIN_*` do serviço.
3. **Primeiro administrador de plataforma** no realm `gespro`: criar o utilizador (e-mail real da
   equipa, nunca `plataforma@gespro.mz`), acção obrigatória *Configure OTP*, papel de realm
   `plataforma-admin`, e enviar-lhe o e-mail de definição de palavra-passe. Sem `User` em Postgres
   (entra numa sessão sem tenant — ADR-0049 §5).
4. Confirmar que o login no ERP (`/auth/login`) funciona e que um registo público recebe o e-mail
   de verificação (prova o SMTP do Keycloak).

**Actualizações** (ADR-0012 §6, trimestrais): a versão está fixada no `Dockerfile` de
`infra/railway/keycloak/` **e** no `docker-compose.yml` — sobem as duas juntas, com o ensaio local
(§Verificação) antes do deploy. O Keycloak migra o seu schema no arranque: o plano de reversão é o
PITR do `keycloak-db` para antes da janela.

## Postgres e PITR

- **Duas bases, dois arquivos.** O ADR-0020 §1 queria o Keycloak dentro da mesma instância do ERP,
  para uma só PITR cobrir ERP e identidade como um sistema. No Railway cada `postgres()` é um
  serviço; com duas, **um restauro coerente leva as duas ao mesmo instante T**. Consequência
  aceite: perder só uma das bases é recuperável sozinho, mas restaurar só uma pode deixar `User`
  sem identidade (ou o inverso) — o cron `reconciliar-identidades` reporta-o no dia seguinte.
- O restauro **cria um serviço novo** (`<origem>-restored-AAAAMMDD-HHMM`) a partir do arquivo; a
  origem nunca é tocada. Trocar é apontar as referências (`erp.DATABASE_URL`, `KC_DB_*`) para o
  serviço restaurado, no `.railway/railway.ts`, e `apply`.

### Ensaio de restauro PITR — [HUMANO]

Critério do ADR-0020: restauro cronometrado, com RPO e RTO medidos, antes de haver clientes.

1. Escrever um marcador nas duas bases (ex.: um registo de auditoria de plataforma conhecido e um
   utilizador de teste no Keycloak). Anotar **T0** (UTC).
2. Esperar ≥ 2 min (o `archive_timeout` é 60 s). Apagar o marcador nas duas.
3. Backups → *Restore to this moment* → T0 + 30 s, em `erp-db` **e** `keycloak-db`.
4. Apontar um ERP de ensaio (não o de produção) aos restaurados; confirmar os dois marcadores e o
   login. Anotar **T1** (fim).
5. Registar abaixo; apagar os serviços restaurados.

| Data | Quem | T0 | T1 | RTO (T1 − início) | RPO observado | Resultado |
|---|---|---|---|---|---|---|
| (pendente) | | | | | | |

## Valkey

Só a rede privada do ambiente lhe chega (sem domínio público nem proxy TCP; ambientes e projectos
diferentes não se vêem). **Sem palavra-passe**, como no compose — e porque a sonda do Valkey em
`probes.ts` faz `PING` sem `AUTH`: com `requirepass` o `/api/metrics` daria o Valkey como em baixo
para sempre. Se um dia se quiser palavra-passe, a sonda passa a autenticar primeiro.
Sem persistência: os contadores têm TTL e perdê-los num reinício só abre a janela de um limite.
Com o Valkey em baixo o limitador entra em fail-open com circuit breaker (ADR-0014).

## Alertas (#576)

O que o Railway dá, e o que não dá:

| Falha | Coberto por | Canal |
|---|---|---|
| Deploy falhado (build ou arranque) / contentor rebentado | **Webhook do projecto** (eventos `Failed`, `Crashed`) | canal de serviço |
| CPU, RAM, disco, egress acima do limite | **Monitores** (plano Pro), por serviço | e-mail + in-app + webhook |
| Volume (das bases) a encher | alerta de volume → webhook | canal de serviço |
| **`/api/ready` a 503** (BD inacessível) — o contentor está vivo, não rebenta | **nada no Railway**: a sonda de saúde do Railway só corre no deploy, não em contínuo | monitor externo (abaixo) |
| **Login em baixo** (Keycloak ou borda) | **nada no Railway** se o contentor não rebentar | monitor externo |
| **Cron falhou ou não correu** | **nada no Railway** (só deploys) | batimento externo (abaixo) |

Solução proposta para as três lacunas, **um monitor externo de uptime com heartbeats** (qualquer
serviço com verificação HTTP de 1 em 1 min a partir da UE, *heartbeat monitors* e integração com o
canal — escolha e conta são **[HUMANO]**):

1. **HTTP** `https://app.<domínio>/api/ready`, de 1 em 1 min, alerta com **5 falhas seguidas** →
   alerta a ≤ 6 min do início do 503 (critério da #576: ≤ 10 min).
2. **HTTP** `https://auth.<domínio>/realms/gespro/.well-known/openid-configuration`, idem — é o
   SLO de login do ADR-0012 (Consequências).
3. **Cinco heartbeats**, um por `cron-<rota>`, período 24 h, tolerância 1 h; a URL de cada um vai
   para o `CRON_HEARTBEAT_URL` desse cron. O `chamar.sh` só bate depois de um 2xx — portanto falta
   de batimento = a corrida falhou **ou** não correu.

Montar — **[HUMANO]**:

1. Canal de serviço (Slack/Discord: o Railway formata sozinho o payload desses URLs; outro destino
   precisa de um receptor).
2. Project → Settings → **Webhooks** → URL do canal, eventos de deploy (pelo menos `Failed` e
   `Crashed`) e alertas.
3. **Monitores** (Observability) em `erp`, `keycloak`, `erp-db`, `keycloak-db`: RAM > 85 %,
   disco das bases > 80 %, CPU > 90 % sustentado.
4. Monitor externo: os 2 HTTP + 5 heartbeats acima, ligados ao mesmo canal.

### Alerta sintético (critério da #576) — [HUMANO]

`/api/ready` a 503 durante 5 min tem de chegar ao canal em ≤ 10 min.

1. Anotar **T0** e tornar a BD inacessível ao ERP sem o matar — num ambiente de ensaio, não em
   `production`: parar o serviço `erp-db` desse ambiente (ou, para só ensaiar a entrega, apontar
   temporariamente o monitor de `/api/ready` a uma URL que devolva 503).
2. `curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/ready` → `503`; `/api/health` →
   `200`.
3. Anotar **T1**, a chegada do alerta ao canal. Repor; anotar **T2**, o aviso de recuperação.
4. Registar; **T1 − T0 > 10 min → falha**: encurtar o intervalo ou as falhas seguidas do monitor —
   nunca registar como cumprido.

| Data | Ambiente | Quem | T0 (503) | T1 (alerta) | T1 − T0 | T2 (recuperado) | Resultado |
|---|---|---|---|---|---|---|---|
| (pendente) | | | | | | | |

Ensaio do cron: pôr um `CRON_SECRET` errado **só** num `cron-<rota>` de ensaio e forçar a
corrida — tem de ficar falhada no Railway (o `chamar.sh` sai com 1) e o heartbeat dessa rota tem de
alertar no fim da tolerância.

## Verificação

**Local (sem conta)** — o que este nó provou:

```bash
sh infra/railway/keycloak/ensaio-local.sh     # imagem + realm + borda, contra Postgres 18 efémero
sh infra/railway/cron/verificar-horarios.sh    # ROTAS_CRON = infra/local/cron/crontab
```

O ensaio constrói as duas imagens, arranca-as numa rede descartável e falha se: o arranque aceitar
variáveis em falta; o `.well-known` não responder (também com o `Host` da sonda do Railway,
`healthcheck.railway.app`); a página de login pela borda não trouxer o tema; o realm tiver um único
utilizador (`GET /admin/realms/gespro/users` tem de ser `[]`); a conta de serviço faltar; os
`redirectUris` ou o SMTP não estiverem substituídos; a borda deixar passar `/admin`,
`/realms/master` ou `/metrics`. No fim apaga contentores, rede e imagens.

**Em produção, depois do primeiro deploy — [HUMANO]** (aceitação da #572):

1. `https://app.<domínio>/api/ready` → 200; `https://auth.<domínio>/admin/` → 404.
2. Login com o administrador de plataforma; registo público de um tenant de teste até ao e-mail.
3. Forçar `cron-expirar-trials` e ver 200 no registo da execução (e o heartbeat a bater).
4. `GET /admin/realms/gespro/users` (pela consola temporária) só com as contas criadas à mão.

## Limitações conhecidas

- **O realm de desenvolvimento não importa numa base vazia.** A descrição do papel
  `plataforma-admin` em `infra/keycloak/realm-gespro.json` tem 300 caracteres e o Keycloak guarda-a
  em `varchar(255)`: o arranque rebenta com «value too long for type character varying(255)». Não
  se nota localmente porque o import só corre com o realm ausente. A derivação de produção encurta-a
  e o build tranca o limite; o ficheiro de dev precisa da mesma correcção (fora deste nó).
- **Ambientes antigos do Railway só têm IPv6 na rede privada** (os criados depois de 2025-10-16
  têm IPv4 e IPv6). O ERP escuta em `0.0.0.0` (`HOSTNAME` do `Dockerfile` da raiz) e o Keycloak
  também: num projecto novo, como este, não importa.
- **Sem 409 para corridas sobrepostas** (#572, `pg_try_advisory_lock` no `withCron`): o Railway não
  sobrepõe corridas do mesmo cron, mas uma retentativa do `curl` após um 5xx pode apanhar a
  anterior a meio se o servidor ainda a estiver a processar.
- **A hora de um cron pode variar alguns minutos** (documentação do Railway).
