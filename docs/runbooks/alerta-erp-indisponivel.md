# Runbook — ERP Indisponível

**Alerta**: `gespro-erp-indisponivel`
**Nível**: CRITICO (pagina)
**Metrica**: `up{job="gespro-erp"} == 0` ou ausente durante 2 minutos
**SLO afectado**: Disponibilidade do ERP (99,5% em 30 dias — ADR-0019 §3)

---

## Sintoma

- Pedidos HTTP ao ERP retornam erros de conexão ou timeout.
- `/api/health` não responde.
- O alerta `ERP Indisponível` disparou no Grafana.
- Os utilizadores vêem uma página de erro do proxy ou timeout no browser.

---

## Diagnóstico

### 1. Verificar o probe de liveness

```bash
APP_URL="${APP_URL:-http://localhost:3000}"
curl -v "${APP_URL}/api/health"
```

Resposta esperada (HTTP 200):
```json
{"status":"ok","version":"...","timestamp":"..."}
```

### 2. Verificar o estado dos contentores da app

```bash
# Estado de todos os contentores
docker compose ps

# Logs recentes de ambas as instâncias
docker compose logs --tail=100 erp-1
docker compose logs --tail=100 erp-2

# Uso de recursos
docker stats --no-stream
```

### 3. Verificar o proxy (nginx ou similar)

```bash
# Estado do proxy
docker compose logs --tail=50 proxy

# Verificar a configuração de upstream
docker compose exec proxy nginx -t
```

### 4. Verificar a base de dados (se o ERP arrancou mas caiu)

```bash
# O ERP cai se a DB desaparecer durante o arranque
curl -v "${APP_URL}/api/ready"
# 200 → DB ok; 503 → DB inacessível

docker compose logs --tail=50 db
```

### 5. Verificar erros de arranque do Next.js

```bash
# Erros de build ou runtime
docker compose logs erp-1 | grep -i "error\|fatal\|unhandled"
```

---

## Acção

### Caso 1: Processo Next.js terminado

```bash
# Reiniciar a instância
docker compose up -d erp-1 erp-2

# Aguardar arranque
sleep 15
curl "${APP_URL}/api/health"
```

### Caso 2: Out-of-memory (OOM Kill)

```bash
# Verificar se foi OOM
docker inspect gespro-erp-1 | grep -i "OOMKilled"

# Se OOM: aumentar o limite de memória no compose (pedido ao w8-plataforma-local)
# No imediato: reiniciar e monitorar
docker compose restart erp-1 erp-2
```

### Caso 3: Base de dados inacessível (causou crash do ERP)

```bash
# Primeiro restaurar a DB
docker compose up -d db

# Aguardar a DB estar pronta
until docker compose exec db pg_isready -U gespro; do sleep 2; done

# Reiniciar o ERP
docker compose restart erp-1 erp-2
```

### Caso 4: Erro de migração no arranque

O `docker-entrypoint.sh` corre `prisma migrate deploy` antes de iniciar o Next.js.
Se a migração falhar, o processo termina.

```bash
# Ver o erro específico
docker compose logs erp-1 | grep -A 10 "migration"

# Se a migration está travada, ver o estado
docker compose exec db psql -U gespro -c \
  "SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"
```

### Caso 5: Proxy mal configurado (app a correr, proxy a falhar)

```bash
# Verificar se a app responde directamente (bypassar proxy)
curl http://localhost:3000/api/health  # instância 1
curl http://localhost:3001/api/health  # instância 2

# Recarregar configuração do proxy
docker compose exec proxy nginx -s reload
```

---

## Verificação pós-resolução

```bash
# 1. Liveness probe
curl "${APP_URL}/api/health"  # → {"status":"ok",...}

# 2. Readiness probe (DB)
curl "${APP_URL}/api/ready"   # → {"status":"ready","db":"ok",...}

# 3. Ambas as instâncias a funcionar
curl http://localhost:3000/api/health
curl http://localhost:3001/api/health

# 4. Alerta resolvido no Grafana (aguardar até 5min)
# Painel «Visão Geral» → ERP → DISPONÍVEL (verde)
```

---

## Comunicação

- **Duração < 15 min**: sem comunicação necessária (dentro do budget SLO)
- **Duração 15-60 min**: notificar clientes via canal de suporte
- **Duração > 60 min**: escalar, comunicar com ETA, avaliar restauro

---

## Contexto

- ADR-0019: SLO de disponibilidade do ERP (99,5% em 30 dias)
- ADR-0020: Continuidade e recuperação (restauro local)
- ADR-0026: Ambiente local de referência (duas instâncias atrás de proxy)
- Painel relacionado: «GestPro — Visão Geral»

---

*Criado: 2026-08-21 · Última revisão: 2026-08-21 · Dono: w8-observabilidade*
