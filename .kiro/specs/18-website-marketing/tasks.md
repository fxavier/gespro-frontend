# Plano de Implementação: Website de Marketing — Monorepo `apps/site`

Worktree `wt/feat-website-marketing`. Skills: `ui-conventions`, `engineering:architecture`,
`engineering:system-design`, `dataviz`. Depende de: spec 19 (`19-onboarding-provisionamento`) para
o catálogo de planos e o endpoint de trial — pode arrancar em paralelo usando *mock* local até o
contrato do spec 19 estar disponível. Migração do monorepo é pré-requisito interno das restantes
tarefas e deve ser a primeira a mergear (baixo risco, mecânica).

- [ ] 1. Monorepo — migração mecânica
  - [ ] 1.1 `pnpm-workspace.yaml`, mover app actual para `apps/erp` (aliases, `next.config.ts`,
        `Dockerfile`/`.dockerignore` context, scripts do `package.json` raiz)
  - [ ] 1.2 `turbo.json` (pipeline build/lint/typecheck/test, cache de `outputs`)
  - [ ] 1.3 `packages/tsconfig` e `packages/eslint-config`; `apps/erp` a consumi-los
  - [ ] 1.4 Confirmar `pnpm check`/`pnpm gates`/`pnpm e2e` do ERP verdes a partir da raiz do monorepo
  - [ ] 1.5 ADR `docs/decisions/ADR-0006-monorepo-site.md` (monorepo vs. route group único)

- [ ] 2. `packages/brand` e scaffold de `apps/site`
  - [ ] 2.1 `packages/brand/tokens.css` + assets de logótipo (claro/escuro)
  - [ ] 2.2 Scaffold `apps/site` (Next.js 16 App Router, Tailwind 4, `@theme` próprio estendendo
        `packages/brand`, dark mode)
  - [ ] 2.3 `next-intl` configurado (routing por locale, `messages/pt.json` completo,
        `messages/en.json` com chaves placeholder)

- [ ] 3. Design system e animação do site
  - [ ] 3.1 Instalar `motion` (`motion/react`); variantes base com `useReducedMotion()`
  - [ ] 3.2 Componentes `components/marketing/*` (hero, feature-grid por módulo do ERP,
        prova social, pricing-table, FAQ, footer/nav)
  - [ ] 3.3 Avaliação/POC da View Transitions API entre `/funcionalidades/[modulo]` com fallback

- [ ] 4. Camada de conteúdo MDX
  - [ ] 4.1 `lib/content.ts` (loader + schema Zod de frontmatter) e conteúdo inicial em
        `content/{blog,recursos}/*.mdx`
  - [ ] 4.2 `/recursos` (lista) e `/recursos/[slug]` (detalhe) com `generateStaticParams`

- [ ] 5. Páginas
  - [ ] 5.1 Home (`/`): hero, prova social, secção por domínio (vendas/stock/compras/finanças/
        RH/operações/POS), secção PGC-NIRF/NUIT/BI, CTA final
  - [ ] 5.2 `/funcionalidades` + `/funcionalidades/[modulo]`
  - [ ] 5.3 `/precos` consumindo `lib/planos.ts` (mock local se spec 19 ainda não expõe o endpoint)
  - [ ] 5.4 `/sobre`, `/contacto` (Route Handler `api/contacto`), `/termos`, `/privacidade`
  - [ ] 5.5 `not-found.tsx`, `error.tsx`, `global-error.tsx`

- [ ] 6. SEO
  - [ ] 6.1 `generateMetadata` por rota + `app/api/og/route.tsx` (`ImageResponse`)
  - [ ] 6.2 `app/sitemap.ts`, `app/robots.ts`
  - [ ] 6.3 JSON-LD (`Organization`, `Product` por plano, `FAQPage`)

- [ ] 7. Analytics e observabilidade
  - [ ] 7.1 Integração Plausible/PostHog EU (sem cookies invasivos) + banner de consentimento mínimo
  - [ ] 7.2 `useReportWebVitals` a reportar para o mesmo backend
  - [ ] 7.3 ADR `docs/decisions/ADR-0008-analytics-privacy-first.md` e
        `docs/decisions/ADR-0007-animacao-motion.md`

- [ ] 8. Integração com spec 19
  - [ ] 8.1 `lib/planos.ts` (fetch server-side ao catálogo público, ISR `revalidate`)
  - [ ] 8.2 CTA "Começar teste grátis" → `POST /api/publico/registo` do spec 19 (com `Idempotency-Key`), redireccionar para `/auth/registo-callback?token=...`
  - [ ] 8.3 `docs/handoff/site-provisionamento.md` (contrato consumido, payloads, dono de cada lado)

- [ ] 9. Testes e gates
  - [ ] 9.1 `turbo run lint typecheck test --filter=site` verde
  - [ ] 9.2 `pnpm e2e:a11y` estendido às rotas do site (axe, zero violações críticas/sérias)
  - [ ] 9.3 Lighthouse (mobile) ≥ 95 em Performance/SEO/Best Practices/A11y em `/`, `/funcionalidades`, `/precos`
  - [ ] 9.4 Teste manual/E2E com `prefers-reduced-motion: reduce` emulado

- [ ] 10. Deploy
  - [ ] 10.1 Job `site` em `.github/workflows/ci.yml` (`--filter=site`, independente do ERP)
  - [ ] 10.2 Escolher e implementar a via de hosting (App Runner standalone ou CDN CloudFront+S3
        com ISR conforme avaliação em design.md), sem depender de `prisma migrate deploy`

- [ ] 11. Verificação final
  - [ ] 11.1 `pnpm -w build` na raiz e `turbo run build --filter=erp --filter=site` sem erros
  - [ ] 11.2 Deploy de smoke de `apps/site` isolado (sem tocar `apps/erp`) e rollback testado
  - [ ] 11.3 Handoff `docs/handoff/feat-18-website-marketing.md` (ficheiros tocados, decisões,
        estado da integração com o spec 19, gaps conhecidos)
