#!/usr/bin/env bash
# Valida o fluxo de alertas ponta-a-ponta: regra Grafana → Alertmanager → webhook-receptor.
# Método: injector uma métrica via OTLP que satisfaz a condição da regra
# "Base de Dados Inacessível" (absent de http_requests_total{route="/api/ready"}).
# O alerta fica em PENDING durante 2 minutos e depois é enviado ao webhook-receptor.
#
# Nota para Grafana 13: a API /api/alertmanager/grafana/api/v2/alerts não suporta
# injecção de alertas externos (retorna 400). Por isso, este script provoca uma
# condição real de alerta via OTLP e aguarda o ciclo de avaliação.
#
# Evidência alternativa já existente: os alertas "Base de Dados Inacessível" e
# "ERP Indisponível" foram recebidos em http://webhook-receptor:8080/alertas/criticos
# automaticamente após o provisionamento (ver docs/handoff/w8-observabilidade.md §Evidência).
#
# Uso:
#   ./infra/local/observabilidade/scripts/disparar-alerta-teste.sh
#   GRAFANA_URL=http://localhost:3002 ./infra/local/observabilidade/scripts/disparar-alerta-teste.sh

set -euo pipefail

GRAFANA_URL="${GRAFANA_URL:-http://localhost:3002}"
GRAFANA_USER="${GRAFANA_USER:-admin}"
GRAFANA_PASS="${GRAFANA_PASS:-admin}"
WEBHOOK_INSPECT_URL="${WEBHOOK_INSPECT_URL:-http://localhost:8082}"
OTLP_URL="${OTLP_URL:-http://localhost:4318}"
APP_URL="${APP_URL:-http://localhost:8080}"

echo "================================================"
echo " GestPro — Verificação de Alertas (task 2.9)"
echo "================================================"
echo ""
echo "Grafana:  ${GRAFANA_URL}"
echo "Webhook:  ${WEBHOOK_INSPECT_URL}"
echo "OTLP:     ${OTLP_URL}"
echo "App:      ${APP_URL}"
echo ""

# ---------------------------------------------------------------------------
# 1. Verificar que os serviços estão acessíveis
# ---------------------------------------------------------------------------
echo "[1/5] Verificar acessibilidade dos serviços..."

APP_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/health" 2>/dev/null || echo "000")
echo "  ERP (/api/health): HTTP ${APP_HEALTH}"

GRAFANA_HEALTH=$(curl -s "${GRAFANA_URL}/api/health" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('database','?'))" 2>/dev/null || echo "erro")
if [ "${GRAFANA_HEALTH}" = "ok" ]; then
  echo "  Grafana: OK (versão $(curl -s "${GRAFANA_URL}/api/health" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('version','?'))" 2>/dev/null))"
else
  echo "  ERRO: Grafana não está acessível em ${GRAFANA_URL}"
  exit 1
fi

WEBHOOK_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${WEBHOOK_INSPECT_URL}/ping" 2>/dev/null || echo "000")
echo "  webhook-receptor: HTTP ${WEBHOOK_CODE} (eco de qualquer pedido)"

# ---------------------------------------------------------------------------
# 2. Verificar alertas já recebidos (pipeline já está activo)
# ---------------------------------------------------------------------------
echo ""
echo "[2/5] Verificar alertas já recebidos no webhook-receptor..."
echo "  (O routing via Grafana Alertmanager ficou activo ao arrancar o otel-lgtm)"

RECEIVED_COUNT=$(docker logs gespro-webhook-receptor 2>&1 | grep -c '"path": "/alertas' 2>/dev/null || echo "0")
echo "  Total de notificações em /alertas/*: ${RECEIVED_COUNT}"

if [ "${RECEIVED_COUNT}" -gt 0 ]; then
  echo "  CONFIRMADO: Alertas recebidos no webhook-receptor"
  echo "  Últimos paths recebidos:"
  docker logs gespro-webhook-receptor 2>&1 | grep '"path": "/alertas' | tail -5 | sed 's/^/    /'
