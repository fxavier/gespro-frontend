# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GestPro é um ERP **multi-tenant** para empresas moçambicanas. Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5 + Tailwind 4 + shadcn/Radix + Prisma 7 + PostgreSQL. Moeda MZN, validações NUIT/BI, plano de contas PGC-NIRF (Decreto 70/2009). Toda a UI e mensagens em **Português de Portugal**.

## Comandos

**Monorepo (spec 18 §1, ADR-0006)** — o repositório é um workspace pnpm + Turborepo. O ERP vive em
`apps/erp/` (todos os caminhos `src/`, `prisma/`, `e2e/`… deste documento são relativos a `apps/erp/`);
o site de marketing vive em `apps/site/` (Next 16, porta 3100, sem base de dados — ver secção própria);
a marca partilhada em `packages/brand` (tokens, logótipos, `cores.json`); config partilhada em
`packages/tsconfig` e `packages/eslint-config`. Os scripts abaixo correm **da raiz** e delegam via `pnpm --filter erp` /
`turbo run`; nomes inalterados.

**`wt/` são 30 worktrees, e a maioria é PRÉ-monorepo** — cada uma tem o ERP em `<worktree>/src/`, não em
`apps/erp/src/`. Estão no `.gitignore`, por isso `git grep` e o `rg` por omissão não lhes tocam; **`grep -r`,
`find` e `ls` a partir da raiz tocam**, e devolvem o ficheiro certo no sítio errado: as Server Actions reais
são **22** em `apps/erp/src/server/actions/`, e um `find` da raiz por `*/src/server/actions/*.ts` devolve
**629** — quase todas fantasmas de um layout que já não existe. Editar um deles não dá erro
nenhum: dá uma alteração que nunca chega ao produto. Prefere `git grep`/`rg`, ou arranca a busca de
`apps/erp/`. (`src/` na raiz é só `.DS_Store` e é ignorado.)

```bash
# Base + identidade (necessárias para dev, seed e testes de integração/E2E).
# O KEYCLOAK faz parte do perfil por omissão (ADR-0013 §7): realm `gespro`
# importado de infra/keycloak/, consola em http://localhost:8081. Sem ele não
# há sessão nenhuma — mas o ECRÃ de login é NOSSO desde o ADR-0029: o
# formulário vive em /auth/login e fala com o Keycloak por Direct Access Grant.
# Não há salto de domínio; quem autentica continua a ser o Keycloak.
docker compose up -d          # Postgres 17 (gespro-db, porta 5432, WAL arquivado) + Keycloak 26.7
pnpm db:migrate:dev           # aplica migrations
pnpm db:seed                  # tenant demo + utilizadores + PGC + dados dos 7 domínios
                              # ...e um exercício comercial inteiro: 64 produtos, 24 cotações,
                              # 20 encomendas, 176 vendas, 104 facturas e os lançamentos delas
pnpm db:seed:volume           # dados sintéticos de ESCALA (ADR-0018) em tenants `perf-*`;
                              # escreve perf/.generated/seed-manifest.json para os cenários k6
pnpm db:studio

pnpm dev                      # http://localhost:3000  (login: admin@demo.mz / demo1234, no nosso ecrã)

# Pilha local de referência COMPLETA (ADR-0026): Keycloak + Valkey + MinIO +
# otel-lgtm + Mailpit + 2× ERP (imagem de produção) atrás de proxy. Segredos por
# .env na raiz (ver .env.example); tem placeholders de dev, sobe sem .env.
docker compose --profile full up -d --build
#   ERP via proxy:  http://localhost:8080  (header X-Gespro-Instancia mostra a instância)
#   Keycloak :8081 · Grafana :3002 (OTLP 4317/4318) · MinIO :9001 · Mailpit :8025
# Ensaio de cópia/restauro cronometrado (runbooks em docs/runbooks/):
./infra/local/scripts/ensaio-restauro.sh

# Verificação (tudo tem de estar verde antes de entregar)
pnpm check                    # prisma validate && tsc --noEmit && eslint . && vitest run
pnpm gates                    # gates de arquitectura (ver abaixo)
pnpm e2e                      # Playwright — fluxos críticos (precisa da app + DB + Keycloak REAL)
pnpm e2e:a11y                 # axe (WCAG AA)

# Um único ficheiro de teste (a partir de apps/erp/)
npx vitest run src/server/services/financas/__tests__/faturacao.test.ts
npx playwright test e2e/03-caixa.spec.ts

# Testes de integração isolados (Testcontainers, Postgres efémero — spec 15)
pnpm test:integration
```

Os E2E do ERP (`e2e`, `a11y`) correm um projecto `setup` que **reescreve `apps/erp/playwright/.auth/admin.json`**
com uma sessão fresca; depois de qualquer corrida, `git checkout -- apps/erp/playwright/.auth/admin.json`.
O ficheiro versionado tem uma sessão expirada — um script ad-hoc com esse `storageState` cai no login;
corre `npx playwright test --project=setup` primeiro.

```bash
# Desempenho (ADR-0018) — cenários k6, planos de execução e a linha de base
ls perf/k6 perf/sql perf/explain     # os cenários e as consultas medidas
cat perf/README.md                   # como correr e como ler os resultados
```

