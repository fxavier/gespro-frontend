# Estado do Programa de Modernização — GestPro ERP

## ✅ Wave 6 — Website de Marketing + Onboarding (specs 18–19) COMPLETA (2026-07-23)
2 agentes `feat-*` em paralelo (1 worktree cada). Repositório convertido em **monorepo pnpm + Turborepo**: ERP em `apps/erp/`, site de marketing em `apps/site/`, config partilhada em `packages/{tsconfig,eslint-config}`, tokens de marca em `packages/brand`. Ordem de merge determinística: **18 §1 (monorepo) isolado primeiro → 19 (onboarding) → 18 (resto, site)**. `pnpm check` verde (**1148 testes**, de 952 na Wave 5), `pnpm gates` verde, **build das 2 apps verde** (`turbo run build`), migration `1900` aplicada, seed completo.

| Spec | Estado | Migration | Notas de gate |
|---|---|---|---|
| 18 §1 monorepo | ✅ mergido | — | mecânico; ERP move-se para `apps/erp/` via `git mv`; scripts da raiz delegam em `pnpm --filter erp`/`turbo run`. **Fix de ambiente:** sem `.npmrc` com `public-hoist-pattern[]=@types/*`, pacotes em `.pnpm/` resolviam `@types/react` **fora do repo** → `tsc` com React duplicado (`unique symbol` em `key`). `.env` movido de raiz → `apps/erp/.env` (dotenv carrega do cwd da app). `pnpm install` exige `CI=true` (aborta sem TTY) |
| 19 onboarding/provisionamento | ✅ mergido | `1900` (Assinatura FK escalar + EventoWebhookStripe/TokenHandoff/TokenVerificacaoEmail/ChaveIdempotencia + enums EstadoAssinatura/CicloFaturacao + `User.emailVerificado`) | REJEITADO (2 BLOCKER + 9 MAJOR) → corrigido → APROVADO. BLOCKERs: (1) transição de assinatura em check-then-act — 2 webhooks Stripe concorrentes podiam deixar tenant pago em SUSPENSA → **compare-and-set** (`estado: actual` no `where`, `count!==1`→transição perdida); (2) evento sem tenant resolvido marcado como processado e 200 → Stripe deixava de reentregar → **não grava + 503/Retry-After** para eventos de faturação não resolvidos, e persiste `stripeCustomerId` antes de `subscriptions.create()` |
| 18 site de marketing | ✅ mergido | — | APROVADO (revisão dirigida: sem preços hardcoded, `Idempotency-Key` presente, site relaia `handoffToken` sem inspeccionar claims; relocação de tokens ERP→`packages/brand` value-idêntica). a11y **32/32** WCAG 2.2 AA (11 rotas × 2 temas + movimento reduzido); site lint/typecheck/test 49 testes verdes |

**Conflito de merge:** só `pnpm-lock.yaml` (18↔19) — regenerado com `CI=true pnpm install --no-frozen-lockfile`. ADRs 0006 (monorepo) já no repo; 0007 (Motion), 0008 (analytics privacy-first), 0009 (moeda faturação SaaS) entregues. `stripe@^22` adicionado ao ERP.

**Gaps herdados (follow-up, documentados nos handoffs `feat-1{8,9}-*.md`):** (1) rate-limiter em memória por processo (spec 17) — precisa de Redis antes de abrir o registo público; (2) smoke real contra a API Stripe test-mode não corrido (sem `sk_test_` no ambiente) — chamadas de saída só cobertas com SDK mockado, e os 6 `Price` USD têm de ser criados no Dashboard; (3) fiscalidade MZ da própria subscrição por validar (ADR-0009) — bloqueante antes de produção; (4) Lighthouse ≥95 e deploy real do site não corridos no ambiente (base construída: SSG/ISR, fontes self-hosted, AVIF/WebP, axe verde); (5) locale `en` é stub que degrada para PT-PT (Req 6.1); (6) 6 menores da revisão do 19 em `docs/handoff/feat-19-onboarding.md` §5c (campo `erro` do webhook nunca escrito, cron sem `withApi`, `handoffToken` em claro na `ChaveIdempotencia`, login ambíguo cross-tenant com mesmo email). O provedor de captcha ainda não foi fixado — `captchaToken` vai vazio, mitigado por campo-armadilha + rate-limit dos dois lados.

