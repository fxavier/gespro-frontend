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
npx vitest run -c vitest.integration.config.ts test/integration/venda-pos-documento.test.ts   # um só (a partir de apps/erp)
```

Os testes em `test/integration/` montam o tenant com o `bootstrapContabilidade` real (plano, séries, diários,
Consumidor Final) e só dobram o `@/lib/auth` (`vi.hoisted` mutável quando o caso precisa de e-mail por confirmar).
Os `__tests__` em `src/` que tocam a base correm **contra a base local** dentro do `pnpm check` — limpam o tenant
descartável no `afterAll` (o `ContaPGC` apaga-se nível a nível, do mais fundo para cima: o plano vai ao nível 7).

Os E2E do ERP (`e2e`, `a11y`) correm um projecto `setup` que **reescreve `apps/erp/playwright/.auth/admin.json`**
com uma sessão fresca; depois de qualquer corrida, `git checkout -- apps/erp/playwright/.auth/admin.json`.
O ficheiro versionado tem uma sessão expirada — um script ad-hoc com esse `storageState` cai no login;
corre `npx playwright test --project=setup` primeiro, **numa invocação à parte** — juntar ficheiros a um
comando com `--project=setup` corre só o setup («No tests found»).
Para correr os E2E contra outro servidor (ex.: worktree na 3109) o `BASE_URL` não chega: o `webServer.url` do
`playwright.config.ts` está fixo em `:3000`, e o `reuseExistingServer` só olha para essa porta (arranca ou reutiliza o
da 3000). Usa um config temporário dentro de `apps/erp/` — `import base from './playwright.config'; export default
{ ...base, webServer: undefined };` — e `BASE_URL=http://localhost:3109 npx playwright test -c <cfg> --project=e2e …`
(o projecto `e2e` corre o `setup` como dependência). O `next dev` gera `apps/erp/AGENTS.md` e `apps/erp/CLAUDE.md`
não versionados — não os commites. Relatório HTML com trace
de cada passo: `npx playwright show-report` (em `apps/erp/playwright-report/`). Os E2E que concluem vendas
(`27-pos-documento-fiscal`) e os que emitem ou pagam documentos (`13` encomendas, `38` nota de débito, `40`/`41`
facturas paga e vencidas, e quase todos os `42-…` a `55-…` das lacunas — cada um diz no cabeçalho o que deixa) deixam
documentos no tenant `demo` a cada corrida — e a sentinela do `projecao.golden` acusa; os de lançamentos (`24`, `32`) deixam
rascunhos de 1,00 MT (SQL de limpeza no cabeçalho do `32`). Em combobox, o campo `Pesquisar…` tem de ter âmbito
no popover aberto — `page.locator('[data-radix-popper-content-wrapper]').last()` —, senão, durante os ~150 ms da
animação de fecho do anterior, há dois e o modo estrito falha. Corrige-se o locator, nunca a animação nem o produto.
O E2E 36 regista um tenant por corrida; o limite do `/registo` (3/h por IP) só o deixa passar porque o
`playwright.config.ts` arranca o servidor com `RATE_LIMIT_REGISTO_DESLIGADO=1` (lida pela porta de rate-limit,
**ignorada com `NODE_ENV=production`**). Um servidor já a correr (`reuseExistingServer`, outra porta) precisa
da variável no próprio arranque. O spec limpa o tenant que criou no `afterAll` (`e2e/helpers/db.ts`).

```bash
# Desempenho (ADR-0018) — cenários k6, planos de execução e a linha de base
ls perf/k6 perf/sql perf/explain     # os cenários e as consultas medidas
cat perf/README.md                   # como correr e como ler os resultados
```
O `k6` não está instalado no host: usa a imagem `grafana/k6:0.57.0` (alvo `host.docker.internal`). Antes da primeira
corrida, os utilizadores de carga têm de existir no realm local (`partialImport` de `infra/keycloak/perf-users.json`,
o passo de `.github/workflows/perf.yml`) e o `perf/.generated/seed-manifest.json` tem de vir de um `pnpm db:seed:volume`
posterior à #240 — sem isso o `setup()` do k6 cai em `CredentialsSignin`. `next start` exige `KEYCLOAK_CLIENT_SECRET`.

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

Na suite E2E completa (`workers: 1`, `timeout: 30_000`) cai quase sempre **um** teste por corrida, e nem sempre o mesmo: com o `pnpm dev` a compilar rotas à medida, uma rota fria estoura o tecto. Antes de culpar uma alteração, corre o ficheiro sozinho. Falha conhecida e alheia ao código: `e2e/07-sessao.spec.ts:60` precisa de `AUTH_SESSION_MAX_AGE=8`, que só se aplica quando é o Playwright a arrancar o servidor (`reuseExistingServer`). `e2e/21-nc-proforma-cotacao.spec.ts:84`
(cancelar NC, `waitForURL` estoura) falha também no `main` desde 2026-10 — por investigar, não é regressão de quem o vê.

