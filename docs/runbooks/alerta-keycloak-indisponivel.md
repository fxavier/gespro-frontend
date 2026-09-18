# Runbook — Keycloak Indisponível

**Alerta**: `gespro-keycloak-indisponivel`
**Nível**: CRITICO (pagina)
**Metrica**: `keycloak_available == 0` durante 2 minutos
**SLO afectado**: Disponibilidade do login (99,5% em 30 dias — ADR-0019 §3)

---

## Sintoma

- Utilizadores não conseguem autenticar-se no ERP.
- A página de login apresenta erro ou o redirecionamento para o Keycloak falha.
- O alerta `Keycloak Indisponível` disparou no Grafana.
- `keycloak_available` = 0 no painel «Visão Geral».

O ERP continua a funcionar para sessões já existentes (JWT ainda válido), mas nenhum utilizador novo consegue entrar e as sessões expiradas não são renovadas.

---

## Diagnóstico

### 1. Verificar o probe de saúde do Keycloak

```bash
# URL do Keycloak (ajustar conforme o ambiente)
KEYCLOAK_URL="http://keycloak:8080"

# Probe de saúde Keycloak 26+
curl -v "${KEYCLOAK_URL}/health/live"
curl -v "${KEYCLOAK_URL}/health/ready"
```

Resposta esperada (HTTP 200):
```json
{"status": "UP"}
```

Se receber `connection refused` ou timeout: o processo Keycloak não está a correr.
Se receber HTTP 503: o Keycloak está a arrancar ou a base de dados não está acessível.

### 2. Verificar o contentor Keycloak (ambiente local)

```bash
# Estado do contentor
docker compose ps keycloak

# Logs recentes
docker compose logs --tail=100 keycloak

# Entrar no contentor para diagnóstico directo
docker compose exec keycloak bash
```

### 3. Verificar a base de dados do Keycloak

O Keycloak usa uma instância PostgreSQL própria (separada da DB do ERP).

```bash
# Verificar a DB do Keycloak
docker compose exec keycloak-db psql -U keycloak -c "SELECT 1;"

# Logs da DB do Keycloak
docker compose logs --tail=50 keycloak-db
```

### 4. Verificar o realm e a configuração

```bash
# Listar realms (requer que o Keycloak esteja a correr)
curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=${KEYCLOAK_ADMIN_PASSWORD}&grant_type=password" \
  | python3 -m json.tool

# Verificar o realm gespro
curl -s -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/gespro" | python3 -m json.tool
```

### 5. Verificar os logs do ERP para erros de autenticação

```bash
# Filtrar logs de autenticação no Loki (via Grafana)
# Query: {service="gespro"} |= "keycloak" | json
# Ou nos logs do processo:
docker compose logs --tail=100 erp | grep -i "keycloak\|auth\|token"
```

---

## Acção

### Caso 1: Contentor Keycloak parado

```bash
# Reiniciar o Keycloak
docker compose up -d keycloak

# Aguardar arranque (pode demorar 30-60 segundos)
docker compose logs -f --tail=50 keycloak

# Verificar quando estiver pronto
until curl -s "${KEYCLOAK_URL}/health/live" | grep -q '"status":"UP"'; do
  sleep 5; echo "Aguardar...";
done
echo "Keycloak pronto."
```

### Caso 2: Keycloak a arrancar (503 temporário)

Aguardar 60 segundos. O Keycloak demora a arrancar porque:
1. Inicializa a ligação à base de dados
2. Carrega os realms
3. Compila os temas

Se ao fim de 120 segundos ainda não estiver pronto, ver Caso 3.

### Caso 3: Base de dados do Keycloak inacessível

```bash
# Verificar a DB
docker compose up -d keycloak-db

# Aguardar a DB
sleep 10

# Reiniciar o Keycloak após a DB estar pronta
docker compose restart keycloak
```

### Caso 4: Realm gespro corrompido ou em falta

```bash
# Importar o realm de base (ficheiro versionado)
docker compose exec keycloak \
  /opt/keycloak/bin/kc.sh import \
  --file /opt/keycloak/data/import/realm-gespro.json \
  --override false
```

### Caso 5: Credenciais de admin expiradas

```bash
# Redefinir a password do admin Keycloak
docker compose exec keycloak \
  /opt/keycloak/bin/kcadm.sh set-password \
  --username admin --new-password "${KEYCLOAK_ADMIN_PASSWORD}" \
  --server "${KEYCLOAK_URL}" \
  --realm master \
  --user admin
```

---

## Verificação pós-resolução

```bash
# 1. Probe de saúde verde
curl "${KEYCLOAK_URL}/health/live"  # → {"status":"UP"}

# 2. Métrica recuperada (aguardar até 60s para o próximo probe)
# No Grafana: keycloak_available deve voltar a 1

# 3. Teste de login no ERP
curl -c /tmp/cookies.txt -X POST "http://localhost:3000/api/auth/session"

# 4. Confirmar que o alerta se resolveu no Grafana
# Painel «Visão Geral» → Keycloak → DISPONÍVEL (verde)
```

---

## Comunicação

- **Duração < 15 min**: sem comunicação necessária (dentro do budget SLO)
- **Duração 15-60 min**: notificar clientes via canal de suporte
- **Duração > 60 min**: escalar e comunicar com ETA

---

## Contexto

- ADR-0010: Keycloak como fornecedor de identidade
- ADR-0012: Alojamento do Keycloak
- ADR-0019: SLO de disponibilidade do login (99,5% em 30 dias)
- Painel relacionado: «GestPro — Visão Geral» → Disponibilidade dos Serviços

---

*Criado: 2026-08-21 · Última revisão: 2026-08-21 · Dono: w8-observabilidade*
