# Execução Paralela — Specs 18–19 (Website + Onboarding)

Plano para executar os specs 18 (site de marketing) e 19 (onboarding/provisionamento) com
agentes `feat-*` em paralelo, coordenados pelo `orchestrator`. Mantém as regras do programa:
**um worktree por agente**, migrations geradas **só** pelo orquestrador, merge só após parecer
do `code-reviewer`.

Pré-requisito: **Wave 5 (specs 10–17) mergida** na branch de integração — em particular
13 (notificações/email), 16 (secrets/deploy) e 17 (rate-limit/CORS), de que o spec 19 depende.

## Agentes e worktrees

| Agente | Spec | Worktree | Modelo | Skills |
|---|---|---|---|---|
| `feat-website-marketing` | 18 | `wt/feat-website-marketing` | claude-sonnet-4-6 | ui-conventions, engineering:architecture, engineering:system-design, dataviz |
| `feat-onboarding-provisionamento` | 19 | `wt/feat-onboarding-provisionamento` | claude-sonnet-4-6 | prisma-conventions, api-conventions, ui-conventions, engineering:architecture |

Sub-tarefas dentro de cada spec (páginas, componentes, endpoints) são paralelizáveis pelo
respectivo agente com a Task tool; a fronteira entre os dois agentes é o contrato de dois
endpoints (ver abaixo).

## Dependência estrutural — a migração do monorepo primeiro

O spec 18 converte o repositório de app-única em monorepo (`apps/erp` + `apps/site`). Esta
migração (**18 §1**) é **mecânica, de baixo risco e bloqueante** para tudo o resto (o spec 19
passa a viver em `apps/erp/`). Ordem obrigatória:

1. `feat-website-marketing` executa **só a fase 1** (monorepo), com `pnpm check`/`pnpm gates`/
   `pnpm e2e` do ERP verdes a partir da raiz; o orquestrador **mergeia esta fase isolada**.
2. Só depois os dois agentes continuam em paralelo sobre a estrutura de monorepo já mergida.

Se a migração de monorepo não for aceite antes, o spec 19 e o resto do 18 arrancam na estrutura
antiga e o orquestrador reconcilia os caminhos no merge — mais caro; preferir a ordem acima.

## Mapa de conflitos (ficheiros partilhados)

O paralelismo é real, mas há pontos tocados por mais do que um agente. O orquestrador é o
**único** a fazer merge e a resolver estes pontos:

- **Estrutura de raiz** (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `Dockerfile`,
  `.github/workflows/ci.yml`) — **só 18** (migração monorepo + job `site`). O 19 assume a
  estrutura já migrada. Merge 18(§1) → resto.
- `prisma/schema/plataforma.prisma` — **só 19** (`Assinatura`, `EventoWebhookStripe`,
  `TokenHandoff`, `TokenVerificacaoEmail` + enums `EstadoAssinatura`/`CicloFaturacao`).
  Choca com o 13 (Notificacao) da Wave 5 **apenas se 13 não estiver mergido** — daí o
  pré-requisito. Merge de schema de plataforma: 13 → 19.
- `prisma/schema/tenant.prisma` — **só 19** (`Tenant.assinatura Assinatura?`). Aditivo.
- `middleware.ts` (`PUBLIC_PATHS`) — **só 19** acrescenta `/api/publico/registo`,
  `/api/publico/planos`, `/api/publico/verificar-email`, `/api/webhooks/stripe`,
  `/auth/registo-callback`. Coordenar com o 17 (dono dos headers de segurança): merge 17 → 19.
- `next.config.ts` do ERP (`ALLOWED_ORIGINS`) — **só 19** adiciona a origem do site; o 17 é
  dono do bloco CORS/CSP. Merge 17 → 19.
- `src/lib/state-machines.ts` — **só 19** (`TRANSICOES_ASSINATURA`, `bloqueiaAcesso`). Aditivo.
- `src/components/patterns/status-badge.tsx` — **só 19** (estados de `EstadoAssinatura`). Aditivo.
- `prisma/seed/rbac.ts` — **só 19** (`assinatura:gerir`). Aditivo (concatenação).
- `.env.example` — **só 19** (`STRIPE_*`, `HANDOFF_SIGNING_SECRET`, captcha). Aditivo.
- `docs/decisions/` — ADRs já atribuídos (sequência iniciada em `0006` para resolver a colisão
  conhecida em `ADR-0005-*`): 18 → `ADR-0006-monorepo-site`, `ADR-0007-animacao-motion`,
  `ADR-0008-analytics-privacy-first`; 19 → `ADR-0009-moeda-faturacao-saas`. Ficheiros distintos,
  sem sobreposição; o orquestrador só confirma que nenhum novo ADR reintroduz colisão.
