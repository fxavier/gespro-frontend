# Handoff — Spec 18: Website de Marketing (`apps/site`)

Agente `feat-website-marketing`, worktree `wt/feat-website-marketing`, branch `ws-18`.
Tarefas 2–11 do `.kiro/specs/18-website-marketing/tasks.md` (a tarefa 1, migração do monorepo,
já vinha mergida na `wave6`).

## Resumo

Site de marketing público em Next.js 16 (App Router, Turbopack), como segunda app do monorepo
(`apps/site`), partilhando **só** tokens de marca com o ERP via `packages/brand`. Onze rotas,
i18n com `next-intl` (PT-PT completo, `en` stub), animação com Motion e movimento reduzido
garantido, SEO completo (metadata + OG dinâmico + JSON-LD + sitemap/robots), analytics
privacy-first, e a fronteira de consumo do spec 19 (catálogo de planos + registo de trial) com
mock local. WCAG 2.2 AA verificado por axe nos dois temas.

## Estado dos gates (comandos exactos e resultado)

| Gate | Comando | Resultado |
|---|---|---|
| Lint + types + testes do site | `pnpm exec turbo run lint typecheck test --filter=site` | ✅ 3/3 tasks, 49 testes |
| Gate de cores hardcoded | `pnpm --filter site gate:cores` | ✅ zero literais fora de `packages/brand`/`@theme` |
| A11y + movimento reduzido | `pnpm --filter site e2e:a11y` → `npx playwright test` | ✅ 32/32 (axe zero críticos/sérios, 11 rotas × 2 temas) |
| Build das duas apps | `pnpm exec turbo run build` | ✅ erp + site |
| Standalone do site arranca | `node apps/site/.next/standalone/apps/site/server.js` | ✅ `/` e `/precos` → 200 |
| ERP sem regressões | `pnpm --filter erp check` · `pnpm gates` | ✅ 952 testes, gates a zero |
| ERP build | `pnpm exec turbo run build` | ✅ verde |

**ERP:** a única alteração no `apps/erp` foi extrair os tokens `:root`/`.dark` do `globals.css`
para `packages/brand/tokens.css` (importado no topo) — o `@theme inline` do ERP ficou intacto.
Confirmado que o build do ERP compila os mesmos valores de cor (grep no CSS: `--primary`,
`--sidebar-ring`, `--success/warning/info`, `--chart-*`, `--shadow-*`, `--radius` todos presentes).
`pnpm check` (952 testes) e `pnpm gates` verdes.

## Ficheiros criados/tocados

### `packages/brand/` (novo)
- `tokens.css` — fonte única dos tokens de marca (`:root`/`.dark`, oklch). Consumido por
  `apps/erp` e `apps/site`.
- `cores.json` — literais de marca para contextos que **não** resolvem CSS custom properties:
  `theme-color` da barra do browser, `next/og`, favicon. Espelham `tokens.css`.
- `logo/*.svg` — símbolo (currentColor) + logótipos claro/escuro.
- `package.json` — exports.

### `apps/erp/` (mínimo)
- `src/app/globals.css` — `@import "@gespro/brand/tokens.css"`, blocos de token duplicados removidos.
- `package.json` — dependência `@gespro/brand`.

