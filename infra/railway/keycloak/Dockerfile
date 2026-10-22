# Keycloak de produção (Railway) — ADR-0012 §1/§3/§8, #572.
#
# Contexto de build: a pasta `infra/` (o serviço Railway tem Root Directory
# `infra`). O .dockerignore da raiz exclui `infra/`, por isso o contexto NÃO
# pode ser a raiz do repositório. Localmente:
#   docker build -f infra/railway/keycloak/Dockerfile infra
#
# Versão FIXADA e igual à do docker-compose.yml (ADR-0026 §3: o que corre aqui
# é o que corre localmente). Subir de versão é nos dois sítios ao mesmo tempo,
# com o ensaio do ADR-0012 §6.

# --- 1. Realm de produção, derivado do de desenvolvimento -------------------
FROM alpine:3.22 AS realm
RUN apk add --no-cache jq
COPY keycloak/realm-gespro.json /in/realm-gespro.json
COPY railway/keycloak/realm-producao.jq /in/realm-producao.jq
# O build FALHA se algum utilizador que não seja conta de serviço, a senha de
# demonstração, um e-mail de demo ou localhost sobreviverem à derivação.
RUN mkdir /out \
 && jq -f /in/realm-producao.jq /in/realm-gespro.json > /out/realm-gespro.json \
 && jq -e '[.users[] | select(has("serviceAccountClientId") | not)] | length == 0' /out/realm-gespro.json >/dev/null \
 && jq -e '[.users[] | select(.username == "service-account-gespro-erp")] | length == 1' /out/realm-gespro.json >/dev/null \
 && jq -e '[.. | objects | .description? // empty | select(length > 255)] | length == 0' /out/realm-gespro.json >/dev/null \
 && ! grep -Eq 'demo1234|@demo\.mz|plataforma@gespro\.mz|localhost' /out/realm-gespro.json

# --- 2. Build optimizado (fixa as opções de build: ADR-0012 §3) -------------
FROM quay.io/keycloak/keycloak:26.7.0 AS build
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true
COPY --chown=keycloak:keycloak keycloak/themes/gespro /opt/keycloak/themes/gespro
RUN /opt/keycloak/bin/kc.sh build

# --- 3. Imagem final ---------------------------------------------------------
FROM quay.io/keycloak/keycloak:26.7.0
COPY --from=build /opt/keycloak/ /opt/keycloak/
COPY --from=realm --chown=keycloak:keycloak /out/realm-gespro.json /opt/keycloak/realm-template/realm-gespro.json
COPY --chown=keycloak:keycloak railway/keycloak/arranque.sh /opt/keycloak/arranque.sh
# 8080: HTTP (TLS termina na borda do Railway). 9000: gestão (saúde e
# métricas) — só na rede privada, nunca com domínio público.
EXPOSE 8080 9000
ENTRYPOINT ["/bin/sh", "/opt/keycloak/arranque.sh"]
