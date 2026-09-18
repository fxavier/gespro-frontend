#!/bin/sh
# Chama uma rota /api/cron/* do ERP com a credencial do agendador.
#
# Uso: chamar <caminho>          ex.: chamar /api/cron/expirar-trials
#
# Deliberadamente burro e sem dependências (BusyBox `wget`): isto é um dublê
# do agendador do fornecedor, não um produto. O que interessa é que o contrato
# — rota, método, cabeçalho — seja exercitado tal como será em produção.
#
# Não falha o contentor: um erro fica no registo e a próxima corrida tenta de
# novo. Todas as rotas são idempotentes (ADR-0032), por isso repetir é seguro.
set -u

CAMINHO="$1"
URL="${BASE_ERP:-http://proxy:8080}${CAMINHO}"
INSTANTE="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

CORPO="$(wget -q -O - \
  --header="Authorization: Bearer ${CRON_SECRET}" \
  "$URL" 2>&1)" \
  && echo "[cron] ${INSTANTE} ${CAMINHO} ok ${CORPO}" \
  || echo "[cron] ${INSTANTE} ${CAMINHO} FALHOU ${CORPO}"
