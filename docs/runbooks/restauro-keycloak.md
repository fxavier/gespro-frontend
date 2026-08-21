# Runbook — Restauro do Keycloak

> **Âmbito**: pilha local de referência (ADR-0026); o procedimento transfere-se
> para produção quando existir (ADR-0012, ADR-0020 §4).

## O que há para restaurar

O Keycloak tem dois estados, com fontes de verdade diferentes:

1. **Configuração do realm** — é **código**: `infra/keycloak/realm-gespro.json`,
   versionado e importado no arranque (`start --import-realm`). Nunca é clicada
   na consola (ADR-0012 §7). Recuperável a partir do Git, sempre.
   > A partir da fase 2, este ficheiro é propriedade exclusiva do `w8-identidade`.
2. **Dados de identidade** (utilizadores, credenciais, sessões, ligação
   `keycloakSub`) — vivem na base `keycloak`, **na mesma instância Postgres da
   pilha** (serviço `db`, criada pelo one-shot `db-init`). São cobertos pelo
   mesmo arquivo de WAL e pelas mesmas cópias de base que o ERP.

## Cenário A — base `keycloak` recuperável (o caso normal)

O restauro do cluster Postgres (ver `restauro-bd.md`) repõe `gespro` **e**
`keycloak` no mesmo ponto no tempo. Depois do restauro:

```bash
docker compose --profile full up -d keycloak   # (re)arranca o Keycloak
# verificar saúde (porta de gestão, interna à pilha):
docker compose exec keycloak sh -c \
  "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.0\r\n\r\n' >&3 && grep -q 200 <&3 && echo OK"
```

Verificar: login de um utilizador conhecido; o realm `gespro` listado; o ERP a
autenticar (fase ≥ 2).

## Cenário B — base `keycloak` irrecuperável

(ADR-0020 §4: «restaurar; se irrecuperável, reimportar realm e reconciliar
utilizadores por `keycloakSub`».)

1. Recriar a base vazia (idempotente):
   ```bash
   docker compose --profile full run --rm db-init
   ```
   > Se a base existir mas estiver corrompida: `DROP DATABASE keycloak;` antes,
   > com a pilha do Keycloak parada.
2. Arrancar o Keycloak — o realm `gespro` é reimportado do ficheiro versionado:
   ```bash
   docker compose --profile full up -d keycloak
   ```
3. **Reconciliar utilizadores**: os utilizadores do realm perderam-se; o ERP
   guarda a ligação por `keycloakSub` (a partir da fase 2 / ADR-0013). A
   reconciliação recria os utilizadores no realm e actualiza o `keycloakSub` no
   ERP. *Nota: o procedimento detalhado de reconciliação é entregue pelo
   `w8-identidade` na fase 2 — hoje o realm é esquelético e não tem utilizadores.*
4. Os utilizadores recriados recebem fluxo de reposição de credenciais (nunca se
   restauram palavras-passe por outro canal).

## Actualização de versão (contexto)

A versão é fixada no `docker-compose.yml` (`quay.io/keycloak/keycloak:26.7.0`) e
actualizada trimestralmente (ADR-0012 §6). O Keycloak migra o schema da SUA base
no arranque — por isso **cópia de base antes de cada actualização**
(`./infra/local/scripts/backup-base.sh`), e nunca actualizar sem plano de
reversão escrito: reverter = restaurar a base ao instante pré-actualização e
voltar à etiqueta anterior da imagem.
