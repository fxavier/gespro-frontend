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

# Copiar apenas os ficheiros de lock para maximizar cache de layer
COPY package.json pnpm-lock.yaml ./

# Instalar com lockfile congelado (reproduzível)
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 2 — build: gerar cliente Prisma e compilar Next.js
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

ARG PNPM_VERSION=10.22.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copiar node_modules do stage deps
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fonte completo
COPY . .

# Gerar cliente Prisma (necessário para o build Next.js)
RUN pnpm prisma generate

# Garantir que a directoria public existe (necessária para next build standalone)
RUN mkdir -p public

# Build Next.js com output: 'standalone'
# NEXT_TELEMETRY_DISABLED evita chamadas de rede durante o build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

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
# O standalone contém server.js + node_modules mínimos para runtime
# ---------------------------------------------------------------------------
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# ---------------------------------------------------------------------------
# Copiar Prisma para migrate deploy no entrypoint
# Precisamos: CLI (prisma/), cliente gerado (.prisma/), adaptadores (@prisma/)
# e dotenv (importado em prisma.config.ts)
# ---------------------------------------------------------------------------
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv

# ---------------------------------------------------------------------------
# Entrypoint: executa migrations antes de arrancar o servidor
# ---------------------------------------------------------------------------
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
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
