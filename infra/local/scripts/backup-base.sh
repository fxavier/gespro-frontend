#!/usr/bin/env bash
# Cópia de base (pg_basebackup) da instância Postgres da pilha local.
#
# ADR-0020 §2 — implementação local da capacidade «recuperação a um ponto no
# tempo»: cópia de base + arquivo contínuo de WAL (activo no serviço `db`).
# A cópia fica DENTRO do volume `gespro-walarchive`, em /base/<timestamp>/.
#
# Uso:   ./infra/local/scripts/backup-base.sh
# Saída: o timestamp da cópia criada (última linha), para uso por scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="/var/lib/postgresql/wal-archive/base/${TS}"

echo "[backup] A criar cópia de base em ${DEST} (dentro do volume gespro-walarchive)..." >&2

# -Ft -z: formato tar comprimido · -X stream: WAL necessário incluído na cópia
# -c fast: checkpoint imediato (não esperar pelo ciclo normal)
docker compose exec -T db sh -c \
  "mkdir -p '${DEST}' && pg_basebackup -U gespro -D '${DEST}' -Ft -z -X stream -c fast"

# Fecha e arquiva o segmento WAL corrente, para que tudo até este instante
# fique imediatamente disponível ao restauro.
docker compose exec -T db psql -U gespro -d postgres -Atqc "SELECT pg_switch_wal();" >/dev/null

echo "[backup] Cópia concluída: base/${TS}" >&2
echo "${TS}"
