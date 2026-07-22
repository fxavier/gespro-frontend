# Design: Website de Marketing — Monorepo `apps/site`

## Arquitectura

Monorepo pnpm-workspaces + Turborepo com duas apps Next.js independentes e pacotes partilhados
mínimos. Trade-off consciente vs. um único route group `(marketing)` dentro da app actual: um
route group seria mais barato de montar (zero migração), mas o site público partilharia
`middleware.ts`, CSP e pipeline de build/deploy com o ERP autenticado — qualquer alteração de
segurança/performance do ERP arrisca o site (e vice-versa), e um deploy de conteúdo do site
forçaria sempre rebuild/redeploy do ERP inteiro. O monorepo isola: (1) CSP e headers — o site
pode ser `report-only` mais permissivo (analytics, fontes) sem tocar no `middleware.ts` do ERP;
(2) cadência de deploy — conteúdo/blog publica-se sem passar pelo pipeline de migrations do ERP;
(3) orçamento de performance — o bundle do site não carrega Prisma/Radix do dashboard. Custo
aceite: dois `package.json`, `turbo.json` a gerir, `packages/tsconfig`/`packages/eslint-config`
para não duplicar configuração.

## Estrutura do monorepo

```
pnpm-workspace.yaml
turbo.json
package.json                      # scripts raiz (turbo run ...)
apps/
  erp/                             # app actual, movida sem alterações funcionais
    next.config.ts, Dockerfile, src/**, prisma/**, .env.example
  site/
    next.config.ts
    src/
      app/
        (marketing)/
          page.tsx                       # Home
          funcionalidades/page.tsx
          funcionalidades/[modulo]/page.tsx
          precos/page.tsx
          sobre/page.tsx
          contacto/page.tsx
          recursos/page.tsx
          recursos/[slug]/page.tsx
          termos/page.tsx
          privacidade/page.tsx
        sitemap.ts
        robots.ts
        not-found.tsx
        error.tsx
        global-error.tsx
        api/og/route.tsx              # next/og ImageResponse
        api/contacto/route.ts         # withApi-like handler, envia via provider de email
      components/marketing/           # hero, feature-grid, pricing-table, testimonials, cta
      lib/
        content.ts                    # loader MDX + schema Zod do frontmatter
        planos.ts                     # cliente do catálogo de planos (spec 19)
        analytics.ts
      messages/pt.json                # next-intl
    content/
      blog/*.mdx
      recursos/*.mdx
packages/
  brand/
    tokens.css                        # tokens base partilhados (paleta, tipografia, radius)
    logo/*.svg
  tsconfig/
    base.json, nextjs.json
  eslint-config/
    index.js
docs/decisions/ADR-0006-monorepo-site.md
docs/decisions/ADR-0007-animacao-motion.md
docs/decisions/ADR-0008-analytics-privacy-first.md
```

`apps/erp` mantém `src/`, `prisma/`, `Dockerfile` tal como estão hoje — apenas caminhos relativos
(`Dockerfile` context, `docker-entrypoint.sh`) e scripts do `package.json` raiz que hoje assumem
"a app é a raiz" passam a `pnpm --filter erp <script>` / `turbo run <script> --filter=erp`.

## Design system e animação

- `packages/brand/tokens.css`: custom properties base (`--color-primary`, `--font-sans`,
  `--radius-*`) importadas por `apps/erp/src/app/globals.css` e por
  `apps/site/src/app/globals.css`. O site estende num `@theme` próprio
  (`apps/site/src/app/theme.css`) com gradientes/paleta de destaque adicionais — nunca redefine
  os tokens base, só adiciona.
- Animação: `motion/react` para hero (entrada em cascata), scroll-linked (`useScroll` +
  `useTransform` para parallax leve em secções de funcionalidades), e gestos em CTAs/cards
  (`whileHover`/`whileTap`). Micro-interacções simples (hover de link, fade de tooltip) em CSS
  `@keyframes`/`transition` puro — sem custo de JS.
- `prefers-reduced-motion`: hook `useReducedMotion()` do Motion envolve toda a configuração de
  variantes; quando activo, animações de entrada colapsam para opacidade instantânea.
- View Transitions API: avaliada para navegação entre `/funcionalidades/[modulo]` (transição de
  imagem hero); feature-detected (`document.startViewTransition`), com fallback silencioso
  (navegação normal do App Router) em browsers sem suporte.
- Componentes vivem em `apps/site/src/components/marketing/*`; **não** reutilizam
  `src/components/patterns/*` do ERP (bibliotecas de UI distintas por app; só os tokens de marca
  são partilhados via `packages/brand`).

## Páginas e conteúdo

- Conteúdo MDX (`apps/site/content/{blog,recursos}`) carregado por `lib/content.ts`
  (`fs.readdir` + `gray-matter`/`next-mdx-remote`, frontmatter validado com Zod); rotas estáticas
  via `generateStaticParams`. CMS headless (Sanity/Contentlayer) fica anotado como opção futura em
  `docs/decisions/` — não implementado nesta entrega.
- `/precos` chama `lib/planos.ts` (fetch server-side ao endpoint público do spec 19, com
  `revalidate` curto — ISR) e renderiza a tabela de planos + FAQ; nenhum valor monetário
  hardcoded no componente.
