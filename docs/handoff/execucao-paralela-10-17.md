# Execução Paralela — Specs 10–17 (Wave 5)

Plano para executar os specs 10–17 (funcionalidades em falta + melhorias de produção)
com 8 agentes `feat-*` em paralelo, coordenados pelo `orchestrator`. Mantém as regras do
programa: **um worktree por agente**, migrations geradas **só** pelo orquestrador em ordem
determinística, merge só após parecer do `code-reviewer`.

Pré-requisito: **Wave 4 (specs 04–09) mergida** na branch de integração. A Wave 5 parte de
`main` (ou `wave4`) já com o schema/rotas de 04–09.

## Agentes e worktrees

| Agente | Spec | Worktree | Modelo | Skills |
|---|---|---|---|---|
| `feat-vendas-encomendas` | 10 | `wt/feat-vendas-encomendas` | claude-sonnet-4-6 | prisma-conventions, api-conventions, ui-conventions |
| `feat-projetos-gestao` | 11 | `wt/feat-projetos-gestao` | claude-sonnet-4-6 | prisma-conventions, api-conventions, ui-conventions |
| `feat-relatorios-documentos` | 12 | `wt/feat-relatorios-documentos` | claude-fable-5 | api-conventions, ui-conventions, fiscalidade-mz, pdf, xlsx, dataviz |
| `feat-notificacoes` | 13 | `wt/feat-notificacoes` | claude-sonnet-4-6 | prisma-conventions, api-conventions, ui-conventions |
| `feat-observabilidade` | 14 | `wt/feat-observabilidade` | claude-sonnet-4-6 | api-conventions, engineering:system-design, engineering:architecture |
| `feat-cicd-qualidade` | 15 | `wt/feat-cicd-qualidade` | claude-sonnet-4-6 | engineering:testing-strategy, engineering:deploy-checklist |
| `feat-infra-deploy` | 16 | `wt/feat-infra-deploy` | claude-sonnet-4-6 | terraform-aws-scaffold, engineering:architecture |
| `feat-seguranca` | 17 | `wt/feat-seguranca` | claude-sonnet-4-6 | engineering:code-review, engineering:architecture, api-conventions |

## Mapa de conflitos (ficheiros partilhados)

O paralelismo é real, mas há ficheiros tocados por mais do que um agente. O orquestrador é o
**único** a fazer merge e a resolver estes pontos:

- `prisma/schema/comercial.prisma` — **só 10** (Encomenda, ItemEncomenda, Devolucao, ItemDevolucao,
  Troca, Vendedor + enums). Sem conflito.
- `prisma/schema/pessoas-projetos.prisma` — **só 11** na Wave 5 (RiscoProjeto, ComunicacaoProjeto,
  RegistoQualidade + enums). Choca com a Wave 4 (06/07/08/09) **apenas se 04–09 não estiver mergido** —
  daí o pré-requisito. Merge de schema: 10 → 11.
- `prisma/schema/plataforma.prisma` — **só 13** (Notificacao, PreferenciaNotificacao + enums).
- `package.json` / lockfile — **hotspot**: 12 (motor PDF), 13 (email), 14 (`pino`/OTel), 15 (Testcontainers,
  cobertura), 16 (nenhuma nova dep de runtime). Cada agente edita **apenas** o bloco `dependencies`/`devDependencies`;
  o orquestrador resolve por concatenação e corre `pnpm install` **uma vez por merge**.
- `prisma/seed/rbac.ts` — 10, 11, 12, 13, 17 acrescentam permissões. Aditivo (concatenação).
- `src/components/patterns/status-badge.tsx` — 10, 11, 13 acrescentam estados ao mapa único. Aditivo.
- `middleware.ts` — **só 17** edita (headers de segurança + rate-limit). O 14 **não** toca aqui: a
  correlação de pedidos (request-id) vive em `instrumentation.ts` + `withApi`/`safe-action`, não no middleware.
  Merge 14 → 17.