## ✅ Wave 5 — Funcionalidades + produção (specs 10–17) COMPLETA (2026-07-21)
8 agentes `feat-*` em paralelo (1 worktree cada), merge determinístico e migrations só pelo orquestrador. `pnpm check` verde (**952 testes**, de 767 na Wave 4), `pnpm gates` verde, **build de produção verde** (`output: standalone`), seed completo, **smoke autenticado das 20 páginas novas + exports CSV/XLSX** OK.

| Spec | Estado | Migration | Notas de gate |
|---|---|---|---|
| 10 vendas — encomendas/devoluções/trocas/vendedores | ✅ mergido | `1000` (Encomenda/Devolucao/Troca/Vendedor + enum ENCOMENDA/NOTA_DEVOLUCAO) | REJEITADO 2× (3 BLOCKERs transaccionais: caixa dessincronizada, stock não decrementado, devolução sem NC; depois typecheck vermelho no enum de stock)→corrigido→APROVADO |
| 11 projetos — cronograma/riscos/qualidade/comunicações | ✅ mergido | `1100` (RiscoProjeto/RegistoQualidade/ComunicacaoProjeto/ConfiguracaoProjeto) | APROVADO; 5 findings de UI fechados (badge de tipo, contraste, cores hardcoded→tokens, handoff) |
| 12 relatórios/documentos/exportação | ✅ mergido | — (sem schema; `@react-pdf/renderer`) | APROVADO; PDF fiscal reflecte documento emitido, export CSV/XLSX Decimal-lossless; 2 MAJOR fechados; shim de tipos removido pós-install |
| 13 notificações & email | ✅ mergido | `1300` (Notificacao/PreferenciaNotificacao; `nodemailer`) | REJEITADO 2× (BLOCKER cross-tenant no destinatário; depois tsc no filtro do cron)→corrigido→APROVADO |
| 14 observabilidade & operações | ✅ mergido | — (`pino`/OTel/`prom-client`) | APROVADO; envelopes sem quebra de contrato, ALS de requestId separado, health/ready/metrics; MAJOR wiring de métricas fechado |
| 15 CI/CD & testes | ✅ mergido | — (`.github/**`, `testcontainers`) | REJEITADO (4 BLOCKERs de pipeline: cobertura 3× real, skip mascara falha em CI, NODE_ENV parte build, lockfile)→corrigido→APROVADO |
| 16 infraestrutura & deploy | ✅ mergido | — (`Dockerfile`, `infra/**` Terraform) | APROVADO; App Runner + RDS + Secrets Manager; 4 MAJOR de IaC fechados (NAT, Performance Insights, secrets individuais, lock files); zero segredos no repo |
| 17 segurança & hardening | ✅ mergido | — (`middleware.ts`, headers `next.config.ts`) | APROVADO; CORS wildcard removido, CSP(nonce)/HSTS/frame/nosniff, rate-limit alargado, revisão multi-tenant sem BLOCKERs; Aviso 1 (headers importáveis) fechado |

Ordem de merge: 10 → 11 → 13 → 12 → 14 → 17 → 15 → 16. Conflitos aditivos resolvidos pelo orquestrador (`state-machines.ts`, `status-badge.tsx`, `pessoas-projetos.prisma`, `.gitignore`, `next.config.ts`); `health/route.ts` (14 vs 16) resolvido pela versão do 14 (withApi público) com `version`+`Cache-Control` do 16. Deps consolidadas num único `pnpm install`/lockfile por merge.

**2 bugs de integração apanhados no smoke (não visíveis no `pnpm check`):** (1) `/auth/login` sem Suspense boundary para `useSearchParams` partia o build de produção (`output: standalone`) → envolto em Suspense; (2) o middleware do 17 redirigia `/api/health,/ready,/metrics` para login → isentos nos PUBLIC_PATHS (probes precisam de 200 sem sessão).