```bash
# Site de marketing (apps/site) — estático, sem DB nem Keycloak; só /comecar depende do ERP
pnpm dev:site                              # http://localhost:3100
pnpm --filter site gate:cores              # zero literais de cor fora de src/app/theme.css e packages/brand
pnpm --filter site build && pnpm --filter site e2e:a11y   # axe nos dois temas; sobe o servidor sozinho
pnpm --filter site e2e:funil               # /comecar responde 307 para NEXT_PUBLIC_APP_URL/registo
```
Se a porta 3100 tiver um `next start` antigo, o `e2e:a11y` falha com `EADDRINUSE`/500: `lsof -ti:3100 | xargs kill`.
O `e2e:funil` espera `NEXT_PUBLIC_APP_URL=http://localhost:3000`; um `.env` com `:8080` (proxy do perfil `full`) fá-lo falhar.

`pnpm check` **não** apanha: (1) erros de runtime RSC (ver "Fronteira Servidor↔Cliente"); (2) erros que **só o build de produção** revela; (3) formulários que se recusam a submeter — o `zodResolver` rejeita e, se o campo não renderizar o seu erro, não acontece nada visível. Para UI, confirma sempre com um **smoke autenticado** (`pnpm dev` + login) ou `pnpm e2e`; antes de entregar algo que toque em build/deploy, corre também `pnpm build` (ver "Build de produção" nas regras invioláveis).

Na suite E2E completa (`workers: 1`, `timeout: 30_000`) cai quase sempre **um** teste por corrida, e nem sempre o mesmo: com o `pnpm dev` a compilar rotas à medida, uma rota fria estoura o tecto. Antes de culpar uma alteração, corre o ficheiro sozinho. Falha conhecida e alheia ao código: `e2e/07-sessao.spec.ts:60` precisa de `AUTH_SESSION_MAX_AGE=8`, que só se aplica quando é o Playwright a arrancar o servidor (`reuseExistingServer`).

**Golden fixture da spec 22** (`src/server/services/financas/__tests__/projecao.golden.test.ts`) corre dentro do
`pnpm check` contra a **base local** e falha de propósito quando o tenant `demo` não é o do seed: basta um
compromisso de tesouraria criado à mão, ou um lançamento gravado na conta 123 (Standard Bank), para o `check`
ficar vermelho sem nenhuma alteração de código. A mensagem diz «a base tem resíduos»: limpa o resíduo, ou
re-deriva a fixture à mão (handoff da spec 22) — nunca `vitest -u`.

**Scripts ad-hoc de smoke** (Playwright fora da suite): o pacote instalado é `@playwright/test` (não
`playwright`), e o script tem de viver dentro de `apps/erp/` para o resolver. Em `pnpm dev`, espera
`networkidle` antes de escrever num campo: preencher antes da hidratação muda o DOM e não o estado do React,
e o teste afirma sobre valores que a página nunca usou.

**Shell do agente é zsh**: `$VAR` sem aspas **não** se parte em palavras (`vitest run $FICHEIROS` passa um
único argumento) — usa um array `F=(a b); … "${F[@]}"`. O `psql` não está instalado no host e o utilizador
do Postgres não é `postgres`:
`docker exec gespro-db psql -U "$(docker exec gespro-db printenv POSTGRES_USER)" -d "$(docker exec gespro-db printenv POSTGRES_DB)" -c '…'`.

### Migrations — só o orquestrador, e **não-interativas**
`pnpm db:migrate:dev` (`prisma migrate dev`) exige TTY e **rebenta em ambiente não-interactivo**. Para gerar uma migration a partir do delta schema↔DB sem prompts:
```bash
mig="prisma/migrations/$(date +%Y%m%d%H%M%S)_<nome>"; mkdir -p "$mig"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script > "$mig/migration.sql"
npx prisma migrate deploy
```
Renomear (valor de enum **ou coluna**): o `migrate diff` gera **drop+create** e perde os dados — escreve à mão `ALTER TYPE "X" RENAME VALUE 'A' TO 'B';` ou `ALTER TABLE "T" RENAME COLUMN "a" TO "b";` (renomeia também a constraint: `ALTER TABLE "T" RENAME CONSTRAINT …`, senão o próximo `migrate diff` vê deriva) e marca com `prisma migrate resolve --applied <migration>`. Confirma no fim que `migrate diff --from-config-datasource --to-schema prisma/schema --script` devolve *empty migration*. Em produção usa **sempre** `migrate deploy`, nunca `migrate dev`.

**Não corras `prisma format`**: reformata os onze ficheiros de `prisma/schema/` inteiros e o diff deixa de ser
revisível. Edita o schema à mão e valida com `npx prisma validate`.

Configuração por tenant nova (ex.: `ContaNaturezaNotaDebito`) precisa de omissão em **dois** sítios: em
`tenant-bootstrap.ts` para os tenants futuros e, na própria migração, um `INSERT … SELECT … ON CONFLICT DO NOTHING`
para os que já existem — o `pnpm db:seed` não chega a tenants de produção.

Depois de `prisma generate`, **reinicia o `pnpm dev`** (`touch apps/erp/next.config.ts` chega): o processo em memória continua com o cliente antigo e as páginas afectadas passam a devolver o cartão de erro do `catch` — parece bug de código e é só o processo desactualizado.