- `next.config.ts` — **só 17** (substitui o CORS wildcard por allowlist + adiciona CSP/HSTS/headers).
- `src/lib/validations/*` — ficheiros distintos por domínio (10=`comercial`/`vendas`, 11=`projetos`, 13=`notificacoes`). Sem sobreposição.
- `src/server/safe-action.ts` e `src/lib/api/with-api.ts` — **14** adiciona logging/tracing/correlação (envelopa,
  não altera contratos). Se **17** precisar de tocar aqui (rate-limit por action), merge 14 → 17 resolve.

## Ordem de merge (determinística) e dependências

```
10 ─ comercial (schema)         ┐
11 ─ pessoas-projetos (schema)  ┤ features de domínio (schema disjunto) → merge 10, 11
                                │
13 ─ plataforma (Notificacao)   ┤ habilita entrega (base p/ 12 e 14)
12 ─ relatorios/documentos      ┤ sem schema novo; consome faturação/produção/clientes
                                │
14 ─ observabilidade            ┤ envelopa withApi/safe-action + instrumentation.ts
17 ─ seguranca                  ┤ middleware.ts + next.config.ts (depois de 14)
                                │
15 ─ ci/cd + testes             ┤ ficheiros `.github/**`, vitest/testcontainers — POR ÚLTIMO
16 ─ infra + deploy             ┘ `Dockerfile`, `infra/**` (Terraform) — POR ÚLTIMO
```

- 10, 11, 13, 14, 15, 16, 17 podem **desenvolver** todos em paralelo desde o início (worktrees isolados).
- 12 desenvolve em paralelo mas assume o motor de PDF e (opcionalmente) o `Notificacao` de 13 para envio de
  relatórios agendados — integra **depois de 13**.
- Após cada merge com schema, o orquestrador regenera migrations na ordem
  `comercial → inventario → pessoas-projetos → plataforma` (nome `11xx_<feature>`) e corre `pnpm check` na branch de integração.

## Gate por agente (antes do merge)

1. `pnpm check` verde no worktree (`prisma validate && tsc --noEmit && eslint . && vitest run`).
2. `pnpm gates` verde (Dialog fora de AlertDialog = 0; `'use client'` em `page.tsx` de listagem/detalhe = 0;
   imports `@/data` = 0).
3. Cobertura de serviços ≥80% no código novo.
4. Parecer do `code-reviewer` sem BLOCKERs (foco: isolamento multi-tenant, `Decimal`, partidas dobradas,
   máquinas de estado, sem modais, e — para 14/16/17 — segredos fora do repo e superfície de ataque).
5. `qa-e2e` corre os fluxos novos (10, 11, 12) e um smoke autenticado das novas páginas após integração.

Notas específicas de gate:
- **15 (CI/CD):** o gate é o próprio pipeline verde num PR de teste (todos os jobs: lint, type, test+cobertura, gates, e2e, a11y, build).
- **16 (Infra):** `terraform validate` + `terraform plan` sem erros; `docker build` da imagem de produção com sucesso; **nenhum segredo commitado** (state remoto, `.tfvars` fora do git).
- **17 (Segurança):** headers verificados por teste (CSP/HSTS presentes; sem `Access-Control-Allow-Origin: *` em rotas autenticadas); rate-limit testado; `pnpm audit`/scan de dependências sem vulnerabilidades altas por resolver.

## Arranque (a partir da raiz do repo)

```bash
claude
> Usa o agente orchestrator: lê docs/status.md e docs/handoff/execucao-paralela-10-17.md,
  confirma que a Wave 4 (04–09) está mergida, cria os worktrees wt/feat-* e lança em paralelo
  os 8 agentes feat-* (Wave 5) com o excerto de tasks.md de cada spec 10–17. Gera migrations
  só tu, na ordem indicada, e pede revisão ao code-reviewer antes de cada merge.
```

O orquestrador delega com a Task tool, passando a cada agente: (1) o `tasks.md` do seu spec, (2) este
handoff (mapa de conflitos + ordem de merge), (3) o worktree, (4) as skills a invocar. Ver também o
prompt pronto a colar em `docs/prompt-wave5-claude-code.md`.