- `docs/handoff/site-provisionamento.md` — contrato dos dois endpoints públicos; **18 documenta
  o consumo, 19 é dono do contrato**. O orquestrador garante que a versão de 19 prevalece.

O `apps/site` (todo o código do site) e os serviços/handlers do spec 19 em `apps/erp/src/**`
não se sobrepõem — é a fronteira limpa que permite o paralelismo.

## Contrato de fronteira (18 ⇄ 19) — congelar antes de arrancar

Para os dois agentes trabalharem em paralelo sem bloquear, o orquestrador fixa este contrato
**antes** do arranque (o site usa um mock local até 19 o servir):

```
GET /api/publico/planos
  → 200 { planos: [{ id: 'BASICO'|'PROFISSIONAL'|'EMPRESARIAL', nome, limites,
                     precoMensal:{valor,moeda}, precoAnual:{valor,moeda} }] }

POST /api/publico/registo        (headers: Idempotency-Key obrigatório)
  body { empresa:{nome,nuit}, admin:{nome,email,senha}, planoId, provincia, captchaToken }
  → 201 { tenantSlug, handoffToken }        # token opaco para o site: relaia, não inspecciona
  → 4xx { traceId, erro }                    # sem stack; o site mostra mensagem amigável

Redirect: ${APP_URL}/auth/registo-callback?token=<handoffToken>
```

Regras: preços só do endpoint (o site nunca hardcoda); o site nunca lê os claims do token;
a origem do site tem de constar em `ALLOWED_ORIGINS` antes do deploy do 19.

## Ordem de merge (determinística)

```
18 §1 ─ monorepo (apps/erp + apps/site, turbo, packages/*)   → merge PRIMEIRO, isolado
                                                              │
18 (resto) ─ site de marketing (apps/site/**)                ┤ paralelo, mock do catálogo
19 ─ onboarding/provisionamento (apps/erp/src/**, schema)    ┘ paralelo, depois de 13/16/17
                                                              │
(orquestrador) regenera migration 19xx_onboarding após merge de 19; corre pnpm check na integração
```

## Gate por agente (antes do merge)

1. `pnpm check` verde no worktree (`prisma validate && tsc --noEmit && eslint . && vitest run`);
   para 18, `turbo run lint typecheck test --filter=site` verde e `apps/erp` sem regressões.
2. `pnpm gates` verde (Dialog fora de AlertDialog = 0; `'use client'` em `page.tsx` de
   listagem/detalhe = 0; imports `@/data` = 0). **Nota:** a regra "sem modais" e os gates de
   `page.tsx` aplicam-se ao `apps/erp` (spec 19), **não** ao `apps/site` (marketing).
3. Cobertura de serviços ≥80% no código novo (spec 19: provisionamento, assinatura, handoff, webhook).
4. `pnpm build` verde em ambas as apps (18: `apps/site`; 19: `apps/erp` com `Suspense` no
   `useSearchParams` do callback de handoff).
5. Parecer do `code-reviewer` sem BLOCKERs. Foco:
   - **19:** `prismaBase` (nunca `prisma` tenant-scoped) no registo e no webhook; `tenantId`
     explícito em toda a escrita; transacção atómica de provisionamento; idempotência
     (`Idempotency-Key`, `stripeEventId`); verificação de assinatura do webhook; consumo atómico
     do `jti`/tokens; segredos fora do repo; `Decimal`↔cêntimos só na fronteira Stripe.
   - **18:** zero cores hardcoded fora de `packages/brand`/`@theme`; `prefers-reduced-motion`;
     WCAG 2.2 AA (axe); sem preços hardcoded; deploy do site independente do `prisma migrate deploy`.
6. `qa-e2e`: 18 — smoke das rotas públicas + `pnpm e2e:a11y` no site + Lighthouse ≥95;
   19 — smoke em Stripe test mode (registo→trial→login; checkout→ATIVA; cancelar→CANCELADA bloqueia).

## Arranque (a partir da raiz do repo)

```bash
claude
> Usa o agente orchestrator: lê docs/status.md, .kiro/specs/18-website-marketing-visao-geral.md
  e docs/handoff/execucao-paralela-18-19.md. Congela o contrato de fronteira 18⇄19, cria os
  worktrees wt/feat-website-marketing e wt/feat-onboarding-provisionamento, e lança os 2 agentes
  feat-* em paralelo com o tasks.md de cada spec. Mergeia a fase 1 (monorepo) do spec 18 isolada
  e primeiro; gera migrations só tu; pede revisão ao code-reviewer antes de cada merge.
```

O orquestrador delega com a Task tool, passando a cada agente: (1) o `tasks.md` do seu spec,
(2) este handoff (contrato de fronteira + mapa de conflitos + ordem de merge), (3) o worktree,
(4) as skills a invocar.
