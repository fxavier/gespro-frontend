#!/bin/sh
# Agendador de produção (Railway) — uma corrida de UMA rota /api/cron/*.
#
# Uso: chamar <caminho>          ex.: chamar /api/cron/expirar-trials
#
# Cada serviço cron do Railway arranca este contentor no seu horário, ele faz
# uma chamada e TERMINA (o Railway exige que um cron termine; se a corrida
# anterior ainda estiver viva, salta a seguinte — não há sobreposição vinda
# do agendador). O contrato — rota, método, cabeçalho, horário — é o de
# docs/runbooks/agendador.md; o dublê local é infra/local/cron/chamar.sh.
#
# Diferenças face ao dublê local, de propósito:
#   - SAI COM ERRO quando a rota falha (≥ 400 ou rede): a execução fica
#     «Failed» no Railway em vez de um «ok» enganador;
#   - retentativa curta em falhas transitórias (ligação recusada, 5xx). As
#     rotas são idempotentes (ADR-0032);
#   - batimento opcional (CRON_HEARTBEAT_URL): só depois de um 2xx avisa um
#     monitor externo, que alerta quando o batimento falta — é o que cobre
#     «cron falhou» E «cron não correu» (docs/runbooks/deploy-railway.md §Alertas).
set -eu

CAMINHO="${1:?uso: chamar /api/cron/<rota>}"
: "${CRON_SECRET:?CRON_SECRET em falta}"
: "${ERP_HOST:?ERP_HOST em falta (domínio privado do ERP)}"
URL="http://${ERP_HOST}:${ERP_PORTA:-3000}${CAMINHO}"
INSTANTE="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

if CORPO="$(curl --silent --show-error --fail-with-body \
      --max-time 1800 --retry 2 --retry-delay 30 --retry-connrefused \
      --header "Authorization: Bearer ${CRON_SECRET}" \
      "$URL" 2>&1)"; then
  echo "[cron] ${INSTANTE} ${CAMINHO} ok ${CORPO}"
else
  echo "[cron] ${INSTANTE} ${CAMINHO} FALHOU ${CORPO}" >&2
  exit 1
fi

if [ -n "${CRON_HEARTBEAT_URL:-}" ]; then
  # O batimento falhar não desfaz a corrida (que já teve 2xx); só avisa.
  curl --silent --show-error --fail --max-time 30 --retry 3 "$CRON_HEARTBEAT_URL" >/dev/null \
    || echo "[cron] ${INSTANTE} ${CAMINHO} batimento não entregue" >&2
fi
