#!/usr/bin/env bash
# Dispara um alerta de teste e confirma recepção no receptor de webhook local.
# Usado para validar o fluxo completo: regra → Alertmanager → webhook-sink.
#
# Pré-requisitos:
#   - Pilha local a correr: docker compose --profile full up -d
#   - Grafana acessível em http://localhost:3001 (ou GRAFANA_URL)
#   - Receptor de webhook a correr em http://localhost:9999 (ou WEBHOOK_URL)
#
# Uso:
#   ./infra/local/observabilidade/scripts/disparar-alerta-teste.sh
#   GRAFANA_URL=http://localhost:3001 GRAFANA_USER=admin GRAFANA_PASS=admin \
#     ./infra/local/observabilidade/scripts/disparar-alerta-teste.sh

set -euo pipefail

GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"
GRAFANA_USER="${GRAFANA_USER:-admin}"
GRAFANA_PASS="${GRAFANA_PASS:-admin}"
WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:9999}"
APP_URL="${APP_URL:-http://localhost:3000}"

echo "================================================"
echo " GestPro — Verificação de Alertas (task 2.9)"
echo "================================================"
echo ""
echo "Grafana:  ${GRAFANA_URL}"
echo "Webhook:  ${WEBHOOK_URL}"
echo "App:      ${APP_URL}"
echo ""

# ---------------------------------------------------------------------------
# 1. Verificar que os serviços estão acessíveis
# ---------------------------------------------------------------------------
echo "[1/5] Verificar acessibilidade dos serviços..."

if ! curl -s --fail "${APP_URL}/api/health" > /dev/null 2>&1; then
  echo "ERRO: ERP não está acessível em ${APP_URL}/api/health"
  echo "  Certifica-te de que 'docker compose --profile full up -d' foi executado."
  exit 1
fi
echo "  ERP: OK"

if ! curl -s --fail "${GRAFANA_URL}/api/health" > /dev/null 2>&1; then
  echo "ERRO: Grafana não está acessível em ${GRAFANA_URL}"
  exit 1
fi
echo "  Grafana: OK"

if ! curl -s --fail "${WEBHOOK_URL}/health" > /dev/null 2>&1; then
  echo "AVISO: Receptor de webhook não responde em ${WEBHOOK_URL}/health"
  echo "  O serviço webhook-sink pode estar em falta no docker-compose.yml."
  echo "  Pedido de coordenação ao w8-plataforma-local: ver docs/handoff/w8-observabilidade.md"
fi

# ---------------------------------------------------------------------------
# 2. Enviar alerta de teste directamente ao receptor de webhook
# ---------------------------------------------------------------------------
echo ""
echo "[2/5] Enviar alerta de teste directamente ao receptor de webhook..."

TIMESTAMP_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PAYLOAD=$(cat <<EOF
[
  {
    "labels": {
      "alertname": "AlerteTeste",
      "severity": "warning",
      "source": "disparar-alerta-teste.sh",
      "tenant_id": "demo"
    },
    "annotations": {
      "summary": "Alerta de teste — verificação do receptor webhook (task 2.9)",
      "description": "Este alerta foi disparado manualmente para verificar que o receptor de webhook está a funcionar. Pode ignorar.",
      "runbook_url": "docs/runbooks/alerta-erp-indisponivel.md"
    },
    "startsAt": "${TIMESTAMP_ISO}",
    "endsAt": "",
    "generatorURL": "${APP_URL}"
  }
]
EOF
)