**Golden fixture da spec 22** (`src/server/services/financas/__tests__/projecao.golden.test.ts`) corre dentro do
`pnpm check` contra a **base local** e falha de propósito quando o tenant `demo` não é o do seed: basta um
compromisso de tesouraria criado à mão, ou um lançamento gravado na conta 123 (Standard Bank), para o `check`
ficar vermelho sem nenhuma alteração de código. A mensagem diz «a base tem resíduos»: limpa o resíduo, ou
re-deriva a fixture à mão (handoff da spec 22) — nunca `vitest -u`.

**Scripts ad-hoc de smoke** (Playwright fora da suite): o pacote instalado é `@playwright/test` (não
`playwright`), e o script tem de viver dentro de `apps/erp/` para o resolver. Em `pnpm dev`, espera
`networkidle` antes de escrever num campo: preencher antes da hidratação muda o DOM e não o estado do React,
e o teste afirma sobre valores que a página nunca usou. Para a sessão, importa `loginAs(page, USERS.admin)` de
`e2e/helpers/auth` e dá ao script um config mínimo com `use: { baseURL }` — `--config=/dev/null` rebenta com `EBADF`.

Um segundo ERP a partir de uma worktree (ao lado do `pnpm dev` na 3000) precisa do `apps/erp/.env` copiado,
`pnpm install --prefer-offline`, **`npx prisma generate`** (sem ele o `tsc` acusa modelos inexistentes) e da sessão
apontada à porta nova: `AUTH_URL=http://localhost:3108 NEXTAUTH_URL=… NEXT_PUBLIC_APP_URL=… npx next dev -p 3108`.
A base e o Keycloak são os mesmos — o que o smoke gravar fica no tenant `demo` de todos. Testes que leem a base
com `pg` directo: as colunas `DateTime` são `timestamp` **sem** fuso e o `pg` interpreta-as na hora local da
máquina — compara com literais SQL (`timestamp '2099-01-01 00:00:00'`, `to_char(…)`), nunca com `Date` do JS.

