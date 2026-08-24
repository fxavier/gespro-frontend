# Runbook — Base de Dados Inacessível

**Alerta**: `gespro-db-inacessivel`
**Nível**: CRITICO (pagina)
**Metrica**: `probe_success{job="gespro-db-probe"} == 0` durante 2 minutos
**SLO afectado**: Disponibilidade do ERP (99,5% em 30 dias — ADR-0019 §3)

---

## Sintoma

- `/api/ready` retorna HTTP 503 `{"status":"not_ready","db":"error"}`.
- O ERP pode ainda responder a pedidos com sessão e dados em cache, mas mutações falham.
- Em breve, o ERP começará a retornar erros 500 em todas as operações de escrita.
- O alerta `Base de Dados Inacessível` disparou no Grafana.

---

## Diagnóstico

### 1. Verificar o probe de readiness do ERP

```bash
curl -v http://localhost:3000/api/ready
# 200 → DB acessível (falso alarme — verificar o probe directamente)
# 503 → DB inacessível
```

### 2. Verificar o estado do PostgreSQL

```bash
# Estado do contentor
docker compose ps db

# Conectividade básica
docker compose exec db pg_isready -U gespro

# Logs recentes
docker compose logs --tail=100 db
```

### 3. Verificar o disco (PostgreSQL para se houver disco cheio)

```bash
# Espaço em disco
docker system df
df -h

# Tamanho dos volumes Docker
docker volume ls
docker volume inspect gespro_db_data
```

### 4. Verificar ligações activas

```bash
# Número de ligações activas
docker compose exec db psql -U gespro -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Ligações por aplicação
docker compose exec db psql -U gespro -c \
  "SELECT application_name, count(*) FROM pg_stat_activity GROUP BY application_name;"
```

### 5. Verificar se há transacções longas ou locks

```bash
docker compose exec db psql -U gespro -c \
  "SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
   AND state != 'idle';"
```

---

## Acção

### Caso 1: Contentor PostgreSQL parado

```bash
# Reiniciar a DB
docker compose up -d db

# Aguardar arranque
until docker compose exec db pg_isready -U gespro; do
  sleep 2; echo "Aguardar PostgreSQL..."
done
echo "PostgreSQL pronto."

# Verificar readiness do ERP
curl http://localhost:3000/api/ready
```

### Caso 2: Disco cheio

```bash
# Limpar logs Docker (cuidado — remove logs de diagnóstico)
docker system prune --volumes  # NÃO em produção sem verificar primeiro

# Ou limpar especificamente os logs dos contentores
docker compose exec db sh -c "find /var/lib/postgresql/data/pg_log -mtime +7 -delete"

# Aumentar o volume (pedido ao w8-plataforma-local para ajustar o compose)
```

### Caso 3: Ligações esgotadas (connection pool cheio)

```bash
# Forçar encerramento de ligações idle
docker compose exec db psql -U gespro -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND query_start < now() - interval '10 minutes';"

# Reiniciar o ERP para limpar o pool do lado da aplicação
docker compose restart erp-1 erp-2
```

### Caso 4: Transacção longa a bloquear escritas

```bash
# Identificar a transacção longa
docker compose exec db psql -U gespro -c \
  "SELECT pid, now() - query_start as duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC LIMIT 5;"

# Terminar a transacção problemática (substituir PID)
docker compose exec db psql -U gespro -c "SELECT pg_terminate_backend(PID);"
```

### Caso 5: Corrupção de dados (raro, mas documentado)

1. NÃO reiniciar imediatamente — preservar os ficheiros.
2. Fazer snapshot do volume antes de qualquer acção.
3. Verificar os logs do PostgreSQL por erros de checksum.
4. Consultar procedimento de restauro em `docs/runbooks/ensaio-restauro.md`.

---

## Verificação pós-resolução

```bash
# 1. Readiness probe
curl http://localhost:3000/api/ready
# → {"status":"ready","db":"ok","timestamp":"..."}

# 2. Verificar que a métrica se recuperou (aguardar até 30s para o próximo probe)
# No Grafana: painel «Visão Geral» → ERP deve voltar a verde

# 3. Teste de escrita simples
# Fazer login e criar um registo de teste para confirmar escritas funcionam

# 4. Alerta resolvido no Grafana (aguardar até 5 min)
```

---

## Contexto

- ADR-0019: SLO de disponibilidade (99,5%)
- ADR-0020: Continuidade e recuperação (backup e restauro)
- O `/api/ready` verifica a DB com `SELECT 1` (sem Keycloak, sem Valkey)
- Painel relacionado: «GestPro — Visão Geral»

---

*Criado: 2026-08-21 · Última revisão: 2026-08-21 · Dono: w8-observabilidade*
