#!/bin/sh
# Prepara o realm `gespro` para o `--import-realm`, substituindo os parâmetros
# de ambiente no ficheiro versionado (ADR-0013 §6: as durações de sessão NUNCA
# são fixas no realm — o ambiente de E2E põe-nas em segundos).
#
# Porquê sed e não a substituição nativa `${env.…}` do Keycloak: verificado
# contra a imagem 26.7.0 que a substituição não é aplicada antes do parse do
# JSON — os campos Integer (`ssoSessionIdleTimeout`, `ssoSessionMaxLifespan`)
# rebentam com «Cannot deserialize value of type java.lang.Integer from String
# "${env.…}"». Este passo faz TODAS as substituições, incluindo as de string,
# para não depender de comportamento não documentado.
#
# Restrição assumida: os valores injectados não podem conter `|` nem `&`
# (delimitador/metacarácter do sed). Verdade para segundos e para os segredos
# gerados com `openssl rand -hex 32`.
set -eu

tpl=/opt/keycloak/realm-template/realm-gespro.json
out=/opt/keycloak/data/import/realm-gespro.json

mkdir -p /opt/keycloak/data/import
sed \
  -e "s|\"\${env.GESPRO_SSO_IDLE_SECONDS}\"|${GESPRO_SSO_IDLE_SECONDS}|g" \
  -e "s|\"\${env.GESPRO_SSO_MAX_SECONDS}\"|${GESPRO_SSO_MAX_SECONDS}|g" \
  -e "s|\${env.GESPRO_ERP_CLIENT_SECRET}|${GESPRO_ERP_CLIENT_SECRET}|g" \
  -e "s|\${env.GESPRO_SMTP_HOST}|${GESPRO_SMTP_HOST}|g" \
  -e "s|\${env.GESPRO_SMTP_PORT}|${GESPRO_SMTP_PORT}|g" \
  "$tpl" > "$out"

exec /opt/keycloak/bin/kc.sh start --import-realm
