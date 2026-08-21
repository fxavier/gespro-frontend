#!/usr/bin/env bash
# Ensaio de cópia e restauro LOCAL, cronometrado — ADR-0020 §3 / task 1.10.
#
# Num só comando:
#   1. cria uma cópia de base nova (pg_basebackup → volume gespro-walarchive);
#   2. escreve um marcador DEPOIS da cópia e força o arquivo do WAL — provar
#      que o restauro replaya WAL além da cópia de base é provar PITR;
#   3. restaura para uma instância descartável (volume novo, contentor novo);
#   4. verifica: marcador presente, contagens do ERP, base do Keycloak;
#   5. cronometra cada passo e imprime o resultado.
#
# ⚠ O número obtido é uma ESTIMATIVA OPTIMISTA: falta-lhe a rede, o
#   armazenamento e a dimensão de dados de um ambiente real (ADR-0020 §3).
#   O RTO real só se valida contra produção, quando existir.
#
# Uso:
#   ./infra/local/scripts/ensaio-restauro.sh            # ensaio completo + limpeza
#   ./infra/local/scripts/ensaio-restauro.sh --manter   # deixa a instância restaurada viva
#
# Regista o resultado em docs/runbooks/ensaio-restauro.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

MANTER=0
[ "${1:-}" = "--manter" ] && MANTER=1

PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT")}"
WAL_VOLUME="${PROJECT}_gespro-walarchive"
RESTORE_VOLUME="gespro-restauro-data"
RESTORE_CONTAINER="gespro-restauro"
PG_IMAGE="postgres:17-alpine"
RUN_ID="ensaio-$(date -u +%Y%m%dT%H%M%SZ)"

log() { echo "[ensaio] $*" >&2; }

# Limpeza de restos de ensaios anteriores
docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
docker volume rm "$RESTORE_VOLUME" >/dev/null 2>&1 || true

log "Ensaio ${RUN_ID} — a base de dados de origem é a da pilha local."

# ---------------------------------------------------------------------------
# 1. Cópia de base (cronometrada)
# ---------------------------------------------------------------------------
T0=$(date +%s)
TS="$(./infra/local/scripts/backup-base.sh | tail -1)"
T1=$(date +%s)
log "Cópia de base: base/${TS} (${T1}-${T0} → $((T1 - T0)) s)"

# ---------------------------------------------------------------------------
# 2. Marcador pós-cópia + arquivo forçado do WAL
#    (na base `postgres`, nunca na `gespro` — uma tabela estranha na base do
#    ERP seria detectada como drift pelo Prisma)
# ---------------------------------------------------------------------------
docker compose exec -T db psql -U gespro -d postgres -v ON_ERROR_STOP=1 -Atq <<SQL >/dev/null
CREATE TABLE IF NOT EXISTS ensaio_restauro (id serial PRIMARY KEY, marca timestamptz NOT NULL DEFAULT now(), nota text NOT NULL);
INSERT INTO ensaio_restauro (nota) VALUES ('${RUN_ID}');
SQL

SEGMENTO="$(docker compose exec -T db psql -U gespro -d postgres -Atqc "SELECT pg_walfile_name(pg_current_wal_insert_lsn());")"
docker compose exec -T db psql -U gespro -d postgres -Atqc "SELECT pg_switch_wal();" >/dev/null

log "Marcador '${RUN_ID}' escrito depois da cópia; à espera do arquivo do segmento ${SEGMENTO}..."
for i in $(seq 1 30); do
  if docker compose exec -T db test -f "/var/lib/postgresql/wal-archive/${SEGMENTO}"; then break; fi
  [ "$i" -eq 30 ] && { log "ERRO: segmento ${SEGMENTO} nunca chegou ao arquivo"; exit 1; }
  sleep 1
done

# ---------------------------------------------------------------------------
# 3. Restauro para instância descartável (cronometrado — este é o «RTO» local)
# ---------------------------------------------------------------------------
T2=$(date +%s)
log "A preparar PGDATA da instância descartável a partir de base/${TS}..."

