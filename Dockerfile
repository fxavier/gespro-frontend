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
#   - `prisma migrate deploy` corre no entrypoint (nunca `migrate dev`).
#   - HEALTHCHECK aponta para GET /api/health (liveness, sem auth).
# ==============================================================================

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.22.0

# ==============================================================================
# Stage 1 — deps: instalar todas as dependências (incluindo dev para o build)
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Activar pnpm via corepack (versão fixada)
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copiar apenas os manifestos do workspace para maximizar cache de layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/erp/package.json ./apps/erp/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Instalar com lockfile congelado (reproduzível)
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 2 — build: gerar cliente Prisma e compilar Next.js
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

ARG PNPM_VERSION=10.22.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

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
RUN pnpm --filter erp build

# O output standalone não inclui a CLI do Prisma (não é importada em runtime),
# e a árvore pnpm é toda symlinks para .pnpm/ — que o `COPY` não segue. Instala-se
# um node_modules plano, só com o que o entrypoint precisa (`prisma migrate deploy`
# e o `dotenv` importado por prisma.config.ts), na versão exacta do lockfile.
RUN PRISMA_VERSION="$(node -p "require('/app/apps/erp/node_modules/prisma/package.json').version")" && \
    DOTENV_VERSION="$(node -p "require('/app/apps/erp/node_modules/dotenv/package.json').version")" && \
    mkdir -p /runtime-deps && cd /runtime-deps && \
    npm install --omit=dev --no-package-lock --no-audit --no-fund \
      "prisma@${PRISMA_VERSION}" "dotenv@${DOTENV_VERSION}"

# ==============================================================================
# Stage 3 — runner: imagem mínima de produção
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

# Variáveis de ambiente de produção (sem segredos — injectados pelo Secrets Manager)
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
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
# Copiar Prisma para migrate deploy no entrypoint: schema/migrations, config e
# a CLI (node_modules plano preparado no stage build).
# ---------------------------------------------------------------------------
COPY --from=build --chown=nextjs:nodejs /app/apps/erp/prisma ./apps/erp/prisma
COPY --from=build --chown=nextjs:nodejs /app/apps/erp/prisma.config.ts ./apps/erp/prisma.config.ts
COPY --from=build --chown=nextjs:nodejs /runtime-deps/node_modules ./node_modules

# ---------------------------------------------------------------------------
# Entrypoint: executa migrations antes de arrancar o servidor
# ---------------------------------------------------------------------------
COPY --chown=nextjs:nodejs apps/erp/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# HEALTHCHECK: liveness probe em /api/health
# --start-period: tempo de arranque (migrations + boot)
# --interval: frequência de verificação
# --timeout: tempo máximo de resposta
# --retries: falhas consecutivas antes de UNHEALTHY
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