Utilizadores demo (senha `demo1234`): `admin@demo.mz`, `gestor@`, `financeiro@`, `operador@`, `leitura@` — tenant slug `demo`. As identidades vivem no **realm Keycloak** (`infra/keycloak/realm-gespro.json`, `sub` fixos) e o seed grava exactamente esses `sub` em `User.keycloakSub` — um teste no `pnpm check` garante a concordância (ADR-0013 §7).

## Marca partilhada (`packages/brand`)

`packages/brand/tokens.css` é a **única** paleta das duas apps: tela azulada, tinta marinho, um azul vivo
como cor de acção e de ligação, barra lateral azul fixa nos dois temas. O `globals.css` do ERP só faz o
mapeamento Tailwind (`@theme inline`) — **não sobrepõe cor nenhuma**; o `theme.css` do site mapeia os seus
nomes históricos (`bg-azul`, `text-texto-suave`, `bg-superficie`…) para tokens de marca e só declara os
seus (faixa final, acento do gradiente). Alterar uma cor é alterar `tokens.css` e correr o axe das duas apps.
No tema escuro o `--primary` clareia e `--primary-foreground` passa a tinta escura: um token que serve de fundo
de botão E de cor de ligação só passa AA assim. `cores.json` espelha em hex o que `next/og`, favicons e a barra
do browser não conseguem ler de custom properties — alterar os dois em conjunto. Inter nas duas apps.

## Site de marketing (`apps/site`)

- Nenhum literal de cor fora de `src/app/theme.css` (gate `gate:cores`); nenhum valor monetário em
  `messages/*.json` nem em componentes — os preços vêm de `GET /api/publico/planos` (spec 19, USD por ADR-0009)
  e há um teste que o impõe. Números decorativos (painel do hero, KPI ilustrativos) vivem nos componentes.
- `messages/pt.json` é a fonte do conteúdo; `en.json` é um *stub* fundido sobre PT em `src/i18n/request.ts`
  (chaves novas só em PT; EN não pode ter chaves que PT não tenha).
- O `cn` do site é um `join` **sem tailwind-merge**: dois `bg-`/`text-` na mesma classe ficam à mercê da ordem
  do CSS gerado. Variações de botão são **variantes** em `primitivos.tsx`, nunca `className` por cima.
- O gate de cores trata `#8902` numa string como hex: escreve «n.º 8902».
- `/comecar` é uma Route Handler que responde 307 para o ERP preservando `plano` e `utm_*`; o formulário de
  registo vive no ERP (`/registo`, ADR-0031).

## Arquitectura

**Monólito modular.** Cada domínio é uma fronteira explícita; a comunicação entre domínios é só por **funções de contrato publicadas**, nunca por import de internals de outro módulo.

### Camadas backend (dos dados para a UI)
- `prisma/schema/*.prisma` — schema multi-ficheiro (um por domínio + `tenant`/`auth` de fundação). **Prisma 7**: o `url` do datasource vive em `prisma.config.ts` (não no schema); o client usa o driver-adapter `@prisma/adapter-pg`.
- `src/server/db/client.ts` — exporta `prisma` (estendido) e `prismaBase` (cru). Extensões: `tenant-extension` + `audit-extension`.
- `src/server/db/tenant-extension.ts` — isolamento multi-tenant via `AsyncLocalStorage`. `TENANT_MODELS`/`SOFT_DELETE_MODELS` são **derivados do `Prisma.dmmf`** (qualquer modelo com `tenantId`/`deletedAt`) — adicionar um módulo novo **não** toca neste ficheiro. `runWithTenantContext({tenantId,userId}, fn)` estabelece o contexto.
- `src/server/services/<modulo>/*.service.ts` — lógica de domínio pura, `import 'server-only'`, recebe `Ctx {tenantId,userId}`. Regras lançam `BusinessRuleError` (código estável). Máquinas de estado: mapa `TRANSICOES_*` + `transitar()`.
- `src/server/safe-action.ts` (`createSafeAction`) e `src/lib/api/with-api.ts` (`withApi`) — pipelines de sessão→permissão→Zod→contexto de tenant→handler→`ActionResult<T>`/envelope.
- `src/server/actions/<modulo>.actions.ts` — `'use server'`, uma action por mutação de UI, cada uma com `permission` (do catálogo em `prisma/seed/rbac.ts`) e `revalidate`.

### Fluxo de dados
- **Leitura de página**: Server Component chama o serviço directamente dentro de `runWithTenantContext` (tenantId da sessão via `auth()`). Nunca faz fetch à própria API nem lê `src/data`.
- **Mutação**: Client Component → Server Action (`createSafeAction`). Nunca lança para o cliente — devolve `ActionResult`.
- **Exportação / webhook / cron**: Route Handler via `withApi`.