### `apps/site/` (novo — o grosso do trabalho)
- **Config:** `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`,
  `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `Dockerfile`,
  `.dockerignore`.
- **i18n:** `src/i18n/{routing,navigation,request}.ts`, `src/middleware.ts`,
  `messages/{pt,en}.json` (PT completo; EN stub que degrada para PT por fusão).
- **Tema/marca:** `src/app/{globals,theme}.css`, `src/components/marketing/{logotipo,tema,tema-sistema}.tsx`.
- **Movimento:** `src/components/marketing/movimento.tsx` (encapsula todo o Motion).
- **Componentes de marketing:** `cabecalho`, `rodape`, `hero`, `painel-produto`, `grelha-modulos`,
  `icone-modulo`, `prova-social`, `conformidade`, `cta-final`, `tabela-precos`, `faq`, `json-ld`,
  `campos`, `formulario-registo`, `formulario-contacto`, `analytics`, `mdx`, `pagina-legal`,
  `primitivos`.
- **Páginas (`src/app/[locale]/(marketing)/`):** `page` (Home), `funcionalidades/`,
  `funcionalidades/[modulo]/`, `precos/`, `comecar/`, `sobre/`, `contacto/`, `recursos/`,
  `recursos/[slug]/`, `termos/`, `privacidade/`, `not-found`, `[...resto]` (catch-all → 404).
- **Estado:** `src/app/layout.tsx` (raiz: `<html>`/fontes/tema), `src/app/[locale]/layout.tsx`
  (provider i18n), `[locale]/error.tsx`, `global-error.tsx`.
- **API/SEO:** `src/app/api/{og,contacto,vitals}/`, `src/app/{sitemap,robots}.ts`.
- **lib:** `env`, `planos`, `content`, `seo`, `validations`, `email`, `rate-limit`, `registo`,
  `analytics`, `modulos`, `provincias`, `cn`.
- **Conteúdo MDX:** `content/blog/*` (2), `content/recursos/*` (2), `content/legal/*` (2).
- **Testes:** `src/lib/__tests__/*` (49), `e2e/site.a11y.ts`, `e2e/reduzido.movimento.ts`.
- **Actions:** `src/actions/registo.ts`.
- **Scripts:** `scripts/gate-cores-hardcoded.mjs`.

### Raiz e docs
- `package.json` — scripts `e2e:a11y` (via turbo), `e2e:a11y:site`, `dev:site`.
- `turbo.json` — env `NEXT_PUBLIC_*` do site, task `gate:cores`.
- `.github/workflows/ci.yml` — job `site` (lint+types+test+gate+build+a11y, isolado do ERP);
  o job `build` do ERP passou a `turbo run build --filter=erp`.
- `docs/decisions/ADR-0007-animacao-motion.md`, `ADR-0008-analytics-privacy-first.md` (ratificados).
- `docs/handoff/site-provisionamento-consumo.md` (lado do consumo; o contrato é o do spec 19).

## Decisões de desenho não-óbvias

1. **`<html>` no layout de raiz, não no `[locale]`.** No Next 16 as fronteiras de 404/erro
   compõem-se só até ao layout de raiz. Com o `<html>` no segmento `[locale]`, o 404 saía num
   invólucro `<html id="__next_error__">` sem `lang`, sem tipo de letra e sem tema — violação
   `html-has-lang` no axe. `lang` é estático `pt-MZ` (único idioma entregue); `[locale]/layout.tsx`
   corrige-o para os locales não-omissos via script pré-pintura.
2. **Token `--texto-suave` próprio, distinto de `--muted-foreground` da marca.** O
   `muted-foreground` do ERP (oklch 0.556) dá 4.5:1 sobre branco mas cai para 4.1–4.5:1 sobre as
   superfícies alternadas do site — abaixo de AA. O site usa 0.48 (claro) / 0.75 (escuro): 6.5:1 /
   8.4:1. Sem alterar a marca do ERP.
3. **Tokens `--accao-texto` e `--gradiente-texto`.** No tema escuro o `--primary` clareia e o
   branco por cima cai para 3.6:1. Botões primários e o gradiente do CTA usam tokens próprios que
   passam AA nos dois temas (quase-preto sobre primário claro no escuro; gradiente fixo).
4. **Analytics desligado por omissão + consentimento condicional.** Sem domínio Plausible
   configurado, nenhum script carrega. Consentimento só quando
   `NEXT_PUBLIC_ANALYTICS_CONSENTIMENTO=obrigatorio` — a config recomendada (sem cookies) não o
   exige, e pedi-lo onde a lei não obriga treina o "aceitar sem ler". Ver ADR-0008.
5. **Provider de email fino, próprio do site.** Não reutiliza `apps/erp/src/server/email/*`
   (arrastaria Prisma/observabilidade para o bundle do site). `noop` em dev/CI, `smtp` opcional.
6. **`server-only` stub em vitest** e `revalidate` literal (`300`) nas páginas ISR (o Next exige
   config de segmento analisável estaticamente; um teste de drift em `planos.test.ts` garante que
   coincide com `REVALIDACAO_PLANOS`).

## Integração com o spec 19 (fronteira)

- **Estado: pronto a ligar, a correr em mock.** `lib/planos.ts` chama `GET /api/publico/planos`
  com ISR e degrada para catálogo de demonstração (`origem: "demonstracao"`, aviso visível em
  `/precos`) enquanto o endpoint não existir. `lib/registo.ts` + `actions/registo.ts` submetem
  `POST /api/publico/registo` com `Idempotency-Key` e redireccionam para
  `${APP_URL}/auth/registo-callback?token=`. Zero preços hardcoded (verificado por teste e gate).
- **O spec 19 precisa de, antes do deploy conjunto:** pôr os dois endpoints em `PUBLIC_PATHS`;
  pôr a origem do site em `ALLOWED_ORIGINS`; ter `/auth/registo-callback?token=` a tratar token
  expirado/reutilizado. Detalhe em `docs/handoff/site-provisionamento-consumo.md`.
- **Divergência conhecida:** `captchaToken` é enviado vazio — o provedor de captcha ainda não foi
  fixado pelo spec 19. Ligar é passar o argumento a `paraPayloadRegisto`. Entretanto: campo-
  armadilha + rate-limit do site + rate-limit do spec 19.

## Gaps explícitos (não simulados)

1. **Lighthouse (tarefa 9.3) — NÃO corrido.** Não há browser headless dedicado neste ambiente.
   A base para ≥95 está construída (SSG/ISR, `next/font` self-hosted sem pedidos ao Google,
   `next/image` AVIF/WebP, OG por `next/og`, JSON-LD, sitemap/robots, axe a zero críticos/sérios,
   sem cores hardcoded). **Recomendação:** adicionar `treosh/lighthouse-ci-action` ao job `site`
   do CI apontado a `/`, `/funcionalidades`, `/precos`.
2. **Deploy real (tarefa 11.2) — NÃO feito.** O `Dockerfile` do site existe e o output standalone
   foi verificado localmente (`/` e `/precos` → 200). A escolha entre App Runner standalone e
   CDN+ISR e o Terraform concreto pertencem à execução de infra (spec 16). **Decisão recomendada
   em design.md:** CDN (CloudFront+S3) com origem Node mínima para as rotas ISR — desacopla
   totalmente do App Runner/RDS do ERP.
3. **`en` (inglês) — stub.** Só as chaves de navegação estão traduzidas; o resto degrada para
   PT-PT por fusão em `i18n/request.ts`. `/en` está fora do índice (`robots.ts`, sitemap só PT).
   Requisito 6.1 cumprido (só PT-PT é obrigatório).
4. **Testemunhos da prova social** são atribuídos por função/sector, não por pessoa nomeada —
   o que se pode afirmar honestamente antes de haver autorizações de citação. Substituir por
   reais quando existirem.

## Como correr localmente

```bash
CI=true pnpm install --no-frozen-lockfile          # a partir da raiz do worktree
pnpm --filter site dev                             # http://localhost:3100
pnpm exec turbo run lint typecheck test --filter=site
pnpm --filter site gate:cores
pnpm --filter site e2e:a11y                         # precisa de `npx playwright install chromium`
```
