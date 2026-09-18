# Handoff — `w8-plataforma-local` (Wave 8, Fase 1)

> Implementa o ADR-0026 e as partes locais dos ADR-0012, 0014, 0020 e 0022 §0.
> Branch: `w8-plataforma-local`. Data: 2026-08-21.

## 1. O que foi entregue

`docker-compose.yml` passou de «Postgres para desenvolvimento» à **encarnação
executável da topologia de produção** (ADR-0026 §2), com dois perfis:

```bash
docker compose up -d                          # perfil mínimo: só o Postgres (dev de domínio)
docker compose --profile full up -d --build   # pilha completa (11 serviços)
```

| Serviço | Imagem (fixada) | Porta no host | Nota |
|---|---|---|---|
| `db` | `postgres:17-alpine` | 5432 | **arquivo de WAL activo** (volume `gespro-walarchive`, `archive_timeout=60`); volume de dev `gespro-pgdata` preservado |
| `db-init` | `postgres:17-alpine` | — | one-shot idempotente: BD `keycloak` + role dedicada **na mesma instância** (ADR-0012 §2 → a PITR cobre ERP e identidade como um sistema, ADR-0020 §1) |
| `keycloak` | `quay.io/keycloak/keycloak:26.7.0` | 127.0.0.1:8081 | `start --import-realm`; realm `gespro` importado de `infra/keycloak/realm-gespro.json`; health/métricas na porta de gestão 9000, **interna** |
| `valkey` | `valkey/valkey:8-alpine` | **nenhuma** | só na rede interna da pilha (task 1.3); contrato: `VALKEY_URL=redis://valkey:6379` já injectado nos ERP |
| `minio` + `minio-init` | `minio/minio:RELEASE.2025-09-07…` + `mc` | 127.0.0.1:9000/9001 | bucket `gespro-uploads` criado no arranque, **com versionamento** (ADR-0020) |
| `otel-lgtm` | `grafana/otel-lgtm:0.31.0` | 127.0.0.1:3002 (UI), 4317/4318 (OTLP) | receptor OTLP; ver contrato §3 |
| `webhook-receptor` | `mendhak/http-https-echo:41` | 127.0.0.1:8082 | eco de pedidos → `docker logs`; para os alertas do `w8-observabilidade` |
| `mailpit` | `axllent/mailpit:v1.30.7` | 127.0.0.1:8025 (UI), 1025 (SMTP) | aceita qualquer auth; os ERP enviam via `mailpit:1025` |
| `erp-1`, `erp-2` | **build local do `Dockerfile`** (`gespro-erp:local`) | — (só via proxy) | a MESMA imagem de produção nas duas; diferenças zero; `migrate deploy` no entrypoint |
| `proxy` | `caddy:2.11.4-alpine` | 8080 | round-robin com sonda activa a `/api/health`; cabeçalho `X-Gespro-Instancia` expõe o upstream |

Limites de memória fixados por serviço (total ≈ 7,2 GB ≤ 8 GB do daemon):
otel-lgtm 2 g · keycloak 1,2 g · db 1 g · erp 2×768 m · minio 512 m · valkey 256 m ·
mailpit/proxy 128 m · webhook 64 m.

Segredos: `.env` na **raiz**, não versionado (`.gitignore` já cobria); `.env.example`
novo na raiz documenta tudo. Sem `.env`, o compose usa placeholders de dev local —
deliberado, para o perfil mínimo continuar a subir sem configuração; nunca são
valores de produção. `apps/erp/.env.example` actualizado (EMAIL_PROVIDER, OTLP
local, VALKEY_URL, KEYCLOAK_ISSUER; corrigido `SMTP_PASSWORD`→`SMTP_PASS`, que é o
nome que `src/server/email/smtp.ts` realmente lê).

## 2. Evidência (corrida a 2026-08-21, tudo contra a pilha viva)

- **Pilha sobe com um comando**: `docker compose --profile full up -d` → 11
  serviços; todos os que têm healthcheck ficam `healthy` (db, keycloak, valkey,
  minio, mailpit — via imagem —, erp-1, erp-2, otel-lgtm).
- **Alternância de instância** (6 pedidos a `/api/health` via proxy):
  `X-Gespro-Instancia: erp-2 → erp-1 → erp-2 → erp-1 → erp-2 → erp-1`.
- **Smoke autenticado com UMA sessão nas DUAS instâncias**: login
  `admin@demo.mz`/`demo1234` via proxy (302, cookies `authjs.session-token.*`);
  depois `GET /dashboard` ×6 → `200` alternando `erp-1`/`erp-2`. **A sessão
  sobrevive à mudança de instância** (JWT + `AUTH_SECRET` partilhado).
  Nota de método: a prova fiável faz-se com `fetch` do Node — o cookie-jar do
  `curl` mutila os cookies fragmentados do Auth.js e dá falsos negativos.