### Integração entre domínios (transaccional)
FKs cross-domínio são **escalares** (`clienteId String` + índice), **nunca `@relation`** a modelos de outro workstream — mantém cada schema auto-contido e desacopla `tenant.prisma` dos domínios. A consistência é garantida chamando as **funções de contrato** dentro da mesma `$transaction`:
- **A/inventário expõe**: `entradaStock`, `baixarStock`, `reservarStock`, `confirmarConsumoStock`, `libertarStock`.
- **D/finanças expõe**: `registarLancamentoContabilistico` (partida dobrada), `registarMovimentoCaixa`, `proximoNumeroSerie` (numeração atómica `UPDATE...RETURNING FOR UPDATE`, sem lacunas).
- Fluxos ligados: venda/POS→stock+caixa · recepção→stock+conta a pagar · factura→contabilidade · produção→consumo/entrada de stock.

### Camadas transversais (envelopam, não alteram contratos)
- **Observabilidade** (`src/server/observability/*`, `instrumentation.ts`) — logger estruturado com redacção de segredos/PII, `requestId` num `AsyncLocalStorage` **separado** do tenant, métricas RED. `withApi`/`createSafeAction` estão envelopados: erros inesperados devolvem `traceId` sem stack ao cliente. `/api/health` (liveness), `/api/ready` (SELECT 1), `/api/metrics` (protegido por `METRICS_SECRET`).
- **Segurança** (`middleware.ts`, `src/lib/security/headers.ts`, `src/lib/api/cors.ts`) — CSP com nonce por pedido (report-only por omissão; `CSP_ENFORCE=true` em prod só após smoke), HSTS/X-Frame/nosniff/Referrer/Permissions; CORS por allowlist (`ALLOWED_ORIGINS`), **nunca wildcard**; rate-limit em reset/convite/exports. `middleware.ts` é o **único** dono dos headers de segurança e dos paths públicos.
- **Documentos/exportação** (`src/lib/documents/*`, `src/lib/reporting/*`) — PDF fiscal via `@react-pdf/renderer` (**só runtime Node**, nunca no cliente) que **reflecte** o documento emitido (append-only, nunca recalcula); export CSV/XLSX com `Decimal`→string lossless. Servidos por Route Handlers (`withApi`), nunca Server Actions.
- **Notificações** (`src/server/services/plataforma/notificacao.service.ts`, `src/server/email/*`) — padrão "persistir-depois-enviar": grava `Notificacao` (estado `PENDENTE`) dentro da tx, envia email como efeito colateral **fora** da tx; porta `EmailProvider` (smtp/noop).

### UI
- **Golden standard**: `src/app/(dashboard)/compras/requisicoes/**` — o molde a replicar (lista SC + `@panel`/`(.)[id]` + detalhe com tabs + `novo`/`[id]/editar`). **Nota:** o interceptor `@panel/(.)[id]` captura o segmento literal `novo` (é um valor válido para `[id]`) — em build de produção isto mostra a listagem em vez do formulário na navegação client-side. Bug conhecido do molde (ver `docs/status.md`); ao replicar, garante que o painel devolve `null` em vez de `notFound()`.
- `src/components/patterns/*` — biblioteca única (PageHeader, DataTable, FilterBar, StatusBadge, KpiCard, DetailShell, FormPage, Stepper, UnsavedChangesGuard…). Compor a partir daqui, não dos primitivos `ui/`.
- `StatusBadge` usa um **mapa único** status→variante (`patterns/status-badge.tsx`); proibido mapa local. Estado sem entrada no mapa aparece **em bruto** (`LANCADO`) — ao introduzir um estado novo, regista-o lá.
- Escolher uma entidade: `Combobox` (filtro local) ou `ComboboxRemoto` (pesquisa no servidor, com atraso e sem corridas) — nunca um campo de texto para colar um id. Acima de uma página de registos é `ComboboxRemoto`, senão os registos fora da primeira página ficam inalcançáveis.
- `TableSkeleton` (patterns) é uma **tabela completa**, para `<Suspense fallback>`; dentro de um `<tbody>` usa-se `LinhasSkeleton`. Linhas `<tr>` soltas dentro de uma `<div>` são HTML inválido e dão erro de hidratação.
- `Select` com valor inicial: passa o rótulo como filho — `<SelectValue placeholder="…">{opcaoEscolhida?.label}</SelectValue>`. O Radix só resolve o texto do item **depois** de a lista abrir; sem isto o campo aparece vazio apesar de haver valor escolhido.
- Formulários: `react-hook-form` + `zodResolver` com o **mesmo** schema de `src/lib/validations/<modulo>.ts`, submit via Server Action com `useActionState`.

## Regras invioláveis (não-óbvias — causaram crashes/fugas reais)

**Fronteira Servidor↔Cliente (RSC)** — o `pnpm check` compila mas não apanha estes; o gate `pnpm e2e`/smoke apanha:
- Client Components **nunca** fazem *value-import* de módulos `server-only` (serviços/`.interface.ts`). Usa `import type` para tipos; constantes que o cliente precisa (máquinas de estado) vivem em `src/lib/state-machines.ts` (client-safe).
- Definições de colunas com funções (`render`/`rowHref`) vivem sempre num módulo `'use client'` (funções não atravessam a fronteira RSC).
- `dynamic(..., { ssr: false })` só dentro de um Client Component, nunca num Server Component.
- `page.tsx` de listagem/detalhe é **sempre** Server Component (interactividade em componentes-folha).