**qa-e2e (Playwright, 5 fluxos críticos contra build de produção): 27/28 verdes.** Login, caixa, POS, faturação e 3/4 de requisições passam com os envelopes de observabilidade/segurança da Wave 5 intactos. **1 falha pré-existente (NÃO regressão da Wave 5):** `02-requisicao` "criar requisição" — navegação client-side para `/compras/requisicoes/novo` mostra a listagem em vez do formulário, porque o interceptor de parallel route `@panel/(.)[id]` captura o segmento literal `novo` (valor válido para `[id]`), ativando modo de interceção que preserva o `children` na lista. Origem: commit base `6adef31` (golden standard, 16 Jul), anterior à Wave 4/5; só se manifesta em build de produção (acesso directo ao URL funciona). **Recomendação ao owner** (fora do âmbito 04–17, por isso não alterado): mudar o interceptor `(.)[id]` para não colidir com rotas estáticas irmãs (`novo`), ou tornar o painel resiliente a `notFound()` (devolver `null` em vez de propagar o 404 ao slot). **Dívida herdada dos pareceres (follow-up):** ver handoffs `feat-1{0..7}-*.md` — janelas de corrida estreitas em NC de devolução/troca, `CSP_ENFORCE` só após smoke em produção, formulários do spec 11 com schema Zod local, `terraform apply` exige NAT/PI/secrets já corrigidos mas não aplicados.

## ✅ Wave 4 — Funcionalidades em falta (specs 04–09) COMPLETA (2026-07-20)
6 agentes `feat-*` em paralelo (1 worktree cada), merge determinístico e migrations só pelo orquestrador. `pnpm check` verde (**767 testes**), `pnpm gates` verde, seed completo aplicado.

| Spec | Estado | Migration | Notas de gate |
|---|---|---|---|
| 04 reconciliação bancária | ✅ mergido | `0400` (itemParId + unique extratoReferencia) | review APROVADO; 3 MAJOR de concorrência → follow-up |
| 05 contagem/reconciliação de stock | ✅ mergido | `0500` (ContagemStock/ItemContagemStock + `CONTAGEM_STOCK`) | REJEITADO→corrigido (reconciliar atómico, tenantId na tx, lançamento em qtd removido)→APROVADO |
| 06 processamento salarial | ✅ mergido | `0600` (FolhaPagamento/LinhaPayroll/TabelaINSS/EscalaoIRPS) | APROVADO; motor 100% cobertura; 3 MAJOR fechados (cancelar idempotente, timeout tx, líquido negativo) |
| 07 recrutamento | ✅ mergido | `0700` (Vaga/Candidato/Candidatura/Entrevista/Historico) | REJEITADO (Decimal SC→CC + bypass máquina de estados)→corrigido→APROVADO |
| 08 benefícios | ✅ mergido | `0800` (Beneficio/BeneficioColaborador) | APROVADO; contrato `linhasPayrollDeBeneficios` para o payroll |
| 09 correções e páginas | ✅ mergido | `0900` (rename enum `TREZENTOS_SESSENTA`→`GRAU_360`, RENAME VALUE) | APROVADO; 2 MAJOR fechados (EquipaService.listar, rota equipa/nova) |

Ordem de merge: 04 → 05 → 06 → 07 → 08 → 09. Conflitos de schema (`pessoas-projetos.prisma`), `state-machines.ts`, `rbac.ts`, `status-badge.tsx` resolvidos aditivamente pelo orquestrador. Infra: `gespro-db` em **:5433** (5432 ocupada), `wt/` excluído de tsc/eslint, teste `tenant-context` alinhado com `runWithTenantContext` async.

**Wave 5 (specs 10–17)**: COMPLETA — ver secção no topo do documento.

## ✅ PROGRAMA COMPLETO (2026-07-11)
Os 3 specs entregues e verificados. `pnpm check` verde (569 testes), `pnpm gates` verde (Dialog 0, `'use client'` 0, `src/data` 0), **28 E2E Playwright** + **13 axe (0 violações WCAG AA)** verdes.
- **Backend**: 144 modelos Prisma, 240 permissões, multi-tenancy, Auth.js (argon2/rate-limit/reset/convite/auditoria), PGC-NIRF (504 contas), integração transaccional real (venda→stock→caixa; receção→stock→conta a pagar; factura→contabilidade; produção→stock; numeração sequencial).
- **UI**: 219 páginas, golden standard sem-modais replicado, Server Components a consumir serviços reais, tokens/dark-mode, patterns, POS full-screen, wizards, kanban DnD, ecrã de auditoria.
- **`zoer_chatbot`**: removido por decisão do owner (rota + hook + componente + dep `@npm_chat2db/zoer-copilot`).
- **Dívida documentada**: custo-hora de produção (tabela de taxas horárias), isolamento de testes de integração (testcontainers vs DB partilhada).
- Login demo: `admin@demo.mz`/`demo1234` (+ gestor/financeiro/operador/leitura). DB: `docker compose up -d` + `pnpm db:seed`.


