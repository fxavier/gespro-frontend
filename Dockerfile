# ==============================================================================
# Dockerfile multi-stage — GestPro (Next.js 16, output: standalone)
#
# Stages:
#   deps   → instala dependências com pnpm (cache de store)
#   build  → gera Prisma client + next build
#   runner → imagem mínima de produção, utilizador não-root
#
# Regras:
#   - Sem segredos na imagem (DATABASE_URL e outros injectados em runtime).
#   - A imagem traz a CLI do Prisma, mas o arranque NÃO migra (#574): as
#     migrações são um passo único antes do deploy — `docker-entrypoint.sh
#     migrar` (pre-deploy do Railway, .railway/railway.ts). Só com
#     MIGRAR_NO_ARRANQUE=1 (pilha local) o entrypoint migra antes do servidor.
#     Nunca `migrate dev`.
#   - HEALTHCHECK aponta para GET /api/health (liveness, sem auth).
#
# Node (#577): 22 LTS, o mesmo `NODE_VERSION` do .github/workflows/ci.yml — o
# job `image` do CI falha se `node -v` da imagem não coincidir. Base fixada por
# digest (índice multi-arquitectura); para actualizar:
#   docker buildx imagetools inspect node:22-alpine   # → linha «Digest:»
# e trocar a tag exacta + digest abaixo (os três stages usam a mesma).
#
# pnpm: o corepack usa a versão do campo "packageManager" do package.json
# (estrito por omissão). Não se fixa aqui — um segundo número só divergia.
# ==============================================================================

ARG NODE_IMAGE=node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

# ==============================================================================
# Stage 1 — deps: instalar todas as dependências (incluindo dev para o build)
# ==============================================================================
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

# Activar pnpm via corepack (versão do "packageManager")
RUN corepack enable

# Copiar apenas os manifestos do workspace para maximizar cache de layer
# Todos os projectos do workspace têm de estar presentes: o --frozen-lockfile
# recusa um lockfile com `importers` cujo package.json falte. Faltava o
# packages/brand (entrou com a spec 18) e a imagem deixou de construir sem que
# nada o visse — é o job `image` do CI que o apanha agora (#577).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/erp/package.json ./apps/erp/
COPY apps/site/package.json ./apps/site/
COPY packages/brand/package.json ./packages/brand/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Instalar com lockfile congelado (reproduzível), só o ERP e o que ele usa
RUN pnpm install --frozen-lockfile --filter erp...

# ==============================================================================
# Stage 2 — build: gerar cliente Prisma e compilar Next.js
# ==============================================================================
FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN corepack enable

# Copiar node_modules do stage deps (raiz do workspace + cada pacote)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/erp/node_modules ./apps/erp/node_modules

# Copiar código fonte completo
COPY . .

# Gerar cliente Prisma (necessário para o build Next.js)
RUN pnpm --filter erp exec prisma generate

# Garantir que a directoria public existe (necessária para next build standalone)
RUN mkdir -p apps/erp/public

# Build Next.js com output: 'standalone'
# NEXT_TELEMETRY_DISABLED evita chamadas de rede durante o build
# NODE_OPTIONS aumenta heap para a verificação TypeScript de projectos grandes
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
# NEXT_PUBLIC_* é inlinada no bundle no BUILD; em runtime já não conta. A
# site key do Turnstile (pública por natureza) chega como build arg. O Railway
# passa ao build as variáveis do serviço que o Dockerfile declare como ARG.
# Vazia, o widget do /registo não carrega e o registo público é recusado.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
RUN pnpm --filter erp build

# O output standalone não inclui a CLI do Prisma (não é importada em runtime),
# e a árvore pnpm é toda symlinks para .pnpm/ — que o `COPY` não segue. Instala-se
# um node_modules plano, só com o que `docker-entrypoint.sh migrar` precisa (`prisma migrate deploy`
# e o `dotenv` importado por prisma.config.ts), na versão exacta do lockfile.
RUN PRISMA_VERSION="$(node -p "require('/app/apps/erp/node_modules/prisma/package.json').version")" && \
    DOTENV_VERSION="$(node -p "require('/app/apps/erp/node_modules/dotenv/package.json').version")" && \
    mkdir -p /runtime-deps && cd /runtime-deps && \
    npm install --omit=dev --no-package-lock --no-audit --no-fund \
      "prisma@${PRISMA_VERSION}" "dotenv@${DOTENV_VERSION}"

# ==============================================================================
# Stage 3 — runner: imagem mínima de produção
# ==============================================================================
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

# Variáveis de ambiente de produção (sem segredos — injectados pelo Secrets Manager)
ENV NODE_ENV=production
ENV PORT=3000
# "::" = dual-stack (IPv6 e IPv4). A rede privada do Railway é IPv6-first e os
# crons chamam erp.railway.internal; com 0.0.0.0 o servidor só escutava IPv4.
ENV HOSTNAME="::"
ENV NEXT_TELEMETRY_DISABLED=1

# Instalar wget para o HEALTHCHECK (alternativa ao curl em alpine)
RUN apk add --no-cache wget

# Criar utilizador não-root (segurança: nunca correr como root em produção)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# ---------------------------------------------------------------------------
# Copiar output standalone do Next.js
# Em monorepo o standalone replica a árvore do workspace:
#   .next/standalone/apps/erp/server.js  +  .next/standalone/node_modules
# ---------------------------------------------------------------------------
COPY --from=build --chown=nextjs:nodejs /app/apps/erp/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/erp/.next/static ./apps/erp/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/erp/public ./apps/erp/public

# ---------------------------------------------------------------------------
# Copiar Prisma para o passo de migração (`docker-entrypoint.sh migrar`, o
# preDeployCommand): schema/migrations, config e a CLI (node_modules plano
# preparado no stage build).
# ---------------------------------------------------------------------------
COPY --from=build --chown=nextjs:nodejs /app/apps/erp/prisma ./apps/erp/prisma
COPY --from=build --chown=nextjs:nodejs /app/apps/erp/prisma.config.ts ./apps/erp/prisma.config.ts
COPY --from=build --chown=nextjs:nodejs /runtime-deps/node_modules ./node_modules

# ---------------------------------------------------------------------------
# Entrypoint: arranca o servidor; `migrar` só migra; outro comando corre-o
# (ver apps/erp/docker-entrypoint.sh)
# ---------------------------------------------------------------------------
COPY --chown=nextjs:nodejs apps/erp/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# HEALTHCHECK: liveness probe em /api/health
# --start-period: tempo de arranque (boot; com MIGRAR_NO_ARRANQUE=1, também as migrations)
# --interval: frequência de verificação
# --timeout: tempo máximo de resposta
# --retries: falhas consecutivas antes de UNHEALTHY
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