**Multi-tenancy** — `tenantId` **nunca** vem do cliente; vem do contexto. A extensão injecta em `create`/`findMany`/etc., mas **`findUnique`/`update`/`delete`/`upsert` NÃO são scoped** → os serviços filtram por `tenantId` explicitamente; cross-tenant devolve `NotFoundError` (404), nunca 403. Dentro de `prismaBase.$transaction` (client cru) inclui sempre `tenantId` nas escritas.

**Dinheiro e documentos** — dinheiro sempre `Prisma.Decimal` (nunca `Float`); serializa `Decimal`→`string` ao passar SC→CC (`.toString()`, que é a convenção da casa — perde zeros à direita, não perde valor). O **retorno das Server Actions já vai serializado**: o `createSafeAction` passa tudo por `serializarDecimais` e o tipo é `ActionResult<Serializado<T>>` — sem isso, uma mutação que devolva a entidade gravada rebenta no cliente **depois** do commit, e o utilizador vê um erro sobre um registo que existe. Documentos transaccionais (facturas emitidas, lançamentos) são **append-only** — correcções por estorno/nota de crédito, nunca UPDATE de valores.

**Datas na UI** — formata **sempre** por `src/lib/format-date.ts` (fuso fixo `Africa/Maputo`), nunca `toLocaleString`/`toLocaleDateString` directos. O servidor corre em UTC e o browser no fuso do utilizador: horas diferentes dos dois lados ⇒ falha de hidratação ⇒ o React descarta a árvore e leva com ela os handlers — tipicamente o clique nas linhas da tabela deixa de navegar, **sem erro visível**. Mesmo princípio de `formatMZN` em `format-currency.ts`.

**Identificadores em Zod** — usa `idEntidade()` de `src/lib/validations/common.ts`, não `z.string().cuid()`. O Prisma gera cuid, mas o `tenant-bootstrap` atribui **uuid** às contas PGC (o `createMany` insere por níveis e o filho precisa do id da mãe antes de ela existir). Um `.cuid()` num campo que carregue id de conta rejeita todas as contas reais, em produção inclusive.

**Séries de documento** — ao estender o enum `TipoSerieDocumento`, acrescenta a série a `SERIES_INICIAIS` (`src/server/provisioning/tenant-bootstrap.ts`). O número é atribuído dentro da transacção: sem série, a operação inteira falha com «série activa não encontrada» em **todos** os tenants. Aconteceu a encomendas, devoluções e contagens de stock.

**Permissões novas** — acrescentar uma permissão a `prisma/seed/rbac.ts` não a liga a papel nenhum nos
tenants que já existem: é preciso correr `pnpm db:seed` (aditivo, não destrói nada). Sem isso a
funcionalidade fica completa e o utilizador — o ADMIN inclusive — vê «Sem permissão».

O **número** nunca se inventa, nem em seeds nem em testes: sai de `SerieDocumento.proximoNumero` e a série
fica avançada. Escrever `FAT/2026/000007` à mão porque «é o próximo» põe o primeiro documento criado pela UI
a colidir no `@@unique([tenantId, numero])` — e o erro aparece ao utilizador, não a quem semeou.

**UI** — **sem modais**: criar/editar/detalhar são rotas dedicadas; única excepção é `AlertDialog` para confirmação destrutiva (confirmar, não recolher dados: um campo de texto é formulário, logo é rota). Zero cores hardcoded (só tokens `@theme`); dark mode obrigatório.

**Build de produção (`output: 'standalone'`)** — apanha o que `pnpm check` e `pnpm dev` não apanham: `useSearchParams()`/`usePathname()` sem `Suspense` boundary partem o prerender (envolve o componente em `<Suspense>`). Corre `pnpm build` antes de entregar mudanças de deploy/routing. O `pnpm start` fixa `--port 3000`; para smoke numa porta livre usa `npx next start -p <porta>`.

**Middleware e probes** — `middleware.ts` redirige pedidos não-autenticados para `/auth/login`. Endpoints que têm de responder sem sessão (`/api/health`, `/api/ready`, `/api/metrics` para o HEALTHCHECK do Docker/App Runner; `/api/auth/*`) **têm de estar em `PUBLIC_PATHS`** — senão os health checks recebem 307 em vez de 200.

**Fronteira `'use client'` no servidor** — tudo o que um módulo `'use client'` exporta chega a um Server
Component como *referência de cliente*, incluindo constantes: `cookies().get(COOKIE)` com `COOKIE` importado
de um componente cliente devolve `undefined` com o cookie presente. Constantes partilhadas vivem em módulos
neutros (`src/lib/*`, ex.: `barra-lateral.ts`). Nomes de cookie sem `:` (separador em RFC 6265).

**Formulários cuja action muda o que a página mostra** — uma Server Action revalida a rota; se a página volta a
renderizar noutro ramo (conta já cancelada, já liquidada), o formulário é desmontado e um `useEffect` sobre o
`state` de `useActionState` nunca corre: sem toast, sem redirecção. Padrão da casa (`EstornarForm`,
`RegistarPagamentoForm`): `useTransition`, chamar a action, `router.push` de imediato.

