# Requisitos: Website de Marketing — Monorepo `apps/site`

## Introdução

O GestPro não tem presença pública: hoje o repositório é uma única app Next.js (o ERP
autenticado). Este spec converte o repositório num **monorepo pnpm-workspaces + Turborepo**
(`apps/erp` = ERP actual, sem alterações funcionais; `apps/site` = site novo) e especifica o
site de marketing — a face pública que capta leads e alimenta o onboarding self-service do
spec 19. O site é uma aplicação Next.js própria, com linguagem visual mais rica que o
dashboard (animação, motion, storytelling de produto), mas partilha tokens de marca com o ERP
via `packages/brand`.

O site **não** acede à base de dados do ERP nem ao Stripe: a página de Preços e os CTAs
"Começar teste grátis" consomem uma API pública de catálogo de planos e um endpoint de
provisionamento expostos pelo spec 19 (`19-onboarding-provisionamento`). Este spec define a
fronteira do lado do consumidor (o "front"); o spec 19 é dono do contrato e da implementação
do provisionamento.

Skills obrigatórias: `ui-conventions`, `engineering:architecture`, `engineering:system-design`, `dataviz`.

## Requisitos

### Requisito 1 — Monorepo pnpm + Turborepo

1. DEVE existir `pnpm-workspace.yaml` com `apps/*` e `packages/*`; o Next.js actual DEVE mover-se
   mecanicamente para `apps/erp` (mesmo `package.json`, aliases `@/*`, `next.config.ts`,
   `Dockerfile`/contexto de build actualizados) **sem** alterar comportamento nem rotas do ERP.
2. DEVE existir `turbo.json` com pipeline `build`/`lint`/`typecheck`/`test` e `outputs` cacheáveis
   (`.next/**`, exceto `.next/cache/**`); cada app DEVE ser executável isoladamente
   (`turbo run build --filter=site`, `--filter=erp`).
3. DEVEM existir `packages/tsconfig` (bases partilhadas: `base.json`, `nextjs.json`) e
   `packages/eslint-config` (regras comuns, extensível por app), consumidos por `apps/erp` e `apps/site`.
4. A decisão de monorepo (vs. route group único `(marketing)` dentro da app actual) DEVE ficar
   registada num ADR (ver Requisito 9) justificando: isolamento de CSP/performance do site público
   face ao ERP autenticado, cadência de deploy independente, e o custo de manutenção adicional
   (dois `package.json`, pipeline dividido) aceite em troca desse isolamento.
5. `pnpm check`/`pnpm gates`/`pnpm e2e` do ERP DEVEM continuar verdes após a migração, correndo a
   partir da raiz do monorepo ou com `--filter=erp`.

### Requisito 2 — Marca partilhada (`packages/brand`)

1. DEVE existir `packages/brand` com `tokens.css` (paleta, tipografia, espaçamento, radius, sombras
   em custom properties, sem valores hardcoded fora deste ficheiro) e assets do logótipo (SVG,
   variantes claro/escuro).
2. `apps/erp` e `apps/site` DEVEM consumir os tokens base de `packages/brand`; o `apps/site` DEVE
   estender esses tokens num `@theme` próprio mais expressivo (gradientes, paleta de destaque,
   escala tipográfica maior) sem duplicar os valores base — só adicionar.
3. Zero cores hardcoded em `apps/site`; dark mode obrigatório com paridade de contraste AA em
   ambos os temas.

### Requisito 3 — Design system e animação do site

1. O site DEVE usar **Motion** (`motion/react`) para animação de entrada, scroll (`useScroll`/
   `useTransform`) e micro-interacções de gesto (hover/tap em CTAs, cards); micro-interacções
   simples (transições de cor/opacidade) DEVEM usar CSS/`@keyframes` puro em vez de JS.
2. Toda a animação DEVE respeitar `prefers-reduced-motion: reduce` (desactivar ou reduzir
   drasticamente parallax/entrada; nunca esconder conteúdo por trás de uma animação que não corre).
3. DEVE avaliar-se o uso da View Transitions API nativa para transições entre páginas do site
   (`next.config.ts` → `experimental.viewTransition` ou equivalente da versão do Next usada);
   se adoptada, DEVE ter fallback sem JS/CSS quebrado em browsers sem suporte.
