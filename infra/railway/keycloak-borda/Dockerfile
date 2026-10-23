# Borda pública do Keycloak (Railway) — ver Caddyfile. Versão igual à do
# proxy do docker-compose.yml. Contexto de build: esta pasta (Root Directory
# `infra/railway/keycloak-borda` no serviço Railway).
FROM caddy:2.11.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