**Server Action que redirecciona, chamada pelo `handleSubmit`** — o `handleSubmit` do
react-hook-form corre a validação do cliente e chama o callback **fora de uma transição**. Um
`redirect()` dentro de uma action invocada assim **não é aplicado**: o servidor devolve
`x-action-redirect`, o router até vai buscar o destino, e nunca fixa a navegação — a escrita
acontece e o utilizador fica no formulário a achar que falhou. Envolve sempre em
`startTransition(() => submeter(dados))`. O React avisa na consola do browser
(«…called outside of a transition») e mais em lado nenhum: `pnpm check` e os E2E que não leem a
consola passam na mesma. Aconteceu em `/registo` e passou despercebido a uma spec inteira.

**Natureza das contas PGC** — em `prisma/seed/data/plano-contas-pgc.json`, classe 6 (gastos) é
`DEVEDORA` e classe 7 (rendimentos) é `CREDORA`. Estiveram trocadas e o balancete mostrava a receita **em
negativo**: o `montarLinhasBalancete` calcula `saldoAtual` a partir da `natureza`, e o `balancete.test.ts` já
assumia o correcto — era o ficheiro de dados que discordava do código. Há teste a trancar as duas regras; se
falhar, o defeito está no JSON, não no teste. (A classe 4 continua toda `DEVEDORA` — `44331 IVA liquidado` e
`421 Fornecedores c/c` aparecem com o sinal ao contrário. Não há regra única: é conta a conta.)

**Exercício e período contabilístico (ADR-0033, 0034, 0035)** — cada `Lancamento` pertence a um
`PeriodoContabil` (`periodoId`, obrigatório) de um `ExercicioContabil`; 13 períodos por exercício (o 13.º
é o do encerramento). Consequências ao escrever código novo:
- Ninguém escreve em `Lancamento`/`PartidaLancamento` pelo Prisma — só `criarLancamento` /
  `registarLancamentoContabilistico`, que resolvem o período e recusam um período trancado. É o que o
  `gate-periodo` impõe.
- O dia fiscal é `Africa/Maputo`, sempre via `diaCivilEmMaputo`/`periodoFiscalDe` (`Intl`) ou
  `AT TIME ZONE` em SQL. O servidor corre em UTC: `getFullYear()` no dia 1 às 00h30 devolve o ano
  anterior, e um `+2` à mão é uma decisão de fuso escondida numa soma.
- `proximoNumeroSerie(tx, tipo, ctx, data)` exige a **data do documento**. A série é por ano; com
  `new Date()` um documento retroactivo sai numerado com a série do ano corrente.
- Quem emite um documento **guarda o lançamento que criou** (`Fatura.lancamentoId`, notas de crédito e
  de débito idem). Não guardar não parte teste nenhum, não dá erro nenhum — e torna o período
  inapurável e infechável para sempre (`DOCUMENTO_SEM_LANCAMENTO`). Já aconteceu.
- `fecharPeriodo` verifica sete pré-condições e devolve-as **todas** em `impedimentos: string[]` — uma de
  cada vez obriga o utilizador a sete voltas. O estado que decide vem da leitura **trancada**
  (`FOR SHARE` na escrita, `FOR UPDATE` no fecho), nunca de uma leitura anterior à tranca.
- Mapas, balancete, razão e DRE filtram lançamentos por `FILTRO_LANCAMENTO_MAPA`
  (`LANCADO` + `ESTORNADO`), exportado do serviço — nunca um literal local, que foi como quatro cópias
  divergiram.
- Uma data `aaaa-mm-dd` que entra por `z.coerce.date()` fica à **meia-noite UTC**; como `dataFim` num
  `lte`, deixa de fora os lançamentos do próprio último dia. A página `/contabilidade/balancete` ainda tem este
  defeito (fim a 31/10 não apanha um lançamento de 31/10 ao meio-dia). O fim de um período pedido pelo
  utilizador é `new Date(dia + 'T23:59:59.999+02:00')`.

**Datas de `<input type="date">`** — `new Date('aaaa-mm-dd')` lê como UTC e, a leste de Greenwich, cai no dia
anterior — muda o período fiscal. Parte a string e constrói `new Date(ano, mes - 1, dia, 12)`.

**Máquinas de estado (`transitar*` em `*.service.interface.ts`)** — lançam `Error` cru, não `BusinessRuleError`:
uma transição inválida chega ao utilizador como «Erro interno» (500). Antes de chamar `transitar*`, garante que o
estado-alvo é mesmo diferente e permitido (ex.: pagamento parcial numa `VENCIDA` mantém `VENCIDA`).

**Campos numéricos** — o `ui/Input` base, quando `type="number"`, selecciona o conteúdo ao focar, apaga zeros à
esquerda enquanto se escreve e repõe `0` se ficar vazio ao sair. Não reimplementar isto nos formulários.

**Seed pelos serviços** — `db:seed` corre com `tsx -C react-server`: nessa condição `server-only` resolve para
vazio e o seed pode escrever pelos serviços (numeração em série, lançamentos contabilísticos — ver
`prisma/seed/contas-pagar.ts`), dentro de `runWithTenantContext`. Os outros seeds continuam a usar o
`PrismaClient` próprio. Idempotência por contagem quando não há chave natural.