4. Componentes de UI do site (hero, cards de funcionalidade, secções de prova social, pricing
   table) vivem em `apps/site/src/components/marketing/*`, **não** nos `patterns/*` do ERP (o
   ERP e o site têm bibliotecas de UI distintas; só os tokens são partilhados).

### Requisito 4 — Camada de conteúdo (MDX)

1. DEVE existir uma colecção de conteúdo baseada em ficheiros MDX (`apps/site/content/{blog,recursos}/*.mdx`)
   com *frontmatter* tipado (título, resumo, data, autor, imagem OG, tags) validado por schema
   (Zod) num carregador de conteúdo (`apps/site/src/lib/content.ts`).
2. A escolha de MDX file-based DEVE ficar documentada como ponto de partida, com CMS headless
   (Sanity ou Contentlayer) anotado como opção futura caso o volume de conteúdo/editores não-técnicos
   justifique a migração — sem implementar a integração agora.
3. Páginas de listagem (`/recursos`) e detalhe (`/recursos/[slug]`) DEVEM gerar rotas estáticas
   (`generateStaticParams`) a partir da colecção MDX.

### Requisito 5 — Páginas do site

1. DEVE existir Home (`/`) com: hero animado, secção de prova social (logótipos/testemunhos),
   funcionalidades por domínio do ERP (vendas, stock, compras, finanças, RH, operações, POS),
   secção de conformidade moçambicana (PGC-NIRF, validação NUIT/BI) e CTA final para o trial.
2. DEVE existir `/funcionalidades` (uma secção por módulo do ERP, cada uma DEVE poder ser
   navegada por âncora e por página própria `/funcionalidades/[modulo]`).
3. DEVE existir `/precos` que consome o catálogo de planos do spec 19 (BÁSICO/PROFISSIONAL/
   EMPRESARIAL + trial de 14 dias sem cartão) via API pública de provisionamento — **nunca** com
   preços hardcoded no site.
4. DEVEM existir `/sobre`, `/contacto` (formulário com validação Zod + envio server-side, sem
   expor SMTP/segredos ao cliente), `/recursos` (blog), `/termos` e `/privacidade` (RGPD e Lei de
   Protecção de Dados Pessoais de Moçambique).
5. DEVEM existir páginas de estado `not-found.tsx` (404) e `error.tsx`/`global-error.tsx` (500)
   consistentes com o design system do site.

### Requisito 6 — Internacionalização

1. A arquitectura DEVE suportar múltiplos idiomas via `next-intl` (ou equivalente com App Router)
   com routing por prefixo de locale (`/pt`, preparado para `/en`); **PT-PT é o único idioma
   obrigatório na entrega** — as strings `en` podem ficar como stub/TODO.
2. Todo o conteúdo estático, metadata e mensagens de UI DEVEM estar em ficheiros de tradução
   (`apps/site/messages/pt.json`), nunca hardcoded em componentes.

### Requisito 7 — SEO

1. DEVE usar-se a Metadata API do Next.js (`generateMetadata`) por página, com OpenGraph e Twitter
   Card dinâmicos; imagens OG geradas em runtime com `next/og` (`ImageResponse`) a partir do
   título/secção da página.
2. DEVEM existir `sitemap.xml` e `robots.txt` gerados (`app/sitemap.ts`, `app/robots.ts`),
   incluindo rotas MDX estáticas.
3. DEVE existir JSON-LD estruturado (`Organization`, `Product` com os planos do spec 19, `FAQPage`
   na página de preços) injectado via `<script type="application/ld+json">` server-rendered.

### Requisito 8 — Performance e acessibilidade

1. Orçamento de Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms na Home e em `/precos`, medido
   em condições de rede simulada (Lighthouse mobile).
2. Imagens DEVEM usar `next/image` com AVIF/WebP; fontes DEVEM usar `next/font` self-hosted (zero
   pedidos a Google Fonts em runtime).
3. O site DEVE cumprir WCAG 2.2 AA: navegação por teclado completa, foco visível, contraste AA em
   ambos os temas, `prefers-reduced-motion` respeitado (Requisito 3.2); DEVE reutilizar `pnpm
   e2e:a11y` (axe) já existente no repo, apontado às rotas do site.

### Requisito 9 — Analytics privacy-first e ADR

1. DEVE integrar-se analytics sem cookies invasivos (Plausible ou PostHog EU recomendados), com
   banner de consentimento mínimo apenas onde legalmente exigido, e reporte de Web Vitals real
   (`useReportWebVitals`) para o mesmo backend de observabilidade.
