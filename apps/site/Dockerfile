# Dockerfile do SITE de marketing (apps/site) — spec 18.
#
# Independente do Dockerfile do ERP: o site não corre `prisma migrate deploy`,
# não precisa de acesso à base de dados e publica-se sem passar pelo ciclo de
# migrations do produto (ADR-0006). Contexto de build = raiz do monorepo.
#
#   docker build -f apps/site/Dockerfile -t gespro-site .

# ─── deps: instala o workspace inteiro a partir dos manifestos ────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/site/package.json apps/site/
COPY packages/brand/package.json packages/brand/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN pnpm install --frozen-lockfile --filter site...

# ─── build: gera o output standalone do site ─────────────────────────────────
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/site/node_modules ./apps/site/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages ./packages
COPY apps/site ./apps/site
# Chaves NEXT_PUBLIC_* são embutidas no bundle em build. As restantes são lidas
# em runtime. Passar as públicas com --build-arg quando o domínio for conhecido.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3100
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter site build

# ─── runner: imagem mínima não-root ──────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# O standalone em monorepo produz apps/site/.next/standalone/apps/site/server.js
# com os node_modules na raiz do standalone.
COPY --from=build --chown=nextjs:nodejs /app/apps/site/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/site/.next/static ./apps/site/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/site/public ./apps/site/public

USER nextjs
EXPOSE 3100

# Healthcheck contra uma rota pública real (sem base de dados envolvida).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/site/server.js"]
