# Prompt — Executar a Wave 6 (specs 18–19) em paralelo

> Cola o bloco abaixo no Claude Code, a partir da raiz do repositório `gespro/`.
> Põe o Claude Code a agir como orquestrador, a lançar os 2 agentes `feat-*` da Wave 6 em
> paralelo (um worktree cada), cada um a invocar as suas skills. Pré-requisito: **Wave 5
> (10–17) mergida** — em especial 13 (notificações/email), 16 (secrets/deploy) e 17
> (rate-limit/CORS), de que o spec 19 depende.

---

```text
Age como o agente `orchestrator` do GestPro. Objetivo: executar a Wave 6 — implementar os
specs 18 (Website de Marketing, monorepo `apps/site`) e 19 (Onboarding, Provisionamento de
Tenants e Faturação por Subscrição Stripe) — com 2 agentes `feat-*` em paralelo, em worktrees
separados, respeitando as regras invioláveis do CLAUDE.md.

## PRÉ-REQUISITO
Confirma que a Wave 5 (specs 10–17) está mergida na branch de integração — sobretudo 13
(Notificacao/EmailProvider), 16 (Secrets Manager/deploy) e 17 (rate-limit, CORS allowlist,
headers de segurança). Se não estiver, mergeia a Wave 5 primeiro (ver docs/prompt-wave5-claude-code.md).

## FONTES DE VERDADE (lê primeiro)
- `.kiro/specs/18-website-marketing-visao-geral.md` — visão geral das specs 18–19 e a fronteira 18⇄19.
- `docs/handoff/execucao-paralela-18-19.md` — mapa de conflitos, ordem de merge, gate por agente.
- `docs/handoff/site-provisionamento.md` — contrato CONGELADO dos endpoints públicos (18 consome, 19 é dono).
- `.kiro/specs/18-website-marketing/tasks.md` e `.kiro/specs/19-onboarding-provisionamento/tasks.md` — o plano de cada spec.
- `docs/decisions/ADR-0006..0009` — monorepo, animação (Motion), analytics, moeda de faturação (USD/Stripe).
- `CLAUDE.md` e `.claude/skills/*` — convenções normativas.

## REGRA DE ORDEM (não negociável)
A fase 1 do spec 18 é a **migração para monorepo** (pnpm-workspaces + Turborepo: o ERP actual passa
a `apps/erp`, cria-se `apps/site` e `packages/{brand,tsconfig,eslint-config}`). É **mecânica, de baixo
risco e BLOQUEANTE**: tem de ser feita, verificada e MERGIDA PRIMEIRO E ISOLADA, antes de o spec 19 e o
resto do 18 continuarem (o spec 19 passa a viver em `apps/erp/`). Não lances os dois agentes na feature
antes de o monorepo estar mergido.

## SETUP (worktrees — isolamento para paralelismo real)
Cria uma branch de integração `wave6` e um worktree por agente:
  git switch -c wave6
  git worktree add wt/feat-website-marketing          -b ws-18
  git worktree add wt/feat-onboarding-provisionamento -b ws-19

## FASE 0 — MONOREPO (isolada, primeiro)
Lança SÓ o agente `feat-website-marketing` para executar a fase 1 do `18/tasks.md` (monorepo):
`pnpm-workspace.yaml`, `turbo.json`, mover o ERP para `apps/erp`, `packages/tsconfig` e
`packages/eslint-config`, e o ADR-0006. Gate: `pnpm check`/`pnpm gates`/`pnpm e2e` do ERP verdes a
partir da raiz do monorepo (ou `--filter=erp`), sem regressão funcional. Pede parecer ao
`code-reviewer` e **mergeia esta fase isolada** na `wave6` antes de continuar.

## FASE A — FEATURES EM PARALELO (Task tool, as duas chamadas na MESMA mensagem)
Sobre a estrutura de monorepo já mergida, lança em paralelo:
  - feat-website-marketing (18): resto do `18/tasks.md` (marca, design system + Motion, páginas,
    MDX, i18n PT-PT, SEO/OG/JSON-LD, a11y/CWV, analytics, deploy). Enquanto 19 não expõe
    `GET /api/publico/planos`, usa um MOCK local do catálogo (tarefa 8.1) com aviso `TODO spec 19`.
  - feat-onboarding-provisionamento (19): `19/tasks.md` (schema Assinatura/tokens, catálogo de planos,
    máquina de estados, Stripe Checkout/Portal/webhooks idempotentes, registo público atómico,
    handoff SSO, segurança, observabilidade).
A cada subagente passa: (1) o `tasks.md` do seu spec, (2) o worktree (caminho absoluto), (3) o
`docs/handoff/execucao-paralela-18-19.md` (mapa de conflitos + contrato de fronteira), (4) as skills.
CONGELA e comunica o contrato de fronteira ANTES do arranque (site consome, 19 é dono):
  GET /api/publico/planos → { planos:[{id,nome,limites,precoMensal,precoAnual}] }
  POST /api/publico/registo (header Idempotency-Key) → 201 { tenantSlug, handoffToken }
  Redirect: ${APP_URL}/auth/registo-callback?token=<handoffToken>   (site relaia o token, não lê claims)
Exige que cada agente termine com os gates verdes no seu worktree e um resumo CURTO (ficheiros,
decisões, gaps).

## SKILLS POR AGENTE
- feat-website-marketing (18): `ui-conventions`, `engineering:architecture`, `engineering:system-design`, `dataviz`.
- feat-onboarding-provisionamento (19): `prisma-conventions`, `api-conventions`, `ui-conventions`, `engineering:architecture`.

## MIGRATIONS E MERGE (só tu, ordem determinística)
Os agentes NUNCA correm `prisma migrate` nem fazem merge. Só editam `prisma/schema/*.prisma`.
Ordem: FASE 0 (monorepo) → 18 (resto) e 19 em paralelo → merge 19 depois de 18(§1).
Só o spec 19 toca `prisma/schema/plataforma.prisma` (Assinatura, EventoWebhookStripe, TokenHandoff,
TokenVerificacaoEmail + enums), `prisma/schema/tenant.prisma` (Tenant.assinatura), `middleware.ts`
(PUBLIC_PATHS: /api/publico/registo, /api/publico/planos, /api/publico/verificar-email,
/api/webhooks/stripe, /auth/registo-callback), `next.config.ts` (ALLOWED_ORIGINS + origem do site),
`src/lib/state-machines.ts`, `patterns/status-badge.tsx`, `prisma/seed/rbac.ts` (assinatura:gerir) e
`.env.example` (STRIPE_*, HANDOFF_SIGNING_SECRET, captcha). O spec 18 é dono de tudo em `apps/site/**`,
`packages/**` e da estrutura de raiz do monorepo. Coordena com 17 os headers/CORS (merge 17 → 19).
Após o merge de 19, regenera a migration `19xx_onboarding_provisionamento` (só tu) e corre `pnpm check`
na `wave6`. Pede revisão ao `code-reviewer` antes de cada merge; merge só sem BLOCKERs.

## GATE POR AGENTE (antes do merge)
- 18: `turbo run lint typecheck test --filter=site` verde; `apps/erp` sem regressões
  (`pnpm check`/`pnpm gates`/`pnpm e2e`); `pnpm e2e:a11y` no site (zero violações axe críticas/sérias);
  Lighthouse mobile ≥95 em Perf/SEO/Best-Practices/A11y em `/`, `/funcionalidades`, `/precos`;
  zero cores hardcoded fora de `packages/brand`/`@theme`; sem preços hardcoded; deploy do site
  independente de `prisma migrate deploy`.
- 19: `pnpm check`/`pnpm gates` verdes; `pnpm build` verde (rotas públicas + Suspense no
  useSearchParams do callback de handoff); cobertura ≥80% no código novo. Foco do code-reviewer:
  `prismaBase` (nunca `prisma` tenant-scoped) no registo e no webhook; `tenantId` explícito em toda a
  escrita; provisionamento atómico (falha → rollback total); idempotência (Idempotency-Key + stripeEventId);
  verificação de assinatura do webhook; consumo atómico do jti/tokens; segredos fora do repo;
  Decimal↔cêntimos só na fronteira Stripe. Nota: a regra "sem modais" e os gates de page.tsx aplicam-se ao
  `apps/erp` (19), NÃO ao `apps/site` (18).

## FECHO
- Após ambos mergidos: `qa-e2e` do fluxo ponta-a-ponta em Stripe test mode
  (registo → tenant em trial → login via handoff → iniciarCheckout → webhook checkout.session.completed
  → ATIVA → abrirPortalCliente → cancelar → customer.subscription.deleted → CANCELADA bloqueia login) e
  smoke das rotas públicas do site.
- Confirma o ADR-0009 (moeda de faturação SaaS) ratificado antes de configurar Prices reais no Stripe.
- Atualiza `docs/status.md` com o estado da Wave 6 (tabela: spec, estado, bloqueios).
- Reporta no fim: resumo por spec e resultado dos gates.

Começa por: (1) confirmar a Wave 5 mergida; (2) ler a visão geral, o handoff e os dois tasks.md;
(3) criar a branch wave6 e os worktrees; (4) executar a FASE 0 (monorepo) isolada e mergeá-la;
(5) só depois lançar a FASE A (18 + 19) em paralelo.
```

---

## Notas de uso

- **Ordem obrigatória**: a migração para monorepo (FASE 0) merge primeiro e isolada; sem isso, o
  spec 19 e o resto do 18 assentam numa estrutura que ainda vai mudar de sítio.
- **Paralelismo real** exige os worktrees: o spec 18 mexe na estrutura de raiz e em `apps/site`/`packages`;
  o spec 19 mexe em `apps/erp/src/**` e no schema de plataforma. A fronteira é limpa (o único acoplamento
  é o contrato de dois endpoints), por isso os dois agentes correm bem em paralelo depois da FASE 0.
- **Fronteira 18⇄19 congelada**: o site consome `GET /api/publico/planos` (fonte única de preços) e
  `POST /api/publico/registo`; relaia o `handoffToken` sem o inspeccionar. Contrato completo em
  `docs/handoff/site-provisionamento.md`.
- **Variante mais barata / sem monorepo**: se preferires não migrar já para monorepo, corre só o spec 19
  na app actual e adia o spec 18 — mas revê o ADR-0006 antes (o site como route group `(marketing)` é a
  alternativa aí documentada).
- **Skills**: cada `feat-*` invoca as skills listadas acima (e no seu ficheiro `.claude/agents/feat-*.md`,
  se criado). ADRs 0006–0009 são a fonte normativa das escolhas de arquitectura da Wave 6.