- **Keycloak**: `GET :8081/realms/gespro/.well-known/openid-configuration` → 200;
  log: `Realm 'gespro' imported … Import finished successfully`; healthcheck na
  porta de gestão 9000 (interna) verde.
- **MinIO**: `minio-init` → `Bucket created successfully local/gespro-uploads` +
  `versioning is enabled`.
- **OTLP**: `POST :4318/v1/traces` → 200. Grafana `:3002/api/health` → ok;
  datasources provisionados intactos (Loki, Prometheus, Pyroscope, Tempo).
- **Mailpit**: mail de teste por SMTP `localhost:1025` → visível na API
  (`total: 1`, assunto `Smoke Mailpit`).
- **Webhook receptor**: `POST :8082/alerta-teste` → 200 (eco nos logs).
- **Valkey só interno**: `docker port gespro-valkey` vazio; TCP `valkey:6379`
  alcançável de dentro do erp-1; `nc localhost 6379` recusado no host.
- **`/api/ready` → 200** e continua a depender só da BD (nem Keycloak nem Valkey
  — ADR-0012/0014: uma indisponibilidade de login ou de cache não pode derrubar
  instâncias saudáveis).
- **Ensaio de restauro cronometrado** (`./infra/local/scripts/ensaio-restauro.sh`):
  cópia de base 5 s · restauro + replay de WAL + promoção 9 s · total 15 s ·
  marcador escrito DEPOIS da cópia presente no restauro (prova de PITR) · BD
  `keycloak` restaurada no mesmo cluster (2 realms). Registado em
  `docs/runbooks/ensaio-restauro.md` **como estimativa optimista**.
- **`pnpm check`** verde na branch (prisma validate + tsc + eslint + 1199 testes).

## 3. Contrato de montagem para o `w8-observabilidade`

A pasta `infra/local/observabilidade/**` é **tua** (aqui só existem `.gitkeep`).
O compose monta:

| Pasta no repositório | Dentro do contentor `otel-lgtm` |
|---|---|
| `infra/local/observabilidade/dashboards` | `/otel-lgtm/grafana/conf/provisioning/dashboards` |
| `infra/local/observabilidade/alerts` | `/otel-lgtm/grafana/conf/provisioning/alerting` |

- As montagens **substituem** as pastas da imagem: os dashboards de exemplo do
  otel-lgtm desaparecem (deliberado); os *datasources* da imagem ficam intactos
  (verificado). Em `dashboards/` precisas de pôr o teu provider `.yaml` + os
  `.json`; em `alerts/` os `.yaml` de alerting provisioning do Grafana.
- Grafana: `http://localhost:3002` (admin/admin da imagem). OTLP: dentro da
  pilha `http://otel-lgtm:4317|4318`; do host (pnpm dev) `http://localhost:4317|4318`.
  Os ERP já recebem `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318`.
- Receptor de webhook: serviço `webhook-receptor` já definido —
  URL interna para os alertas: `http://webhook-receptor:8080/<o-que-quiseres>`;
  inspecção: `docker logs -f gespro-webhook-receptor` ou `http://localhost:8082`.
  Se preferires outro receptor, o serviço é teu para reconfigurar — avisa-me só
  se mudares nome/porta (estão referenciados neste handoff e no compose).

## 4. O que a pilha prova — e o que NÃO prova (task 1.14, ADR-0026 §Consequências)

**Prova (ou tornará provável na fase 2/3, já com as peças de pé):**
- Duas instâncias da mesma imagem de produção atrás de proxy: sessão que
  sobrevive à mudança de instância (provado já); limitador partilhado entre
  instâncias (infra pronta — teste chega com o `w8-cache`, task 5.5b); publicação
  em duas fases contra duas instâncias (procedimento da fase 2/3).
- Keycloak ponta-a-ponta com realm importado de ficheiro versionado, BD própria.
- Política de POST do armazenamento verificável, porque o MinIO fala a API S3 real.
- Conduta de telemetria por OTLP com painéis/alertas provisionados por ficheiro.
- Procedimento de cópia e restauro com PITR, cronometrado e repetível num comando.
- E-mail sem fornecedor; segredos só por ambiente; a mesma imagem local=produção.

**Não prova (e não se finge que prova):**
- Permissões IAM ou equivalentes; topologia de rede e isolamento reais.
- Comportamento de um Postgres gerido em falha de zona; limite de ligações real.
- TLS, certificados, DNS; arranque a frio e escala automática.
- **Custo real**; latência de rede para Moçambique; tráfego de saída.
- **O RTO**: os 15 s do ensaio são uma estimativa optimista com BD de brinquedo
  em disco local. O objectivo de 4 h (ADR-0020) continua não validado — só o
  ensaio contra produção o valida, e essa fase está parada por decisão (fase 5).