> Fonte de verdade operacional do orquestrador. Atualizada ao fim de cada wave.

## Legenda de waves
- **Wave 0** — Fundação backend (sequencial, BLOCKING)
- **Wave 1** — Contratos de domínio (7 workstreams paralelos)
- **Wave 2** — Implementação de domínio (7 workstreams paralelos)
- **Wave 3** — Integração transaccional (sequencial)
- **Wave UI-0..2** — Modernização de UI

## Nota de arranque (2026-07-10)
Ao arranque, os specs `01/02/03` e os agentes `.claude/agents/*` **não estavam
disponíveis** — executei a Wave 0 a partir das skills normativas. **Durante a
sessão**, os specs `01/02/03` e o roster completo de agentes foram provisionados.
Re-baseline feito: os specs existem e são a fonte de verdade; a Wave 0 que entreguei
é enxuta face ao `spec 01` (ver [ADR-0002](decisions/0002-wave0-enxuta-vs-spec01.md)).
Decisão de stack (Next.js+Prisma, não Spring): [ADR-0001](decisions/0001-stack-e-scaffolding.md).

## Inventários de domínio (2026-07-10) — input da Wave 1
7 inventários paralelos read-only (A–G) concluídos sobre o código mock. Consolidados
em [docs/handoff/00-mapa-entidades-conflitos.md](handoff/00-mapa-entidades-conflitos.md):
mapa de propriedade de entidades, **20 conflitos a arbitrar** (dois `Cliente`, três
`Cotacao`, dois `Fornecedor`/`PedidoCompra`, `Ativo` sem tenantId, PGC-NIRF placeholder,
numeração partida, kanban afinal read-only, produção sem tipos, Rota dupla-def, …) e
contratos de integração inter-workstream. Gate da Wave 1 depende desta arbitragem.

## Quadro de progresso

| Workstream | Wave | Estado | Notas |
|---|---|---|---|
| backend-foundation | 0α+0β | ✅ | argon2, rate-limit, auditoria, PGC (504 contas), 240 permissões |
| domain-* (7) | 1 contratos | ✅ | 144 modelos, gate code-review APROVADO |
| domain-* (7) | 2 implementação | ✅ | serviços+property tests+actions+seeds; gate APROVADO (2 BLOCKERs + 8 bugs corrigidos) |
| domain-* (7) | 3 integração | ✅ | 5 wirings reais (venda→stock→caixa; receção→stock→conta a pagar; factura→contabilidade; produção→stock; numeração unificada) |
| ui-* (7) | UI-0–2 | ⬜ próximo | spec 03 — depende de decisão do owner |

**Backend Waves 0–3 COMPLETO** (2026-07-10): `pnpm check` exit 0, **569 testes** (incl. integração real contra Postgres). DB com login/RBAC/auditoria/PGC-NIRF + dados demo dos 7 domínios. Dívida conhecida: 1 TODO (custo-hora de produção — tabela de taxas), testes de integração na DB partilhada (isolar com testcontainers), 2.5/2.7 (Server Components + remoção de mocks) a fazer com a UI.

## Wave 1 — Contratos ✅ (2026-07-10)
7 agentes de domínio em paralelo + 0-beta. `pnpm check` exit 0 (prisma validate 144 modelos, tsc 0, eslint 0 erros, 56 testes). Reconciliações do orquestrador no gate:
- **`TENANT_MODELS`/`SOFT_DELETE_MODELS` derivados do `dmmf`** (auto-registo por presença de `tenantId`/`deletedAt`; exclui `LoginAttempt` global) — adicionar um módulo novo já não toca no ficheiro partilhado. 109 modelos tenant-scoped.
- **WS E normalizado para FK escalar** (removidas 19 `@relation` a Tenant + back-refs em `tenant.prisma`) → 7 WS consistentes, `tenant.prisma` desacoplado dos domínios.
- MZ utils: `common.ts` e `mocambique.ts` ambos delegam no mesmo `validarNUIT/BI` (sem divergência) — mantidos.
- Modelos: A=17, B=27, C=12, D=~21, E=27, F=21, G=1(+fundação). Contratos expostos: A(stock), D(lançamento/caixa/série).

### Gate de code-review — 1.ª passagem: REJEITADO (6 BLOCKERs) → ADR-0003
Causa-raiz: consumidores (B/C/E) criaram **tipos-espelho locais** dos contratos dos fornecedores (A/D) que divergiam — `tsc` passava mas a integração da Wave 2 falharia. Arbitragens em [ADR-0003](decisions/0003-gate-wave1-arbitragens.md).

