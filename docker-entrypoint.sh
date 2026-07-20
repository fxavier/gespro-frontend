#!/bin/sh
# docker-entrypoint.sh — ponto de entrada do container de produção.
#
# Regras invioláveis:
#   - NUNCA usar `prisma migrate dev` em produção.
#   - `prisma migrate deploy` é idempotente e seguro para múltiplas réplicas
#     (usa o histórico de migrations aplicadas, nunca recria).
#   - Padrão expand/contract: adicionar colunas antes de as usar; remover só
#     depois de nenhum código as referenciar.
set -eu

echo "[entrypoint] Ambiente: ${NODE_ENV:-production}"
echo "[entrypoint] A aplicar migrations pendentes..."

# prisma migrate deploy: aplica apenas migrations já geradas (.sql committed).
# Nunca gera novas migrations nem altera o schema.
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] Migrations aplicadas. A iniciar servidor Next.js..."

exec node server.js