**O seed de demonstração é idempotente em DUAS metades** (`prisma/seed/demo-vendas.ts`,
`demo-contabilidade.ts`) — o catálogo é sempre `upsert`; o funil transaccional (cotações, encomendas,
vendas, facturas, lançamentos) só corre **se ainda não houver vendas**, porque re-executá-lo duplicaria
documentos numerados. Consequência prática: mexer no gerador e voltar a correr `pnpm db:seed` **não faz
nada** e não avisa. Para o exercitar a sério é preciso limpar primeiro o funil do tenant `demo`.

**Realm Keycloak** — `infra/keycloak/realm-gespro.json` tem `verifyEmail: false` e assim tem de ficar (ADR-0031
§2-ter): com `true`, a primeira tentativa de login de uma conta acabada de registar carimba `VERIFY_EMAIL` e o
registo público deixa de abrir sessão — a suite passa à mesma, porque o Keycloak é sempre dobrado.

**Barra lateral** — nunca desaparece: recolhe para um carril de 56px em qualquer largura (em < md a expandida
sobrepõe-se ao conteúdo com véu); estado no cookie `gespro-barra-lateral`, lido pelos layouts. Grupos no carril
abrem um `DropdownMenu` (rato, toque e teclado). ⌘B/Ctrl+B alterna.

**Modo de leitura (ADR-0027 §6, ADR-0032)** — uma `Assinatura` que sai de `TRIAL`/`ATIVA` passa por
`LEITURA` durante 30 dias (`leituraFim`) e só depois `FECHADA`; nada se apaga nunca. Em Leitura a
**sessão abre** e a **escrita não passa**: o `createSafeAction` e o `withApi` recusam com
`ACESSO_LEITURA`. Consequências ao escrever código novo:
- Uma action de **leitura** (`listar*`/`obter*`/`procurar*`) tem de declarar `permiteEmLeitura: true`,
  senão o cliente em Leitura nem consegue ver o que é seu. O gate `gate-leitura` recusa qualquer
  action sem `revalidate` que também não declare a bandeira — a omissão não é decisão.
- **Pagar e exportar nunca se travam.** As exportações são `GET`, logo passam sozinhas; as três
  actions de subscrição declaram a bandeira de propósito.
- O estado de acesso vem da **sessão** (`session.user.acesso`), re-resolvido no intervalo do
  ADR-0011 — nunca se lê a `Assinatura` por pedido.
