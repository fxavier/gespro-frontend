#!/bin/sh
# Arranque do Keycloak de produção (Railway).
#
# Faz o que o infra/keycloak/import-realm.sh faz localmente — substitui os
# `${env.…}` do realm antes do `--import-realm` (os campos Integer não aceitam
# a substituição nativa; ver esse ficheiro) — com três diferenças:
#   1. recusa arrancar se faltar uma variável (um realm com `${env.X}` literal
#      no segredo do cliente arrancaria e falharia só no primeiro login);
#   2. escapa os valores para JSON e para o sed: uma palavra-passe SMTP real
#      pode ter `"`, `\`, `|` ou `&`;
#   3. `start --optimized` sobre a imagem já construída (ADR-0012 §3).
#
# O import só cria o realm se ele ainda não existir (estratégia por omissão do
# Keycloak). Depois do primeiro arranque, mudar o realm é pela Admin API —
# ver docs/runbooks/deploy-railway.md §Keycloak.
set -eu

tpl=/opt/keycloak/realm-template/realm-gespro.json
out=/opt/keycloak/data/import/realm-gespro.json

falta=""
for v in GESPRO_SSO_IDLE_SECONDS GESPRO_SSO_MAX_SECONDS GESPRO_ERP_CLIENT_SECRET \
         GESPRO_ERP_URL GESPRO_SMTP_HOST GESPRO_SMTP_PORT GESPRO_SMTP_FROM \
         GESPRO_SMTP_USER GESPRO_SMTP_PASSWORD KC_HOSTNAME KC_DB_URL_HOST \
         KC_DB_USERNAME KC_DB_PASSWORD; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || falta="$falta $v"
done
if [ -n "$falta" ]; then
  echo "[arranque] variáveis em falta:$falta" >&2
  exit 1
fi
for v in GESPRO_SSO_IDLE_SECONDS GESPRO_SSO_MAX_SECONDS GESPRO_SMTP_PORT; do
  eval "val=\${$v}"
  case "$val" in
    *[!0-9]*) echo "[arranque] $v tem de ser um inteiro (é «$val»)" >&2; exit 1 ;;
  esac
done

# Valor → texto seguro dentro de uma string JSON e de uma substituição do sed.
esc() {
  printf '%s' "$1" | sed -e 's/[\\"]/\\&/g' -e 's/[\\|&]/\\&/g'
}

mkdir -p /opt/keycloak/data/import
sed \
  -e "s|\"\${env.GESPRO_SSO_IDLE_SECONDS}\"|${GESPRO_SSO_IDLE_SECONDS}|g" \
  -e "s|\"\${env.GESPRO_SSO_MAX_SECONDS}\"|${GESPRO_SSO_MAX_SECONDS}|g" \
  -e "s|\${env.GESPRO_ERP_CLIENT_SECRET}|$(esc "$GESPRO_ERP_CLIENT_SECRET")|g" \
  -e "s|\${env.GESPRO_ERP_URL}|$(esc "${GESPRO_ERP_URL%/}")|g" \
  -e "s|\${env.GESPRO_SMTP_HOST}|$(esc "$GESPRO_SMTP_HOST")|g" \
  -e "s|\${env.GESPRO_SMTP_PORT}|${GESPRO_SMTP_PORT}|g" \
  -e "s|\${env.GESPRO_SMTP_FROM}|$(esc "$GESPRO_SMTP_FROM")|g" \
  -e "s|\${env.GESPRO_SMTP_USER}|$(esc "$GESPRO_SMTP_USER")|g" \
  -e "s|\${env.GESPRO_SMTP_PASSWORD}|$(esc "$GESPRO_SMTP_PASSWORD")|g" \
  "$tpl" > "$out"

# shellcheck disable=SC2016 # o padrão é literal de propósito
if grep -q '\${env\.' "$out"; then
  echo "[arranque] ficou um \${env.…} por substituir no realm:" >&2
  # shellcheck disable=SC2016
  grep -o '\${env\.[A-Z_]*}' "$out" | sort -u >&2
  exit 1
fi

exec /opt/keycloak/bin/kc.sh start --optimized --import-realm