### Ronda de correção (8 agentes via SendMessage, contexto intacto) → gate VERDE
- Fornecedores A/D exportam contratos canónicos; consumidores B/C/E/F **importam** (espelhos eliminados). Removidos os espelhos, o **`tsc` passa a ser o fiscal dos contratos**.
- `TipoSerieDocumento` unificado (18 valores, todos os documentos); `proximoNumeroSerie(tx, tipo, ctx)` assinatura única.
- `tenantId` em todas as tabelas-filho → **139 modelos tenant-scoped** (auto-derivados do dmmf). IVA fração (0.16). `lojaId` removido. Interfaces Rota/Entrega/Abastecimento (F), ContaPagar/Comissão TRANSICOES.
- `pnpm check` exit 0 (validate 144 modelos, tsc 0, eslint 0 erros, 56 testes). 6 BLOCKERs grep-verificados fechados.
- **Re-review focado: APROVADO** — 6 BLOCKERs fechados, sem novas divergências.
- Dívida aceite documentada: paridade enum Prisma↔Zod (`TipoSerieDocumento`) — parity test na Wave 2.

### Infra DB (2026-07-10)
`docker-compose.yml` (PG17) + `.env`. **Migration `20260710071120_init` aplicada** (145 tabelas). Seed de fundação: 5 utilizadores demo (admin/gestor/financeiro/operador/leitura @demo.mz, senha `demo1234`) + 5 roles (84/64/23/22/21 permissões). `prisma.config.ts` ganhou `datasource.url`; seed ganhou `dotenv/config`.

## Fase UI (spec 03)
- **UI-0** ✅ tokens + layout (sessão real) + 13 patterns + golden standard `compras/requisicoes`. Gate: REJEITADO (BLOCKER RSC: funções a atravessar a fronteira servidor→cliente crashavam a listagem — o `pnpm check` não apanha) → corrigido → APROVADO.
- **UI-1** ✅ (núcleo) 7 agentes migraram o núcleo dos 7 domínios (215 page.tsx, **0 `'use client'` em listagem/detalhe**, patterns, actions reais). Gate combinado: `pnpm check` verde + **smoke autenticado em runtime** (login real, 25 páginas). O smoke apanhou **4 crashes que o `pnpm check` não vê**: 3 client components a fazer value-import de `TRANSICOES_*` de módulos `server-only` (→ extraído `src/lib/state-machines.ts` client-safe) e `analytics` com `dynamic({ssr:false})` num Server Component (→ wrapper client). Todas as páginas amostradas: 200.
  - **Cauda para UI-2**: 22 páginas ainda com `Dialog` (sub-páginas/wizards de produção/rh/projetos/vendas/clientes), 4 detalhes ainda a ler `src/data`, alguns estados em falta no `status-badge` (fallback gracioso).
  - **Lição de processo**: verificação de UI exige **smoke autenticado em runtime**, não só `pnpm check`.
- **UI-2** ⬜ próximo: limpar a cauda (Dialog→rotas, remover `src/data`), a11y (axe), E2E Playwright dos fluxos críticos, gates de CI.

## Wave 2 — Implementação ✅ GATE PASSADO (2026-07-10)
Code-review rejeitou (2 BLOCKERs de tenant + 9 avisos) → ronda de correção (6 WS) → **gate verde**. Ver [ADR-0004](decisions/0004-gate-wave2-e-plano-wave3.md).
- **BLOCKERs fechados**: fuga cross-tenant em `marcarItemReconciliado` (D) e `registarVisualizacao` (F).
- **Bugs de correção**: stock atómico (A), máquina de estados na prova de entrega (F), fallback de aprovação (B), `catch` dentro de tx (C), custeio de produção (E), validação de FKs por tenant (D).
- **WS B `prisma as any` removido** → revelou **8 bugs escondidos** (6 `create` sem `tenantId`!) — todos corrigidos; o typecheck agora cobre WS B.
- `pnpm check` exit 0 (**512 testes**), seed completo aplicado. Dívida: alguns testes tocam a DB partilhada (flaky) — isolar por tenant/testcontainers na fase de qualidade.
- **Wave 3** (5 pontos de wiring stubs→reais) planeada em ADR-0004; aguarda ok do owner.