**PRs empilhados**: fazer merge de um PR cuja base é outro branch de feature leva-o para **esse** branch, não
para o `main`. Apaga o branch da base no merge (o GitHub reaponta os seguintes) ou muda a base para `main`
antes do merge — senão as fatias ficam presas em branches intermédios e o `main` mostra a UI antiga.
Aconteceu três vezes numa só semana (#387, #403, #404 tiveram de ser reabertos). Por isso, mesmo quando um branch
parte de outro, o PR abre-se **sempre com base `main`** e a dependência fica escrita no corpo («faz merge do #X
primeiro»); confirma no fim com `git merge-base --is-ancestor <head do PR> origin/main`.

**Dois PRs verdes não fazem um `main` verde**: cada PR corre os seus testes, mas uma regra nova pode partir um teste
antigo de outro módulo (o #401 passou a recusar o pro rata com saídas a 0% e partiu
`test/integration/pos-contabilidade-ponta-a-ponta.test.ts`, que vendia uma linha a 0%). Antes de entregar uma regra
de negócio, corre a suite de integração **inteira** (`npx vitest run -c vitest.integration.config.ts`, ~15 min),
não só o ficheiro novo. Com a máquina carregada (várias worktrees com `next dev` e Testcontainers), testes unitários
pesados como `reconciliacao/__tests__/extracto.parser.test.ts` estouram o tecto de 5 s — repete-os com a máquina
livre antes de culpar o código.

Dois avisos do mesmo género: (1) uma **resolução de conflito** num merge pode deixar o `main` sem compilar mesmo
com os dois lados verdes (o merge do #621 deixou uma função importada **e** declarada e JSX duplicado) — depois de
resolver conflitos, corre `tsc --noEmit` antes do push; (2) os unitários em `src/**/__tests__` dobram o `tx` à mão:
uma tranca nova (`tx.$queryRaw` com `FOR UPDATE`) parte-os com `tx.$queryRaw is not a function` — corre os unitários
do módulo, não só a integração. Ajustar esse duplo é alterar um oráculo (doutrina: verificador distinto).

**Shell do agente é zsh**: `$VAR` sem aspas **não** se parte em palavras (`vitest run $FICHEIROS` passa um
único argumento) — usa um array `F=(a b); … "${F[@]}"`. O `psql` não está instalado no host e o utilizador
do Postgres não é `postgres`:
`docker exec gespro-db psql -U "$(docker exec gespro-db printenv POSTGRES_USER)" -d "$(docker exec gespro-db printenv POSTGRES_DB)" -c '…'`.

**Docker pendurado / disco cheio**: o `gespro-db` arquiva WAL com `test ! -f <arquivo>/%f && cp …`. Uma cópia
interrompida deixa um ficheiro de 0 bytes no arquivo e, a partir daí, o arquivamento falha para sempre, o Postgres
deixa de reciclar WAL e o `pg_wal` cresce até encher o disco (já chegou a 247 GB). Sintoma: «archive command
failed» nos logs. Ver `du -sh $PGDATA/pg_wal` e `pg_stat_archiver`. Recuperação usada em 2026-09 (perde o PITR
desde o bloqueio, que já estava partido): no contentor, `archive_status/*.ready` → `*.done`, apagar o ficheiro de
0 bytes do arquivo, `CHECKPOINT`, confirmar que `pg_switch_wal()` arquiva, e nova cópia base com
`infra/local/scripts/backup-base.sh`. Os runbooks (`docs/runbooks/restauro-bd.md`) só cobrem o restauro.
Outro modo: o **daemon** do Docker Desktop pendura (`docker info` sem resposta) com as portas 5432/8081 ainda a
responder — o `next dev` funciona, mas os Testcontainers ficam presos em «RUN» para sempre. O `quit` do Docker
Desktop não chega; termina o `com.docker.backend`, reabre o Docker e faz `docker compose up -d` — o `gespro-db` e
o Keycloak não voltam sozinhos. Confirma depois o `pg_stat_archiver` (acima).
Terceiro modo, com o arquivamento **saudável**: o volume `gespro_gespro-walarchive` não tem retenção e cresce com cada
seed, suite e E2E (chegou a 299 GB em 2026-10; o disco encheu e o daemon pendurou). Ver `docker system df -v`.
Poda: `./infra/local/scripts/backup-base.sh` (cópia base nova), depois no contentor
`pg_archivecleanup -n /var/lib/postgresql/wal-archive <label>.backup` (ensaio) e sem `-n`, com o `.backup` mais
recente (`ls -t *.backup | head -1`); confirma com `pg_switch_wal()` que o arquivamento continua. Perde-se o PITR
anterior a essa cópia. O espaço volta ao Mac aos poucos (o `Docker.raw` é esparso).

### Migrations — só o orquestrador, e **não-interativas**
Todo o `npx prisma …` corre a partir de `apps/erp/` (é lá que estão `prisma.config.ts` e o schema); na raiz
falha com «Could not find Prisma Schema». Da raiz: `pnpm --filter erp exec prisma generate`.
`pnpm db:migrate:dev` (`prisma migrate dev`) exige TTY e **rebenta em ambiente não-interactivo**. Para gerar uma migration a partir do delta schema↔DB sem prompts:
```bash
mig="prisma/migrations/$(date +%Y%m%d%H%M%S)_<nome>"; mkdir -p "$mig"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script > "$mig/migration.sql"
npx prisma migrate deploy
```
Renomear (valor de enum **ou coluna**): o `migrate diff` gera **drop+create** e perde os dados — escreve à mão `ALTER TYPE "X" RENAME VALUE 'A' TO 'B';` ou `ALTER TABLE "T" RENAME COLUMN "a" TO "b";` (renomeia também a constraint: `ALTER TABLE "T" RENAME CONSTRAINT …`, senão o próximo `migrate diff` vê deriva) e marca com `prisma migrate resolve --applied <migration>`. Confirma no fim que `migrate diff --from-config-datasource --to-schema prisma/schema --script` devolve *empty migration*. Em produção usa **sempre** `migrate deploy`, nunca `migrate dev`.

Várias worktrees partilham a **mesma** base local: uma migração aplicada numa worktree fica aplicada para todas, e o
`migrate diff` de outra worktree (sem esse ficheiro) vê-a como deriva. Migrações de **dados** (permissões por papel,
séries para tenants existentes, natureza de contas) escrevem-se à mão e não precisam do `diff`. Ramos paralelos
usam carimbos de data **distintos** — dois `20261009120000_*` com nomes diferentes funcionam (ordenam pelo nome), mas
é sorte, não regra. Adicionar um valor a um enum e usá-lo exige **duas** migrações (`ALTER TYPE … ADD VALUE` não pode
ser usado na mesma transacção) — precedente: `20261007160000_serie_troca_enum` + `20261007160100_serie_troca_tenants`.

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
- **D/finanças expõe também (ADR-0041)**: `emitirDocumentoEmTx` (núcleo da emissão, na tx do chamador; `FATURA_RECIBO` nasce `PAGA`) e `construirLancamentoVendaPOS` (D meio de pagamento / C 711 / C 44331) — chamados pelo `faturacaoService` injectado, nunca por import do módulo.
- Fluxos ligados: venda/POS→stock+caixa+documento+contabilidade · recepção→stock+conta a pagar · factura→contabilidade · produção→consumo/entrada de stock.
- **O que (não) lança na contabilidade, do lado das vendas**: factura e nota de crédito
  lançam D 411 / C 711 / C 44331 (diário de vendas); a **encomenda convertida em venda** emite documento como o POS
  (`emitirDocumentoEmTx`, Factura-Recibo ou Factura, #563). A **nota de débito** credita a conta da sua **natureza**
  (ADR-0039 §1): `contaCreditoId` escolhida no acto ?? omissão do tenant (`ContaNaturezaNotaDebito`, ecrã
  `/contabilidade/configuracoes/naturezas-nota-debito`: 711 acerto de preço, 781 juros, 769 penalização; despesas
  repercutidas — classe 6 — e outro não têm omissão → `CONTA_CREDITO_OBRIGATORIA`). A validação da conta é
  `validarContaParaNatureza`, partilhada com o ecrã — não a dupliques. A **venda POS** (ADR-0041) emite, na mesma tx, Factura-Recibo
  (paga, série `FATURA_RECIBO`, nasce `PAGA`) ou Factura (parte a `CREDITO`: `EMITIDA`/`PARCIALMENTE_PAGA`, a venda nasce `FATURADA`) e
  lança D meio de pagamento (111 dinheiro · 411 crédito · conta do meio em `/contabilidade/configuracoes/meios-pagamento-pos`,
  omissão 121) / C 711 / C 44331; só o `DINHEIRO` entra na caixa. O **recebimento de facturas**
  (`registarPagamento`, ecrã `/faturacao/[id]/pagamento`) lança D conta do meio / C 411 (origem `PAGAMENTO`,
  `documentoOrigemTipo 'Fatura'`, meio por `resolverContaMeioPagamento`; numerário também `RECEBIMENTO` na caixa) —
  logo uma factura tem **vários** lançamentos com o seu id como origem: o da emissão lê-se por `Fatura.lancamentoId`,
  nunca por `documentoOrigemId`. Continua a **não** lançar o **custo das vendas** (a baixa de stock não
  faz D 61 / C 32 — ADR-0041 §9). As vendas POS anteriores ao ADR-0041 não têm documento nem lançamento.
- **Venda POS — armadilhas (ADR-0041)**:
  - Σ pagamentos = total ao cêntimo, verificado no início de `vendaService.criar` (`PAGAMENTOS_NAO_BATEM_TOTAL`);
    o total vem de `calcularTotaisVendaPOS` (`lib/vendas-totais.ts`), o **mesmo** que o terminal usa — não recalcules
    noutro sítio, senão o terminal manda um total que o servidor recusa.
  - O **Consumidor Final** (`CLIENTE_CONSUMIDOR_FINAL`, `CF-000000`) é cliente técnico de cada tenant (bootstrap +
    migração): venda sem cliente factura contra ele; `cliente.service` recusa editá-lo/desactivá-lo
    (`CLIENTE_TECNICO_PROTEGIDO`) e o crédito recusa-o (`CLIENTE_OBRIGATORIO_CREDITO`).
  - Venda com documento só sai por **nota de crédito** (`anular` ou devolução): `transitar` recusa `CANCELADA`/`DEVOLVIDA`
    com `VENDA_COM_DOCUMENTO`.
  - `emitirDocumentoEmTx`, `emitirNotaCreditoEmTx` e `liquidarNotaCreditoEmTx` (e `devolverNotaCreditoPelosMeiosOriginaisEmTx`)
    são os **núcleos** em tx: não verificam o e-mail. O travão `exigirEmailConfirmadoParaEmitir` fica com o chamador que
    tem sessão, **antes** da tx (abertura da sessão POS, `vendaService.anular`, `devolucaoService.processar`, `trocaService.criar`, os wrappers públicos).

### Camadas transversais (envelopam, não alteram contratos)
- **Observabilidade** (`src/server/observability/*`, `instrumentation.ts`) — logger estruturado com redacção de segredos/PII, `requestId` num `AsyncLocalStorage` **separado** do tenant, métricas RED. `withApi`/`createSafeAction` estão envelopados: erros inesperados devolvem `traceId` sem stack ao cliente. `/api/health` (liveness), `/api/ready` (SELECT 1), `/api/metrics` (protegido por `METRICS_SECRET`).
- **Segurança** (`src/proxy.ts`, `src/lib/security/headers.ts`, `src/lib/api/cors.ts`) — CSP com nonce por pedido (report-only por omissão; `CSP_ENFORCE=true` em prod só após smoke), HSTS/X-Frame/nosniff/Referrer/Permissions; CORS por allowlist (`ALLOWED_ORIGINS`), **nunca wildcard**; rate-limit em reset/convite/exports. `src/proxy.ts` (convenção `proxy` do Next 16, runtime Node — um só ficheiro, em `src/`, que o `next dev` e o `next build` encontram; o `config` não declara `runtime`) é o **único** dono dos headers de segurança e dos paths públicos.
- **Documentos/exportação** (`src/lib/documents/*`, `src/lib/reporting/*`) — PDF fiscal via `@react-pdf/renderer` (**só runtime Node**, nunca no cliente) que **reflecte** o documento emitido (append-only, nunca recalcula); export CSV/XLSX com `Decimal`→string lossless. Servidos por Route Handlers (`withApi`), nunca Server Actions.
  O layout do `@react-pdf` é **CPU síncrona no pedido** (~3,7 ms por linha de tabela; 500 linhas ≈ 2 s com a instância
  parada para todos) — relatórios longos levam tecto de linhas (ex.: balancete, 422 acima de 3000). Paginação por N
  linhas fixas só bate com «Página x de N» se nenhuma célula partir linha (`maxLines: 1, textOverflow: 'ellipsis'`).
  A sessão (`auth()`) **não** traz nome nem email do utilizador: para «emitido por», lê o `User` pelo `ctx.userId`.
- **Notificações** (`src/server/services/plataforma/notificacao.service.ts`, `src/server/email/*`) — padrão "persistir-depois-enviar": grava `Notificacao` (estado `PENDENTE`) dentro da tx, envia email como efeito colateral **fora** da tx; porta `EmailProvider` (smtp/noop).

### UI
- **Golden standard**: `src/app/(dashboard)/compras/requisicoes/**` — o molde a replicar (lista SC + `@panel`/`(.)[id]` + detalhe com tabs + `novo`/`[id]/editar`). **Nota:** o interceptor `@panel/(.)[id]` captura também o segmento literal `novo` (o rewrite de intercepção é `/<lista>/:id`; um `(.)novo` estático interceptaria na mesma). Devolver `null` em vez de `notFound()` tira o 404 mas **não chega**: a navegação client-side fica na listagem, porque o `children` não muda numa rota interceptada. O molde resolve com `_components/abrir-rota-real.tsx`: quando o id é `novo`, o painel faz um carregamento completo de `/<lista>/novo` (que não é interceptado). Ao replicar, copia o par painel + `AbrirRotaReal`, e prova o `novo` com E2E contra `next start` — em `pnpm dev` aquecido o defeito não aparece.
- `src/components/patterns/*` — biblioteca única (PageHeader, DataTable, FilterBar, StatusBadge, KpiCard, DetailShell, FormPage, Stepper, UnsavedChangesGuard…). Compor a partir daqui, não dos primitivos `ui/`.
- `StatusBadge` usa um **mapa único** status→variante (`patterns/status-badge.tsx`); proibido mapa local. Estado sem entrada no mapa aparece **em bruto** (`LANCADO`) — ao introduzir um estado novo, regista-o lá.
- Escolher uma entidade: `Combobox` (filtro local) ou `ComboboxRemoto` (pesquisa no servidor, com atraso e sem corridas) — nunca um campo de texto para colar um id. Acima de uma página de registos é `ComboboxRemoto`, senão os registos fora da primeira página ficam inalcançáveis
  (foi assim com as contas do lançamento, #87, e a conta-mãe, #344). O `ComboboxRemoto` **nunca** chama `procurar('')`:
  sem `opcoesIniciais` abre vazio, e em edição sem a opção escolhida mostra o campo em branco. A página passa a
  primeira página (`take: 50`) fundida por id (`Map`) com o registo já escolhido. Subir o `take` e voltar ao
  `Combobox` local não é correcção — é o mesmo tecto, escondido.
- `TableSkeleton` (patterns) é uma **tabela completa**, para `<Suspense fallback>`; dentro de um `<tbody>` usa-se `LinhasSkeleton`. Linhas `<tr>` soltas dentro de uma `<div>` são HTML inválido e dão erro de hidratação.
- `Select` com valor inicial: passa o rótulo como filho — `<SelectValue placeholder="…">{opcaoEscolhida?.label}</SelectValue>`. O Radix só resolve o texto do item **depois** de a lista abrir; sem isto o campo aparece vazio apesar de haver valor escolhido.
- Filtros de listagem: a `FilterBar` escreve no URL (`searchKey="termo"`, `filters[].key`), a página faz `safeParse`
  com um schema `Filtro*UrlSchema` que estende o `Filter*Schema` de `lib/validations` — e o Zod **descarta em silêncio**
  as chaves que o schema não declara. Um filtro novo tem de entrar nos três elos (schema, chamada da página, `where` do
  serviço), senão a caixa escreve no URL e a lista não muda, sem erro nenhum (aconteceu a serviços, #545, e a
  agendamentos, #585). Pesquisa de texto = `OR` de `contains` com `mode: 'insensitive'`; prova-se com teste de
  integração que lista com e sem o termo.
- `SelectItem` (ui) **descarta** items com `value=""` — a opção nunca aparece. Para «Todos/Nenhum» usa uma sentinela (`'todos'`) e traduz ao construir o URL.
- Client Component que inicializa estado com `useState(prop)` (ex.: selectores de filtros) **não é remontado** quando um `router.push` muda só os search params — nem com `key` diferente. O estado fica com o valor antigo enquanto a página mostra o novo. Sincroniza durante o render (padrão React «ajustar estado quando uma prop muda»: guarda a chave anterior em estado e repõe quando difere), não com `useEffect`+`setState` (o lint recusa).
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

**Zod 4 (#625)** — o projecto está em zod 4 e `@hookform/resolvers` 5; três mudanças silenciosas têm helper em
`src/lib/validations/common.ts`, usa-os:

- `required_error`/`invalid_type_error`/`errorMap` são **ignorados** (a mensagem sai «Invalid input: expected …»):
  passa `erroDeTipo('Campo obrigatório', 'Valor inválido')` como segundo argumento do construtor.
- `.partial()` passou a **aplicar os `.default()`** às chaves em falta — uma edição parcial grava `ativo: true`,
  `status`… sem o utilizador lhes tocar. Usa `parcial(schema)`; recusa na construção as formas em que o default ainda
  vazaria (`.default().optional()`, `.default().transform()`, `.default().refine()`).
- `.multipleOf(0.01)` passou a aceitar `0.1 + 0.2`: dinheiro é `dinheiro()` (ou `duasCasas()` para encadear).
Formulário com coerção/transform: `useForm<z.input<typeof S>, unknown, z.output<typeof S>>`. Oráculo das mensagens
pt-PT: `src/lib/validations/__tests__/zod4-oraculo-625.test.ts`.

**Séries de documento** — ao estender o enum `TipoSerieDocumento`, acrescenta a série a `SERIES_INICIAIS` (`src/server/provisioning/tenant-bootstrap.ts`). O número é atribuído dentro da transacção: sem série, a operação inteira falha com «série activa não encontrada» em **todos** os tenants. Aconteceu a encomendas, devoluções e contagens de stock.

**Permissões novas** — acrescentar uma permissão a `prisma/seed/rbac.ts` não a liga a papel nenhum nos
tenants que já existem: é preciso correr `pnpm db:seed` (aditivo, não destrói nada). Sem isso a
funcionalidade fica completa e o utilizador — o ADMIN inclusive — vê «Sem permissão».

O **número** nunca se inventa, nem em seeds nem em testes: sai de `SerieDocumento.proximoNumero` e a série
fica avançada. Escrever `FAT/2026/000007` à mão porque «é o próximo» põe o primeiro documento criado pela UI
a colidir no `@@unique([tenantId, numero])` — e o erro aparece ao utilizador, não a quem semeou.

**UI** — **sem modais**: criar/editar/detalhar são rotas dedicadas; única excepção é `AlertDialog` para confirmação destrutiva (confirmar, não recolher dados: um campo de texto é formulário, logo é rota). Zero cores hardcoded (só tokens `@theme`); dark mode obrigatório.

**Build de produção (`output: 'standalone'`)** — apanha o que `pnpm check` e `pnpm dev` não apanham: `useSearchParams()`/`usePathname()` sem `Suspense` boundary partem o prerender (envolve o componente em `<Suspense>`). Corre `pnpm build` antes de entregar mudanças de deploy/routing. O `pnpm start` fixa `--port 3000`; para smoke numa porta livre usa `npx next start -p <porta>`. Em produção (`next start`/standalone) o servidor responde 500 a todos os pedidos (`/api/health` incluído, logo o health check não deixa a instância entrar ao serviço) sem `RATE_LIMIT_DRIVER=valkey` + `VALKEY_URL` (#552); para um smoke de instância única sem Valkey, `RATE_LIMIT_MEMORIA_EM_PRODUCAO=1`.

**Proxy e probes** — `src/proxy.ts` redirige pedidos não-autenticados para `/auth/login`. Endpoints que têm de responder sem sessão (`/api/health`, `/api/ready`, `/api/metrics` para o HEALTHCHECK do Docker/App Runner; `/api/auth/*`) **têm de estar em `PUBLIC_PATHS`** — senão os health checks recebem 307 em vez de 200.
O proxy vive **em `apps/erp/src/`** e só aí: com a app em `src/app`, o `next dev` só procura `src/proxy.ts`,
enquanto o `next build` também o encontrava na raiz de `apps/erp`. Um proxy fora de `src/` dá dev, E2E e smokes sem
cabeçalhos nem redireccionamentos e produção com eles — foi assim até ao #530/#540.

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
falhar, o defeito está no JSON, não no teste. A classe 4 não tem regra única: é **conta a conta** (#295) —
`CREDORA` (logo `PASSIVO`) em 419, 42x excepto 429, 43x, 442, 4433, 44342, 4436, 449, 46x, 47x, 48x, 491 e 492;
o resto `DEVEDORA`, incluindo as ambíguas 441, 4435, 445 e 446. Os tenants antigos foram corrigidos pela
migração `*_natureza_classe_4`; o `scripts/extract-pgc.mjs` só reproduz o JSON, que é a fonte.

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
- Leitores **por datas** (DRE, razão, DFC, projecção) excluem o período 13 e o diário de abertura automático (e o
  seu estorno) com `FORA_DE_FECHO_E_ABERTURA` / `sqlForaDeFechoEAbertura` (`fora-de-fecho-e-abertura.ts`); sem isso o
  apuramento do resultado (6/7→81/82→88) anula a DRE do ano e a abertura duplica os saldos. As vistas **por período**
  usam o AB — não lhes apliques o filtro.
- Mapas, balancete, razão e DRE filtram lançamentos por `FILTRO_LANCAMENTO_MAPA`
  (`LANCADO` + `ESTORNADO`), exportado do serviço — nunca um literal local, que foi como quatro cópias
  divergiram.
- Uma data `aaaa-mm-dd` que entra por `z.coerce.date()` fica à **meia-noite UTC**; como `dataFim` num
  `lte`, deixa de fora os lançamentos do próprio último dia. As páginas de mapas por datas (DRE, razão)
  passam as datas por `intervaloDoDiaMaputo` (`lib/periodo-fiscal.ts`) antes do schema: início às
  00:00 e fim às 23:59:59.999 de Maputo.
- Os limites de `PeriodoContabil` são **instantes** de Maputo (o início de Março é `2026-02-28T22:00Z`):
  `toISOString().slice(0,10)` dá o dia errado. Para dias civis no cliente, `intervaloDiasDosPeriodos`
  (`lib/periodo-fiscal.ts`, `Intl`); `diaCivilEmMaputo` vive no serviço `server-only`.
- **Balancete (ADR-0040)** — dois caminhos, não os confundas:
  - `gerarBalancete` (movimento por datas, saldo com sinal pela natureza, só folhas, «desde sempre») é o
    **contrato da DFC** — não se mexe; os golden/duplo da DFC estão protegidos.
  - O ecrã `/contabilidade/balancete` usa `gerarBalanceteVerificacao` (movimento por **período** do
    lançamento; acumulado do exercício + abertura implícita enquanto não houver diário AB) →
    `hierarquizarBalancete` (roll-up por `contaMaeId`, nunca por prefixo; ciclos e órfãs tratados como cadeia
    partida) → `filtrarBalancete` (contexto pela `maeMostradaId`). Página e exportação (`/api/contabilidade/
    balancete/export`, CSV/XLSX/PDF) partilham `lerParametrosBalancete` + `balanceteApresentado` — mudar uma
    regra de URL num sítio só. Filtros **nunca** mudam «Totais» nem as três igualdades (vêm do núcleo).

**Datas de `<input type="date">`** — `new Date('aaaa-mm-dd')` lê como UTC e, a leste de Greenwich, cai no dia
anterior — muda o período fiscal. Parte a string e constrói `new Date(ano, mes - 1, dia, 12)`.

**Máquinas de estado (`transitar*` em `*.service.interface.ts`)** — lançam `BusinessRuleError('TRANSICAO_INVALIDA')`
(409), trancado por `services/__tests__/mensagens-jargao-107.test.ts`; uma máquina nova segue o mesmo contrato, nunca
`Error` cru (chega ao utilizador como «Erro interno», 500). Mesmo assim, quem chama garante que o estado-alvo é
diferente e permitido antes de chamar (ex.: pagamento parcial numa `VENCIDA` mantém `VENCIDA`): a recusa é para o
utilizador, não um ramo de fluxo normal. A tabela de transições vive em `src/lib/state-machines.ts` (client-safe)
quando a UI precisa dela para decidir que botões mostra.

**Trancas nas transições** — um duplo clique é uma corrida: duas tx lêem o mesmo estado e as duas transitam
(caixa fechada duas vezes, stock libertado duas vezes — #554, #555, #557, #558, #559). Dentro da `$transaction`, primeiro
`SELECT id FROM "<Tabela>" WHERE id = … AND "tenantId" = … FOR UPDATE`, **depois** ler o estado e decidir
(`trancarLinha` em `faturacao.service`, `trancarSessaoCaixa` em `caixa.service`; quem só precisa que a linha continue
num estado usa `FOR SHARE`). Respeita a ordem de trancas existente, senão há deadlock: `Venda → Fatura → SessaoCaixa`;
`SessaoPOS → SessaoCaixa` (o fecho de caixa tranca as sessões POS antes da caixa, como a venda POS);
`OrdemProducao → SaldoStock`. Teste determinista da corrida: a tx do teste tranca a linha, lança as duas chamadas
com `Promise.all`, espera em `pg_stat_activity` (`wait_event_type = 'Lock'`) até as ver bloqueadas e só então
liberta — `Promise.all` sozinho é sorte (molde: `test/integration/caixa-fecho-tranca-558.test.ts`).

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
nada** e não avisa. O `demo-contabilidade` decide «já lançado» pela **origem** do lançamento (emissão = `VENDA`,
recebimento = `RECEBIMENTO`/`PAGAMENTO`), não pelo `documentoOrigemTipo` — chavear pelo tipo lançava um segundo
recebimento sobre facturas pagas pela UI (teste `seed-recebimento-idempotente`). Para o exercitar a sério é preciso limpar primeiro o funil do tenant `demo`.

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

**Catálogo de planos (ADR-0049)** — os planos vivem na tabela global `Plano` (sem `tenantId`, chave `codigo`
imutável), geridos pelo administrador de plataforma em `/plataforma/planos`; o número de planos não é fixo.
Nunca reintroduzas uma constante de catálogo nem um enum de códigos: `lib/planos.ts` só tem tipos e funções
client-safe, e a leitura é do `plano.service.ts` (server-only). `Assinatura.planoAssinatura` é texto com FK
`Restrict` para `Plano.codigo` — apagar um plano em uso falha (`PLANO_EM_USO`); retira-se arquivando
(`arquivadoEm` preenchido). Escolher um plano inexistente ou arquivado (registo, mudança de plano, checkout)
dá `PLANO_INDISPONIVEL`. O Price ID do Stripe vem da coluna da tabela e, se vazia, da variável
`STRIPE_PRICE_<CODIGO>_<CICLO>` (`resolverPriceId`); sem nenhum, `PRICE_NAO_CONFIGURADO`.

**Administrador de plataforma (ADR-0049 §5)** — é o papel de realm Keycloak `plataforma-admin` (local:
`plataforma@gespro.mz` / `demo1234`), não um papel de tenant: a sessão é **sem `tenantId`** (`Session.user.tenantId` é
opcional) e o proxy leva-a para `/plataforma`. Páginas e layouts do tenant obtêm o tenant por
`exigirSessaoDeTenant()` (`src/server/auth/sessao-tenant.ts`), nunca por `session.user.tenantId as string`.
As actions de plataforma usam `createSafeAction({ plataforma: true, … })` — correm sem contexto de
tenant e o `gate-leitura` reconhece-as. Uma sessão **com** `tenantId` nunca tem `plataformaAdmin`, mesmo que a
identidade tenha o papel (#549, adenda ao ADR-0049 §5): o `auth.ts` descarta-o na emissão, na renovação e no
callback `session`, e `criarAccaoPlataforma`/`exigirPlataformaAdmin` recusam com 404 se houver tenant. Quem precisa
das duas coisas usa uma segunda identidade (sub-endereçamento, ADR-0011 §5). As escritas de plataforma ficam no trilho global `AuditoriaPlataforma`,
**não** no `AuditLog` do tenant (que exige `tenantId`): quem escreve uma acção de plataforma nova grava lá à mão.
Uma action que recebe o **id de um tenant** do cliente é de plataforma, nunca uma permissão de tenant: as de gestão de
tenants (`criar/actualizar/desactivar/reactivarTenant`) eram `core_tenancy:configurar` — que o ADMIN de qualquer tenant
tem (`ADMIN: allCodes()`) — e deixavam um cliente desactivar outro (#41).

**Identidade preexistente nunca se reaproveita (#549)** — `garantirUtilizador` devolve `criado: false` quando o
e-mail já tem identidade no realm (incluindo a do administrador de plataforma, que não tem `User` local, e as órfãs).
Quem recebe `criado: false` **recusa** com `EMAIL_JA_REGISTADO` antes de escrever o que quer que seja: nada de
`definirPalavraPasse`, e-mail de acções ou `User` a apontar para esse `sub`. «Não há `User` local com o e-mail» **não**
é prova de posse — foi assim que o registo público escrevia a palavra-passe de um anónimo na conta do administrador.
O `provisionarTenant` recebe o `keycloakSub` de quem o chama, e a compensação que apaga uma identidade criada a
meio verifica antes que nenhum `User` a referencia. Consequência aceite: uma órfã bloqueia o e-mail (#581).

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
(hoje: `projetos/lista/{novo,[id]/editar}`; o «registo» do balancete em `localStorage` saiu com a #282). Os tipos de
contabilidade reais estão nos `*.interface.ts` dos serviços (os de protótipo, `src/types/contabilidade.ts`, saíram
com o gerador `lib/contabilidade/balancete.ts`, #282).

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