docker run --rm \
  -v "${RESTORE_VOLUME}:/var/lib/postgresql/data" \
  -v "${WAL_VOLUME}:/wal-archive:ro" \
  "$PG_IMAGE" sh -eu -c "
    tar xzf /wal-archive/base/${TS}/base.tar.gz -C /var/lib/postgresql/data
    mkdir -p /var/lib/postgresql/data/pg_wal
    tar xzf /wal-archive/base/${TS}/pg_wal.tar.gz -C /var/lib/postgresql/data/pg_wal
    rm -f /var/lib/postgresql/data/postmaster.pid
    cat >> /var/lib/postgresql/data/postgresql.auto.conf <<'CONF'
restore_command = 'cp /wal-archive/%f \"%p\"'
recovery_target_timeline = 'latest'
archive_mode = off
CONF
    touch /var/lib/postgresql/data/recovery.signal
    chown -R postgres:postgres /var/lib/postgresql/data
    chmod 700 /var/lib/postgresql/data
  "

log "A arrancar a instância restaurada (recuperação + promoção)..."
docker run -d --name "$RESTORE_CONTAINER" \
  -v "${RESTORE_VOLUME}:/var/lib/postgresql/data" \
  -v "${WAL_VOLUME}:/wal-archive:ro" \
  "$PG_IMAGE" >/dev/null

# Espera: aceitar ligações E já não estar em recuperação (promovida)
PRONTA=0
for i in $(seq 1 150); do
  if docker exec "$RESTORE_CONTAINER" pg_isready -U gespro -d postgres >/dev/null 2>&1; then
    EM_REC="$(docker exec "$RESTORE_CONTAINER" psql -U gespro -d postgres -Atqc 'SELECT pg_is_in_recovery();' 2>/dev/null || echo t)"
    if [ "$EM_REC" = "f" ]; then PRONTA=1; break; fi
  fi
  sleep 2
done
[ "$PRONTA" -eq 1 ] || { log "ERRO: instância restaurada não ficou pronta em 300 s"; docker logs "$RESTORE_CONTAINER" | tail -30 >&2; exit 1; }
T3=$(date +%s)

# ---------------------------------------------------------------------------
# 4. Verificações de sanidade
# ---------------------------------------------------------------------------
psql_r() { docker exec "$RESTORE_CONTAINER" psql -U gespro -Atq "$@"; }

MARCADOR="$(psql_r -d postgres -c "SELECT count(*) FROM ensaio_restauro WHERE nota = '${RUN_ID}';")"
TENANTS="$(psql_r -d gespro -c 'SELECT count(*) FROM "Tenant";')"
USERS="$(psql_r -d gespro -c 'SELECT count(*) FROM "User";')"
KC_REALMS="$(psql_r -d keycloak -c 'SELECT count(*) FROM realm;' 2>/dev/null || echo 'n/a (perfil full em baixo?)')"

if [ "$MARCADOR" != "1" ]; then
  log "ERRO: o marcador pós-cópia NÃO está no restauro — o replay de WAL falhou (não é PITR)."
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Resultado
# ---------------------------------------------------------------------------
T_BACKUP=$((T1 - T0)); T_RESTAURO=$((T3 - T2)); T_TOTAL=$((T3 - T0))
cat <<FIM

============================================================
 Ensaio de cópia e restauro — ${RUN_ID}
============================================================
 Cópia de base (pg_basebackup) ....... ${T_BACKUP} s
 Restauro + replay WAL + promoção .... ${T_RESTAURO} s
 TOTAL ............................... ${T_TOTAL} s

 Verificações:
   marcador pós-cópia (prova PITR) ... OK (replay de WAL além da cópia)
   Tenants no ERP restaurado ......... ${TENANTS}
   Utilizadores no ERP restaurado .... ${USERS}
   Realms na BD do Keycloak .......... ${KC_REALMS}

 ⚠ ESTIMATIVA OPTIMISTA: medição local, sem a rede, o armazenamento
   nem a dimensão de dados de um ambiente real. O RTO real só se valida
   contra produção (ADR-0020 §3). Regista este número em
   docs/runbooks/ensaio-restauro.md como tal.
============================================================
FIM

if [ "$MANTER" -eq 1 ]; then
  log "Instância restaurada mantida: contentor ${RESTORE_CONTAINER} (psql -U gespro)."
else
  docker rm -f "$RESTORE_CONTAINER" >/dev/null
  docker volume rm "$RESTORE_VOLUME" >/dev/null
  log "Instância descartável destruída (ADR-0020 §3 passo 5)."
fi