- `ConfiguracaoFiscal.statusAtivo` está **morto**: não é lido nem escrito por ninguém (cai com o
  `planoAssinatura` no ticket #38). Os dois donos do acesso são `Assinatura.estado` e
  `Tenant.deletedAt`, e quem os arbitra é `estadoDeAcesso()`, em `lib/state-machines.ts`.
- `EXPIRADO`, `SUSPENSA` e `CANCELADA` continuam no enum e **não se escrevem** — só existem por
  causa de linhas antigas.

**Notificações fora do `notificacao.service.criar()`** — quem escreve notificações dentro de uma
`$transaction` não pode fazer I/O externo lá dentro: persiste com `createManyAndReturn`, guarda os
ids e chama `despacharNotificacoes(ids)` **depois do commit**. Sem isso ficam `PENDENTE` para
sempre — nada as varre, e foi assim que os avisos de subscrição nunca saíram durante duas waves.

**Agendador** — nada no repositório chama as rotas `/api/cron/*` em produção (não há produção,
ADR-0026 §5). Localmente é o serviço `cron` do compose (perfil `full`); o contrato — rotas,
horários, `CRON_SECRET` — está em `docs/runbooks/agendador.md`. Uma rota `/api/cron/*` nova entra
nos dois sítios ou não corre em lado nenhum.

**Auditoria só vê escritas singulares** — a `audit-extension` intercepta `create`/`update`/`delete` de
**uma** linha. `upsert`, `createMany`, `updateMany` e `deleteMany` passam **sem `AuditLog`**, mesmo em
modelos listados em `AUDIT_MODELS`. Uma escrita que tem de ficar no trilho usa `findFirst` + a operação
singular (ex.: `definirContaNaturezaNotaDebito`).

**Páginas-protótipo que parecem reais** — algumas páginas antigas são `'use client'` e leem/escrevem
`localStorage` em vez da base (tabelas vazias, «guardado» que ninguém lê). Antes de corrigir um sintoma numa
página, confirma que ela chega ao servidor: `git grep -l localStorage -- 'apps/erp/src/app/**/page.tsx'`
(hoje: `balancete/nova` — «Salvar» ainda é fictício — e `projetos/lista/{novo,[id]/editar}`). Os tipos de
`src/types/contabilidade.ts` são desse protótipo; os reais estão nos `*.interface.ts` dos serviços.

**Gates de CI** (`pnpm gates`, `apps/erp/scripts/gate-*.mjs`) — cinco, e falham o merge se houver: `Dialog` fora de `AlertDialog`, `'use client'` em `page.tsx` de listagem/detalhe, imports de `@/data/` em `src/app`, Server Actions que não declarem o que fazem em Leitura, ou escrita directa em `Lancamento`/`PartidaLancamento` fora do `contabilidade.service.ts` (`gate-periodo`, que varre `src/` **e** `prisma/`). Manter a zero.

## Convenções detalhadas (normativas)

As skills em `.claude/skills/` são a fonte de verdade e devem ser lidas antes de mexer nas respectivas áreas:
- `prisma-conventions` — modelação (tenantId, Decimal, enums SCREAMING_SNAKE, índices, soft delete, seeds, migrations).
- `api-conventions` — Server Actions, serviços, `withApi`, validação Zod, hierarquia `AppError`.
- `ui-conventions` — padrão sem-modais, patterns, tokens, Server Components, formulários.
- `fiscalidade-mz` — INSS, IRPS, tabelas versionadas por vigência e integração contabilística do payroll.
- `fluxo-de-caixa-conventions` — tesouraria vs caixa, projecção derivada, rubricas e mapeamento da DFC, articulação e invariantes (ADR-0036, ADR-0037).

Disciplinas transversais, adaptadas dos padrões de [mattpocock/skills](https://github.com/mattpocock/skills):
- `tdd` — vermelho-verde-refactor; quando é property test e quando é exemplo.
- `diagnosing-bugs` — observar, reduzir, hipotetizar, instrumentar, corrigir; tabela dos suspeitos habituais desta casa.
- `domain-modeling` — fixar vocabulário antes do código; a coluna «não é» é a que trabalha.
- `revisao-dois-eixos` — conformidade e fidelidade ao spec, revistas em separado.
- `tracer-bullet-tickets` — fatias finas com gate executável; `[BLOCKING]` e `[HUMANO]`.

## Deploy (spec 16)

`Dockerfile` multi-stage (`output: standalone`, não-root, HEALTHCHECK em `/api/health`); `docker-entrypoint.sh` corre `prisma migrate deploy` antes de arrancar. IaC em `infra/` (Terraform: App Runner + RDS + Secrets Manager). **Zero segredos no repo** — `.tfvars`/`.tfstate` são git-ignored; segredos em runtime via Secrets Manager. CI/CD em `.github/workflows/ci.yml` (spec 15).

## Referência

Especificações e histórico do programa: `.kiro/specs/` — backend Waves 0–3 e UI Waves 0–2 em `{01,02,03}-*`; funcionalidades em falta em `04-09` (reconciliações, payroll, recrutamento, benefícios); funcionalidades + produção em `10-17` (encomendas/devoluções, projetos, relatórios/PDF, notificações, observabilidade, CI/CD, infra, segurança). Decisões de arquitectura: `docs/decisions/` — índice canónico e próximo número livre em `docs/decisions/README.md` (**três ADRs da Wave 5 colidem no nº 0005**; por decisão do ADR-0023 **não são renumerados** e citam-se como `ADR-0005-a/-b/-c`). Wave 8 (prontidão para produção): ADR-0010 a 0025, com plano de execução em `docs/handoff/execucao-paralela-w8.md`. Ciclo contabilístico e fiscal: ADR-0033 (exercício/períodos), 0034 (apuramento do IVA) e 0035 (encerramento) — **os três estão `Proposto`**, o 0034 à espera de confirmação legal (issue #64); marcá-los `Aceite` é um acto humano. Contratos de domínio, mapa entidades↔conflitos e handoffs por spec: `docs/handoff/`. Estado operacional (fonte de verdade do que está feito e da dívida): `docs/status.md`.

## Agent skills

### Issue tracker

Issues no GitHub (`fxavier/gespro-frontend`), via `gh`. PRs externos **não** entram na fila de
triagem. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário canónico — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`. Ver `docs/agents/triage-labels.md`.

### Domain docs

Contexto único: `CONTEXT.md` na raiz. **ADRs em `docs/decisions/`, não em `docs/adr/`** —
numeração governada pelo ADR-0023. Ver `docs/agents/domain.md`.

### Loops e grafos

Todo o trabalho executado por agentes segue `docs/agentic/00-doutrina-loop-e-grafo.md`: cada nó
declara objectivo, verificador **externo**, condição de paragem (3 iterações) e quem tem veto. A
prova vem de fora do sistema — invariante, golden fixture, processo real (`pnpm check`/`gates`/
`e2e`) ou humano; a opinião de um agente nunca é prova. Quem escreve o oráculo não é quem escreve a
implementação, e um agente autor que altere `__tests__/` ou `fixtures/` é BLOCKER automático.

Primeiro grafo a seguir a doutrina: `docs/agentic/grafo-22-fluxo-de-caixa.md` (spec 22), com os
prompts literais em `docs/agentic/prompts-22-fluxo-de-caixa.md`.

Grafos por ADR vivem em `.claude/grafos/<grafo>.md` (tabela de nós com estado e dependências, «Leitura
obrigatória» e âmbito por nó) e correm-se com `/no <grafo> <nó>` (`.claude/commands/no.md`: INSPECT → PLAN →
IMPLEMENT → TEST → REVIEW em subagente sem contexto → FIX → VERIFY → DONE, com relatório de INSPECT ao
utilizador antes do PLAN). Handoff de cada nó em `docs/handoff/<grafo>-<nó>.md`; o de ADR-0038 usa
`docs/handoff/adr-0038-*.md`. A skill `estado-com-escritor`, citada pelo `/no` e por vários ADRs, **não
existe** — aplica a definição por extenso: estado lido por um predicado de decisão tem escritor em produção e
teste da transição nos dois sentidos, contra um duplo com estado.