- `/contacto` submete para `app/api/contacto/route.ts` (Route Handler, validação Zod,
  envia por `EmailProvider` já existente em `src/server/email/*` do ERP **não é reutilizado
  directamente** — o site tem o seu próprio provider fino, sem acesso a `server-only` do ERP).
- Páginas `/termos` e `/privacidade` são MDX estáticos versionados no próprio repo (conteúdo
  legal, sem necessidade de CMS).

## SEO, i18n e acessibilidade

- `generateMetadata` por rota; OG dinâmico via `app/api/og/route.tsx` (`ImageResponse`) parametrizado
  por título/secção passados na query string.
- `app/sitemap.ts` itera rotas estáticas + slugs MDX; `app/robots.ts` aponta para o sitemap e
  bloqueia `/api/*`.
- JSON-LD: componente `<JsonLd data={...} />` server-rendered em Home (`Organization`), `/precos`
  (`Product` por plano + `FAQPage`).
- i18n: `next-intl` com `middleware.ts` próprio do `apps/site` (routing por locale, distinto do
  `middleware.ts` do ERP); só `messages/pt.json` populado nesta entrega, `messages/en.json`
  criado com chaves e placeholders.
- A11y: componentes seguem WCAG 2.2 AA (foco visível, `aria-*` em navegação e formulários);
  `pnpm e2e:a11y` estendido com specs Playwright+axe apontadas às rotas de `apps/site`.

## Performance

- `next/image` com `formats: ['image/avif','image/webp']`; `next/font` self-hosted (sem `<link>`
  externo a Google Fonts).
- Rotas estáticas por omissão (SSG); `/precos` em ISR (`revalidate: 300`) para reflectir mudanças
  de catálogo sem rebuild completo.
- Orçamento: LCP < 2.5s, CLS < 0.1, INP < 200ms; `useReportWebVitals` envia métricas reais para o
  backend de analytics (Requisito 9). Lighthouse CI (`--filter=site`) corre nas rotas críticas.

## Integração

Fronteira estrita com `.kiro/specs/19-onboarding-provisionamento`: o site é o **front público**,
o spec 19 é dono do **catálogo de planos** e do **provisionamento** (criação de tenant/trial,
Stripe). `apps/site` consome apenas:
- `GET /api/publico/planos` (ou equivalente definido pelo spec 19) — catálogo BÁSICO/
  PROFISSIONAL/EMPRESARIAL, preços, features, usado por `lib/planos.ts`.
- `POST /api/publico/registo` — payload de registo (empresa: nome/NUIT; admin: nome/email/senha;
  `planoId`, província, `captchaToken`; header `Idempotency-Key`) que inicia o fluxo de trial de
  14 dias sem cartão; a resposta (`{ tenantSlug, handoffToken }`) redirecciona para
  `${APP_URL}/auth/registo-callback?token=...` (o site apenas relaia o `token`, nunca lê claims).

Nenhum dos dois endpoints é chamado com credenciais de sessão do ERP; são públicos, com
rate-limit do lado do spec 19. O contrato exacto (schema de payload, versionamento, SLA) é
definido e mantido pelo spec 19; este spec só consome e documenta o consumo em
`docs/handoff/site-provisionamento.md`.

## Deploy

`apps/site` é público e favorece SSG/ISR. Duas opções avaliadas:
1. **Standalone no mesmo App Runner do ERP** (spec 16), como segundo serviço com a mesma imagem
   base Docker (`output: 'standalone'`) — reaproveita Terraform (`infra/modules/app`), custo
   marginal baixo, mas acopla o ciclo de deploy de infraestrutura.
2. **Export estático/ISR + CDN (CloudFront + S3)** — recomendado: custo menor (sem instância
   sempre-ligada para conteúdo maioritariamente estático), cache global, e desacopla
   completamente o deploy do site do App Runner/RDS do ERP; ISR de `/precos` exige runtime Node
   (Lambda@Edge/CloudFront Functions ou um App Runner mínimo só para as rotas ISR) — avaliar
   consoante o volume de alterações de preço.
Pipeline: `turbo run build --filter=site` num job próprio do CI (`.github/workflows/ci.yml`,
job `site`), deploy independente do ERP (`--filter=site`), sem passar por `prisma migrate deploy`.

## Riscos

- **Migração do ERP para `apps/erp`**: risco de quebrar aliases (`@/*`), `Dockerfile` context ou
  variáveis de ambiente — mitigar com `pnpm check`/`pnpm gates`/`pnpm e2e` verdes no worktree
  antes de qualquer outra alteração, como primeira tarefa isolada.
- **Divergência de marca**: sem `packages/brand` como única fonte, o site e o ERP podem divergir
  visualmente — gate simples (grep de cores hex fora de `tokens.css`/`@theme`).
- **Acoplamento indevido ao spec 19**: se o endpoint de planos ainda não existir quando este spec
  arrancar, `/precos` DEVE ter um *mock*/fixture local com aviso claro (`TODO spec 19`) para não
  bloquear o resto do site.
- **ISR de preços em CDN estático**: se a opção 2 de deploy for escolhida, validar cedo que a
  plataforma de hosting suporta revalidação on-demand; caso contrário, cair para rebuild agendado.
