# Dockerfile do SITE de marketing (apps/site) — spec 18.
#
# Independente do Dockerfile do ERP: o site não corre `prisma migrate deploy`,
# não precisa de acesso à base de dados e publica-se sem passar pelo ciclo de
# migrations do produto (ADR-0006). Contexto de build = raiz do monorepo.
#
#   docker build -f apps/site/Dockerfile -t gespro-site .
#
# Node 22 LTS, a mesma base (tag exacta + digest) do Dockerfile do ERP e o
# NODE_VERSION do CI (#577). Esteve em node:26-alpine, que (1) não é o Node em
# que o CI testa o site, (2) ainda não é LTS e (3) já não traz o corepack (saiu
# da distribuição no Node 25) — o `corepack enable` abaixo falhava e a imagem
# não construía. Actualizar o digest nos dois Dockerfiles em conjunto.
ARG NODE_IMAGE=node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

# ─── deps: instala o workspace inteiro a partir dos manifestos ────────────────
FROM ${NODE_IMAGE} AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/site/package.json apps/site/
COPY packages/brand/package.json packages/brand/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN pnpm install --frozen-lockfile --filter site...

# ─── build: gera o output standalone do site ─────────────────────────────────
FROM ${NODE_IMAGE} AS build
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
FROM ${NODE_IMAGE} AS runner
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
