# Runbook — Taxa de Erro 5xx Elevada

**Alerta**: `gespro-taxa-erro-elevada`
**Nível**: CRITICO (pagina)
**Metrica**: Taxa de erros HTTP 5xx > 1% durante 5 minutos
**SLO afectado**: Taxa de erro 5xx < 0,1% (ADR-0019 §3)

---

## Sintoma

- Clientes a reportar erros ao usar o ERP.
- Taxa de erro 5xx visível no painel «Visão Geral» ou «Latência por Rota».
- O alerta `Taxa de Erro 5xx Elevada` disparou no Grafana.
- Múltiplos registos de erro nos logs do ERP.

---

## Diagnóstico

### 1. Identificar as rotas com mais erros

No Grafana, painel «Latência por Rota» ou usar:

```bash
# Métricas em formato Prometheus (substituir METRICS_SECRET se definido)
curl -s http://localhost:3000/api/metrics | \
  grep 'http_requests_total{' | \
  grep 'status_code="5' | \
  sort -t'=' -k4 -rn | head -20
```

### 2. Correlacionar com logs

No Grafana (Loki):
```
{service="gespro"} | json | level="error" | line_format "{{.msg}} {{.url}} {{.duration}}"
```

Ou nos logs do processo:
```bash
docker compose logs erp-1 | grep '"level":"error"' | python3 -m json.tool | head -50
```

### 3. Verificar se é uma rota específica ou todas

- Se apenas uma rota: problema no serviço de domínio ou na DB
- Se todas as rotas: problema transversal (DB, memória, dependência externa)

### 4. Verificar disponibilidade da DB

```bash
curl -s http://localhost:3000/api/ready
# 503 → DB inacessível (ver runbook alerta-db-inacessivel.md)
```

### 5. Verificar Keycloak (erros de autenticação)

```bash
curl -s http://localhost:3000/api/metrics | grep 'keycloak_available'
# 0 → Keycloak indisponível (ver runbook alerta-keycloak-indisponivel.md)
```

### 6. Ver stack traces nos logs

```bash
# Erros com stack trace (server-side, nunca expostos ao cliente)
docker compose logs erp-1 | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line)
        if d.get('level') == 'error' and d.get('err'):
            print(json.dumps(d, indent=2))
    except: pass
" | head -100
```

---

## Acção

### Caso 1: Rota específica com bug (erro de lógica de negócio)

1. Identificar a rota e o serviço de domínio.
2. Ver o stack trace nos logs para identificar a linha exacta.
3. Se possível, corrigir e fazer deploy. Se não, ver Caso 2.

### Caso 2: Falha em dependência externa (DB, Valkey, serviço terceiro)

1. Verificar cada dependência:
   ```bash
   curl http://localhost:3000/api/ready       # DB
   curl http://localhost:3000/api/metrics | grep valkey_available  # Valkey
   curl http://localhost:3000/api/metrics | grep keycloak_available # Keycloak
   ```
2. Resolver a dependência em falta (ver runbooks específicos).
3. Verificar se os erros diminuíram.

### Caso 3: Pico de carga (rate limiting a falhar aberto)

```bash
# Verificar o limitador
curl http://localhost:3000/api/metrics | grep 'valkey_circuit_breaker'
```

Se o limitador está a falhar aberto, a carga pode estar a passar sem limitação.
Ver runbook de Valkey ou reduzir a carga externa.

### Caso 4: Problema de memória ou evento loop saturado

```bash
# Métricas de processo Node.js
curl -s http://localhost:3000/api/metrics | grep -E "nodejs_heap|nodejs_event_loop"

# Reiniciar as instâncias (disruptivo mas rápido)
docker compose restart erp-1 erp-2
```

### Caso 5: Deploy defeituoso (regressão)

```bash
# Verificar a versão em produção
curl -s http://localhost:3000/api/health | python3 -m json.tool | grep version

# Rollback para a versão anterior
docker compose stop erp-1 erp-2
docker compose up -d --build erp-1 erp-2  # re-build com código anterior
```

---

## Verificação pós-resolução

```bash
# Taxa de erro deve baixar abaixo de 0,1%
# No Grafana: «Visão Geral» → Taxa de Erro 5xx
# Aguardar 5 minutos para o alerta se resolver automaticamente

# Verificar métricas directamente
curl -s http://localhost:3000/api/metrics | \
  grep 'http_requests_total' | \
  awk -F'[{,}]' '{
    for(i=1;i<=NF;i++) {
      if($i ~ /status_code/) { split($i,a,"="); code=a[2] }
    }
    if(code ~ /"5/) print $0
  }'
```

---

## Contexto

- ADR-0019: SLO de taxa de erro < 0,1% (em 7 dias)
- Painel relacionado: «GestPro — Visão Geral», «GestPro — Erros por Tenant»
- Se o erro for num tenant específico: filtrar por `tenant_id` no painel de erros

---

*Criado: 2026-08-21 · Última revisão: 2026-08-21 · Dono: w8-observabilidade*