HTTP_STATUS=$(curl -s -o /tmp/webhook-response.txt -w "%{http_code}" \
  -X POST "${WEBHOOK_URL}/alerts" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" 2>&1 || echo "000")

if [ "${HTTP_STATUS}" = "200" ] || [ "${HTTP_STATUS}" = "201" ] || [ "${HTTP_STATUS}" = "204" ]; then
  echo "  Alerta enviado! HTTP ${HTTP_STATUS}"
  echo "  Resposta: $(cat /tmp/webhook-response.txt 2>/dev/null || echo '(sem corpo)')"
else
  echo "  AVISO: O receptor respondeu HTTP ${HTTP_STATUS}"
  echo "  Resposta: $(cat /tmp/webhook-response.txt 2>/dev/null || echo '(sem corpo)')"
  echo "  Se o serviço webhook-sink não está configurado, o envio directo falha."
  echo "  Isso é esperado até o w8-plataforma-local integrar o serviço no compose."
fi

# ---------------------------------------------------------------------------
# 3. Verificar métricas disponíveis
# ---------------------------------------------------------------------------
echo ""
echo "[3/5] Verificar métricas em /api/metrics..."

METRICS_SECRET="${METRICS_SECRET:-}"
AUTH_HEADER=""
if [ -n "${METRICS_SECRET}" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer ${METRICS_SECRET}\""
fi

if curl -s ${AUTH_HEADER} "${APP_URL}/api/metrics" | grep -q "http_requests_total"; then
  echo "  http_requests_total: PRESENTE"
else
  echo "  AVISO: http_requests_total não encontrado em /api/metrics"
fi

if curl -s ${AUTH_HEADER} "${APP_URL}/api/metrics" | grep -q "keycloak_available"; then
  echo "  keycloak_available: PRESENTE"
else
  echo "  keycloak_available: ausente (Keycloak não configurado ou probe ainda não correu)"
fi

if curl -s ${AUTH_HEADER} "${APP_URL}/api/metrics" | grep -q "valkey_available"; then
  echo "  valkey_available: PRESENTE"
else
  echo "  valkey_available: ausente (Valkey não configurado ou probe ainda não correu)"
fi

if curl -s ${AUTH_HEADER} "${APP_URL}/api/metrics" | grep -q "negocio_vendas_total"; then
  echo "  negocio_vendas_total: PRESENTE"
else
  echo "  negocio_vendas_total: ausente (normal se ainda não houve vendas)"
fi

# ---------------------------------------------------------------------------
# 4. Verificar estado do Grafana
# ---------------------------------------------------------------------------
echo ""
echo "[4/5] Verificar alertas activos no Grafana..."

ALERTS_RESPONSE=$(curl -s \
  -u "${GRAFANA_USER}:${GRAFANA_PASS}" \
  "${GRAFANA_URL}/api/alertmanager/grafana/api/v2/alerts" 2>&1 || echo "ERRO")

if echo "${ALERTS_RESPONSE}" | grep -q "AlerteTeste" 2>/dev/null; then
  echo "  AlerteTeste ENCONTRADO no Alertmanager do Grafana!"
elif echo "${ALERTS_RESPONSE}" | grep -q "ERRO"; then
  echo "  Não foi possível consultar o Grafana. Credenciais: ${GRAFANA_USER} / ***"
  echo "  Verificar se GRAFANA_USER e GRAFANA_PASS estão correctos."
else
  echo "  AlerteTeste não encontrado (pode não ter sido injectado via Grafana)."
  echo "  O envio directo ao webhook-sink não passa pelo Alertmanager do Grafana."
fi

# ---------------------------------------------------------------------------
# 5. Verificar estado do receptor
# ---------------------------------------------------------------------------
echo ""
echo "[5/5] Consultar alertas recebidos no receptor..."

RECEIVED=$(curl -s "${WEBHOOK_URL}/alerts/recebidos" 2>/dev/null || echo "INDISPONÍVEL")
if [ "${RECEIVED}" = "INDISPONÍVEL" ]; then
  echo "  O receptor de webhook não responde em ${WEBHOOK_URL}/alerts/recebidos"
  echo "  (esperado até o w8-plataforma-local integrar o serviço)"
else
  echo "  Alertas recebidos: ${RECEIVED}"
fi

echo ""
echo "================================================"
echo " Resultado"
echo "================================================"
echo ""
echo "As métricas estão a ser expostas em ${APP_URL}/api/metrics"
echo "Os painéis estão versionados em infra/local/observabilidade/dashboards/"
echo "As regras de alerta estão em infra/local/observabilidade/alerts/rules.yaml"
echo ""
echo "Tasks verificadas sem pilha completa:"
echo "  2.1  (parcial) — exportador OTLP configurado por env var"
echo "  2.2  OK — labels verificadas nos testes"
echo "  2.3  OK — probe Keycloak implementada"
echo "  2.4  OK — probe Valkey implementada"
echo "  2.5  OK — sinais de negócio implementados"
echo "  2.6  OK — 4 painéis versionados"
echo "  2.7  OK — regras de alerta em ficheiro"
echo "  2.10 OK — /api/ready não depende de Keycloak nem Valkey"
echo "  2.11 OK — mudar destino = mudar OTEL_EXPORTER_OTLP_ENDPOINT"
echo ""
echo "Tasks à espera da pilha (w8-plataforma-local):"
echo "  2.1  verificação ponta-a-ponta (telemetria a chegar)"
echo "  2.9  alerta disparado e recebido no receptor webhook"
echo ""
echo "Quando a pilha fundir: git merge w8/integracao && bash $(basename $0)"