- Durabilidade real das cópias: o arquivo de WAL vive no mesmo daemon Docker que
  a BD — prova o procedimento, não protege dados.

## 5. Decisões tomadas (e porquê)

1. **BD do Keycloak dentro da mesma instância Postgres** (não um segundo
   contentor): espelha o ADR-0012 §2 («BD própria dentro da instância existente»)
   e faz a PITR cobrir ERP+identidade como um sistema (ADR-0020 §1). Criada por
   one-shot `db-init` idempotente porque o volume de dev já existia (os
   `initdb.d` da imagem só correm em volume virgem).
2. **Caddy** como proxy (config de 15 linhas, `header_down` com o upstream para
   provar alternância, sondas activas a `/api/health`).
3. **`STORAGE_DRIVER=local` nos ERP por agora**: o cliente S3 actual não tem
   `endpoint` configurável (ADR-0026 §3.2) — é trabalho do `w8-armazenamento`
   (fase 3, ficheiro `src/lib/storage/objeto/s3.ts`, que não é meu). As variáveis
   `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE`/credenciais MinIO **já estão injectadas**
   nos contentores; mudar para o MinIO será trocar `STORAGE_DRIVER=s3`.
4. **Realm `gespro` deliberadamente esquelético** (nome, locale pt, brute force
   ligado): o suficiente para importar e passar o healthcheck. **A partir da
   fase 2, `infra/keycloak/realm-gespro.json` é propriedade exclusiva do
   `w8-identidade`** — clients, flows OIDC e utilizadores demo são dele.
5. **Placeholders de dev como fallback de interpolação** no compose (`${VAR:-…}`):
   exigir `.env` quebraria o perfil mínimo (`docker compose up -d` sem
   configuração), que o workflow de domínio usa todos os dias.
6. **Grafana em 3002** (3000 = pnpm dev, 3001 = site de marketing em
   `ALLOWED_ORIGINS`); consolas administrativas todas em `127.0.0.1`, só o proxy
   em `0.0.0.0:8080`.
7. **Porta do Postgres de dev voltou a 5432**: o override local (não versionado)
   remapeava para 5433, mas essa porta está ocupada pelo `gespro-perf-db` do
   `w8-desempenho` (a correr em paralelo). `apps/erp/.env` local actualizado em
   conformidade; volume de dados de dev preservado (verificado: tenant demo,
   `admin@demo.mz`, 12 migrations, dados intactos).

## 6. Dívida deixada (com dono previsto)

| Item | Dono | Nota |
|---|---|---|
| Ensaio de restauro nº 2 com BD de volume (`pnpm db:seed:volume`) | orquestrador, fecho da fase 1 | gerador do `w8-desempenho` não existia à data; comando único já pronto |
| Realm com clients/flows/utilizadores | `w8-identidade` (fase 2) | ficheiro passa a ser dele |
| Adaptador Valkey + teste do limite entre instâncias (5.5b) | `w8-cache` (fase 2) | `VALKEY_URL` já injectado; sem porta no host por decisão — para dev no host, publicar via `docker-compose.override.yml` local |
| `STORAGE_DRIVER=s3` contra o MinIO | `w8-armazenamento` (fase 3) | precisa de `endpoint` no cliente S3 |
| Dashboards/alertas/receptor definitivos | `w8-observabilidade` (fase 1) | contrato no §3 |
| Telemetria dos ERP a fluir | `w8-observabilidade` | endpoint OTLP já injectado; a instrumentação é dele |
| Healthcheck do ERP marca `unhealthy` 1× em arranque a frio com a máquina carregada (timeout 10 s no primeiro wget) | orquestrador avaliar subir `--start-period`/`timeout` no `Dockerfile` se incomodar | recupera sozinho; `up -d` à segunda continua |

`infra/live/**` e `infra/modules/**` **não foram tocados** (task 1.13 — dormentes,
ADR-0026 §4).

## 7. Como verificar (reprodutível)

```bash
docker compose --profile full up -d --build      # pilha completa
docker compose --profile full ps                 # tudo Up/healthy
curl -sD- -o/dev/null localhost:8080/api/health | grep -i instancia   # alternância
curl -s localhost:8081/realms/gespro/.well-known/openid-configuration | head -c 80
./infra/local/scripts/ensaio-restauro.sh         # ensaio cronometrado
pnpm check
```

A pilha ficou **a correr** no fim do trabalho, como combinado, para o
`w8-observabilidade` e o `w8-desempenho` verificarem contra ela.