2. A decisão de monorepo, a escolha de biblioteca de animação e a escolha de analytics DEVEM ficar
   registadas em ADRs próprios (`docs/decisions/ADR-0006-monorepo-site.md`,
   `ADR-0007-animacao-motion.md`, `ADR-0008-analytics-privacy-first.md`) — sequência iniciada em
   `0006` para resolver a colisão conhecida em `ADR-0005-*`.

### Requisito 10 — Integração com o provisionamento (spec 19)

1. O site NÃO DEVE ter acesso directo à base de dados do ERP nem ao Stripe; DEVE consumir apenas
   uma API pública HTTP servida pela plataforma de onboarding (spec 19): catálogo de planos
   (GET) e criação de pedido de trial/signup (POST).
2. O CTA "Começar teste grátis" e o formulário de `/precos` DEVEM submeter para o endpoint público
   do spec 19 e redireccionar para o domínio de onboarding/app na resposta de sucesso; falhas de
   rede/validação DEVEM degradar para uma mensagem de erro no próprio site, nunca expor stack
   traces do backend de provisionamento.
3. A fronteira DEVE ficar documentada num contrato leve (`docs/handoff/site-provisionamento.md`
   ou equivalente em `docs/decisions/`) descrevendo os endpoints consumidos, formatos de payload e
   quem é dono de cada lado.

## Critérios de Aceitação

1. `pnpm -w build` (raiz do monorepo) e `turbo run build --filter=site` e `--filter=erp` terminam
   sem erros; `apps/erp` mantém `pnpm check`/`pnpm gates`/`pnpm e2e` verdes após a migração.
2. `turbo run lint typecheck test --filter=site` verde; zero cores hardcoded fora de
   `packages/brand`/`@theme` do site (verificável por grep/gate simples).
3. Lighthouse (mobile, `apps/site`) ≥ 95 em Performance, SEO, Best Practices e Acessibilidade nas
   rotas `/`, `/funcionalidades`, `/precos`.
4. `pnpm e2e:a11y` corrido contra as rotas do site DEVE devolver zero violações axe de nível
   crítico/sério.
5. `sitemap.xml`/`robots.txt` acessíveis e válidos; JSON-LD validado (Rich Results Test) para
   `Organization`, `Product` e `FAQPage`.
6. Com `prefers-reduced-motion: reduce` activo, nenhuma animação de entrada bloqueia a leitura do
   conteúdo (teste manual/E2E com a media feature emulada).
7. A página `/precos` renderiza planos vindos da API do spec 19 (mockável em teste) — nenhum
   preço hardcoded no bundle do site.
8. `apps/site` é deployável e revertível independentemente de `apps/erp` (pipeline com
   `--filter=site` isolado; um deploy do site não obriga a `prisma migrate deploy`).
9. Página 404/500 do site renderizam com o design system próprio (não herdam layout do ERP).
10. ADRs de monorepo, animação e analytics existem em `docs/decisions/` com numeração sem colisão.

## Fontes

- Next.js App Router e Metadata API: https://nextjs.org/docs/app e
  https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Geração de imagens OG (`next/og`/`ImageResponse`): https://nextjs.org/docs/app/api-reference/functions/image-response
- `next/font` e `next/image`: https://nextjs.org/docs/app/building-your-application/optimizing/fonts
  e https://nextjs.org/docs/app/building-your-application/optimizing/images
- next-intl (i18n App Router): https://next-intl.dev/
- Motion (motion.dev — sucessor do Framer Motion): https://motion.dev/docs/react
- Turborepo: https://turbo.build/repo/docs
- pnpm workspaces: https://pnpm.io/workspaces
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Core Web Vitals: https://web.dev/articles/vitals
- Tailwind CSS v4 (`@theme`): https://tailwindcss.com/docs/theme
- Plausible Analytics (docs): https://plausible.io/docs
- CLAUDE.md — regras de UI (`@theme`, dark mode, `pnpm e2e:a11y`) e §Integração.
- `docs/status.md`, `docs/decisions/` (numeração de ADRs) — a coordenar pelo orquestrador.
- Cross-referência: `.kiro/specs/19-onboarding-provisionamento` (catálogo de planos, API de
  provisionamento, trial 14 dias).