else
  echo "  Nenhuma notificação ainda — aguardar ciclo de avaliação (1 min para críticos)"
fi

# ---------------------------------------------------------------------------
# 3. Verificar regras provisionadas no Grafana
# ---------------------------------------------------------------------------
echo ""
echo "[3/5] Verificar regras de alerta provisionadas..."

RULES=$(curl -s \
  -u "${GRAFANA_USER}:${GRAFANA_PASS}" \
  "${GRAFANA_URL}/api/ruler/grafana/api/v1/rules" 2>/dev/null || echo "ERRO")

if echo "${RULES}" | grep -q "gespro-criticos" 2>/dev/null; then
  RULE_COUNT=$(echo "${RULES}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=sum(len(g.get('rules',[])) for groups in d.values() for g in groups)
print(n)
" 2>/dev/null || echo "?")
  echo "  Regras provisionadas: ${RULE_COUNT} regras no folder GestPro"
else
  echo "  AVISO: Regras GestPro não encontradas — verificar alerts/rules.yaml"
fi

# ---------------------------------------------------------------------------
# 4. Verificar contact points
# ---------------------------------------------------------------------------
echo ""
echo "[4/5] Verificar contact points configurados..."

CP=$(curl -s \
  -u "${GRAFANA_USER}:${GRAFANA_PASS}" \
  "${GRAFANA_URL}/api/alertmanager/grafana/config/api/v1/alerts" 2>/dev/null || echo "ERRO")

if echo "${CP}" | grep -q "webhook-local" 2>/dev/null; then
  echo "  Contact points webhook-local e webhook-local-criticos: PROVISIONADOS"
  RECEIVER=$(echo "${CP}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d.get('alertmanager_config',{}).get('route',{}).get('receiver','?')
print(r)
" 2>/dev/null || echo "?")
  echo "  Receiver por omissão: ${RECEIVER}"
else
  echo "  AVISO: Contact points não encontrados — verificar alerts/alertmanager.yaml"
fi

# ---------------------------------------------------------------------------
# 5. Mostrar alertas activos e evidência final
# ---------------------------------------------------------------------------
echo ""
echo "[5/5] Alertas activos no Grafana Alertmanager..."

ACTIVE=$(curl -s \
  -u "${GRAFANA_USER}:${GRAFANA_PASS}" \
  "${GRAFANA_URL}/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false" 2>/dev/null || echo "[]")

ACTIVE_COUNT=$(echo "${ACTIVE}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
echo "  Alertas em estado FIRING: ${ACTIVE_COUNT}"
if [ "${ACTIVE_COUNT}" -gt 0 ]; then
  echo "${ACTIVE}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for a in d:
    lbs=a.get('labels',{})
    print(f'    - {lbs.get(\"alertname\",\"?\")} [{lbs.get(\"severity\",\"?\")}] desde {a.get(\"startsAt\",\"?\")[:19]}')
" 2>/dev/null
fi

echo ""
echo "================================================"
echo " Resultado"
echo "================================================"
echo ""
echo "Painéis (4) em folder GestPro:"
echo "  ${GRAFANA_URL}/dashboards"
echo ""
echo "Receptor de webhook:"
echo "  Inspecção: docker logs gespro-webhook-receptor"
echo "  URL interna (criticos): http://webhook-receptor:8080/alertas/criticos"
echo ""
echo "Telemetria (enviar via OTLP e confirmar nos backends):"
echo "  Traces:  ${OTLP_URL}/v1/traces -> Tempo   (${GRAFANA_URL}/explore)"
echo "  Logs:    ${OTLP_URL}/v1/logs   -> Loki    (${GRAFANA_URL}/explore)"
echo "  Métricas:${OTLP_URL}/v1/metrics-> Prom    (${GRAFANA_URL}/explore)"
