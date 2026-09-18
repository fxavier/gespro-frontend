#!/bin/sh
# Cria a base de dados própria do Keycloak dentro da instância Postgres da pilha
# (ADR-0012 §2: base de dados própria na MESMA instância, utilizador dedicado).
#
# Idempotente: corre a cada `docker compose --profile full up` sem efeito se a
# role e a base de dados já existirem. Corre como serviço one-shot `db-init`.
set -eu

: "${PGHOST:=db}"
: "${PGUSER:=gespro}"
: "${PGPASSWORD:?PGPASSWORD em falta}"
: "${KC_DB_USER:=keycloak}"
: "${KC_DB_PASSWORD:?KC_DB_PASSWORD em falta}"
: "${KC_DB_NAME:=keycloak}"

export PGPASSWORD

# Aspas simples na password não podem partir o SQL (revisão w8: escaping)
KC_DB_PASSWORD_SQL=$(printf %s "$KC_DB_PASSWORD" | sed "s/'/''/g")

echo "[db-init] A garantir role e base de dados do Keycloak em ${PGHOST}..."

psql -h "$PGHOST" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${KC_DB_USER}') THEN
    CREATE ROLE ${KC_DB_USER} LOGIN PASSWORD '${KC_DB_PASSWORD_SQL}';
  END IF;
END
\$\$;
-- Idempotência da password (revisão w8): se KC_DB_PASSWORD mudar depois do
-- primeiro arranque, a role é actualizada em vez de ficar com a antiga.
ALTER ROLE ${KC_DB_USER} WITH LOGIN PASSWORD '${KC_DB_PASSWORD_SQL}';
SELECT 'CREATE DATABASE ${KC_DB_NAME} OWNER ${KC_DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${KC_DB_NAME}')
\gexec
SQL

echo "[db-init] OK — base de dados '${KC_DB_NAME}' pronta (role '${KC_DB_USER}')."
