#!/bin/sh
# docker-entrypoint.sh — ponto de entrada do container de produção.
#
# Três modos:
#   (sem argumentos)  arranca o servidor Next.js. NÃO migra (#574), salvo com
#                     MIGRAR_NO_ARRANQUE=1 — bandeira da pilha local
#                     (docker-compose.yml, perfil `full`), nunca de produção.
#   migrar            aplica as migrations pendentes e sai. É o passo único de
#                     pre-deploy (Railway: `preDeployCommand` em
#                     apps/erp/railway.json), que corre UMA vez, antes de a versão
#                     nova receber tráfego, e falha o deploy se falhar.
#   <comando…>        corre-o (ex.: `node -v` no CI). É também o que garante o
#                     `migrar` se a plataforma passar o preDeployCommand como
#                     argumentos ao ENTRYPOINT em vez de o substituir.
#
# Porquê fora do arranque (#574): migrar em cada réplica NÃO é seguro. Com duas
# réplicas a arrancar, a que perde o lock consultivo do Prisma (timeout curto)
# falha e entra em crash-loop; e uma réplica morta pelo health check a meio de
# uma migração longa (backfills) deixa-a marcada como falhada (P3009), o que
# trava todos os arranques seguintes até um `migrate resolve` à mão.
#
# Regras invioláveis:
#   - NUNCA usar `prisma migrate dev` em produção.
#   - Padrão expand/contract: adicionar colunas antes de as usar; remover só
#     depois de nenhum código as referenciar — durante o deploy, a versão
#     anterior continua a servir sobre o schema já migrado.
set -eu

migrar() {
  echo "[entrypoint] A aplicar migrations pendentes (prisma migrate deploy)..."
  # Só aplica migrations já geradas (.sql committed); nunca gera nem altera o
  # schema. Corre a partir de apps/erp — é onde vivem prisma.config.ts e prisma/.
  cd /app/apps/erp
  node /app/node_modules/prisma/build/index.js migrate deploy
  cd /app
  echo "[entrypoint] Migrations aplicadas."
}

case "${1:-}" in
  migrar)
    migrar
    ;;
  "")
    echo "[entrypoint] Ambiente: ${NODE_ENV:-production}"
    if [ "${MIGRAR_NO_ARRANQUE:-0}" = "1" ]; then
      migrar
    else
      echo "[entrypoint] Sem migrations no arranque (MIGRAR_NO_ARRANQUE != 1)."
    fi
    echo "[entrypoint] A iniciar servidor Next.js..."
    exec node /app/apps/erp/server.js
    ;;
  *)
    exec "$@"
    ;;
esac