### (histórico da 1.ª passagem)
7 WS implementados: **509 testes verdes** (`pnpm check` exit 0). Seed completo aplicado à DB (Fornecedor 5, Cliente 5, RequisicaoCompra 5, Colaborador 2, Viatura 2, **ContaPGC 502**, **Permission 240**). Reconciliações do gate: seed do compras alinhado ao schema (enums/campos); catálogo de permissões expandido 84→**240** (cobre as 169 usadas pelas actions, 0 em falta); `seed/index.ts` liga os 7 domínios. Padrão comum: D/E/F usam `prismaBase.$transaction` (client cru) com `tenantId` explícito — **em revisão** (isolamento). Adiado p/ fase UI: 2.5 (Server Components) e 2.7 (remoção de mocks).

### Detalhe original (histórico)
7 agentes de domínio (contexto Wave 1 intacto), tasks 2.1–2.4: serviços que cumprem as interfaces, property tests + unit (≥80%), Server Actions via `createSafeAction`, seeds dos mocks (D: +ContaPGC das 504 contas). **Adiado para a fase de UI**: 2.5 (conversão de páginas para Server Components) e 2.7 (remoção de mocks) — evita partir as páginas mock antes da migração visual. Cross-WS via interfaces (mock nos testes; integração transaccional real = Wave 3). Merge por mim na ordem A,D,B,C,E,F,G após parecer.

## Wave 0 — Fundação ✅ GATE VERDE (2026-07-10)

`pnpm check` exit 0 = `prisma validate` + `tsc --noEmit` + `eslint` (0 erros) + `vitest` (7/7).

| # | Entregável | Estado |
|---|---|---|
| 1 | Deps backend (Prisma 7.8, Auth.js v5, bcrypt, vitest, fast-check, pg adapter) + `pnpm check` | ✅ |
| 2 | Schema folder Prisma: datasource, generator, Tenant, User, Role, Permission, join tables, AuditLog | ✅ |
| 3 | `server/db/client.ts` (base + extended) + `tenant-extension.ts` (AsyncLocalStorage, TENANT_MODELS, soft delete) | ✅ |
| 4 | Hierarquia `AppError` (`lib/errors.ts`) | ✅ |
| 5 | `createSafeAction` + `ActionResult` (`server/safe-action.ts`), `withApi` (`lib/api/with-api.ts`), `paginate()` | ✅ |
| 6 | Auth.js Credentials+JWT (sessão com tenant/permissões) + `can()`/`requirePermission()` + route handler | ✅ |
| 7 | Seeds RBAC (10 permissões) + tenant/role/utilizador demo | ✅ |
| 8 | vitest + testes (errors, paginate property-test, contexto de tenant) | ✅ |
| 9 | Gate `pnpm check` verde | ✅ |

### Decisões e desvios da Wave 0
- **Prisma 7**: `url` saiu do schema → `prisma.config.ts` + driver adapter `@prisma/adapter-pg`.
- **Auth.js**: Credentials + JWT **sem** PrismaAdapter (login real só precisa de User+bcrypt) — dispensa tabelas Account/Session/VerificationToken. Login multi-tenant passa `tenant` (slug) opcional.
- **`next lint` removido no Next 16** e `eslint.config.mjs` (FlatCompat) rebentava com eslint 9 → reescrito para flat config nativo do `eslint-config-next`. `lint` agora é `eslint .`.
- **Middleware de protecção**: adiado. A protecção de rotas far-se-á no layout do `(dashboard)` (Server Component) na integração de UI — evita o split edge/node do Auth.js. Auth.js está configurado e usável já.

### Bloqueios / dívida conhecida
- **Migrations adiadas**: ambiente sem `DATABASE_URL`. Schema valida offline; a 1ª migration gera-se quando houver Postgres (`pnpm db:migrate:dev`). Credenciais demo: `admin@demo.mz` / `demo1234` (após `pnpm db:seed`).
- **140 violações de lint pré-existentes** (`react-hooks/purity|immutability|set-state-in-effect`, regras novas do React Compiler no eslint-config-next 16) nas 195 páginas → rebaixadas a **warning**; a levar a zero nas waves de UI. Código novo cumpre o ruleset completo.
- **`revalidateTag`→`updateTag`**: Next 16 mudou a assinatura de `revalidateTag`; `safe-action` usa `updateTag(tag)`.

## Decisões (ADR)
- [0001 — Stack e scaffolding do programa](decisions/0001-stack-e-scaffolding.md)
