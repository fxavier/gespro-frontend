# Visão Geral — Funcionalidades em Falta e Melhorias (specs 10–17, Wave 5)

Este pacote acrescenta specs (padrão Kiro: `requirements.md`/`design.md`/`tasks.md`)
para **funcionalidades ainda por implementar** e **melhorias de produção** identificadas
por análise do código em 2026-07, complementando os specs 01–03 (base backend + UI) e
04–09 (Wave 4 — funcionalidades em falta de RH/finanças/inventário).

Depende de: **Wave 4 (04–09) mergida** na branch de integração. A Wave 5 assume o
schema e as rotas resultantes de 04–09 (payroll, recrutamento, benefícios, reconciliações,
correções de páginas/rotas). Ver ordem de merge em `docs/handoff/execucao-paralela-10-17.md`.

## Método

Auditoria dos schemas Prisma (`prisma/schema/*.prisma`), serviços (`src/server/services/**`),
actions, `page.tsx` (`src/app/(dashboard)/**`), `middleware.ts`, `next.config.ts`, `package.json`
e ausência de infra (`.github/`, observabilidade), cruzada com `docs/status.md`, `CLAUDE.md` e
os specs 01–09. Para cada área confirmou-se com evidência no código o que existe vs o que falta.

## Resultado da análise (o que realmente falta / melhora)

| # | Spec | Natureza | Estado encontrado (evidência) |
|---|------|----------|-------------------------------|
| 10 | Vendas: Encomendas, Devoluções, Trocas e Vendedores | Feature (novo) | `venda.service.ts` só cobre Venda/POS. `vendas/{pedidos,devolucoes,trocas,vendedores}/page.tsx` são `EmptyState`; **sem modelos `Encomenda`/`Devolucao`/`Troca`/`Vendedor`** em `comercial.prisma`. |
| 11 | Projetos: Cronograma, Riscos, Qualidade, Comunicações, Relatórios, Configurações | Feature (novo) | `projetos.service.ts` cobre projeto/tarefa/kanban/timesheet/marco/orçamento, mas `projetos/{cronograma,riscos,qualidade,comunicacoes,relatorios,configuracoes}/page.tsx` são `EmptyState`; **sem modelos `RiscoProjeto`/`ComunicacaoProjeto`/`RegistoQualidade`**. |
| 12 | Relatórios, Documentos & Exportação unificada | Feature + Melhoria | Só existe dep `xlsx`; **sem motor de PDF**. Fatura (`faturacao/[id]`) não tem PDF/impressão fiscal. `producao/relatorios`, `clientes/{historico,relatorios}` são `EmptyState`. Cada spec (04/06) reinventa exportação — falta serviço central. |
| 13 | Notificações & Email | Feature + Melhoria | Auth.js tem reset/convite mas **sem transporte de email** (`nodemailer`/`resend` ausentes). Cron `transporte-alertas` calcula alertas **sem entrega**. Sem `Notificacao` nem centro in-app. |
| 14 | Observabilidade & Operações | Melhoria (produção) | **Sem logging estruturado, tracing, error-tracking ou métricas** (nenhum `pino`/`otel`/`sentry` em `package.json`). Só existe `AuditLog` de negócio. Sem endpoints `health`/`ready`. |
| 15 | CI/CD & Estratégia de Testes | Melhoria (produção) | **`.github/` ausente** — `pnpm check`/`gates`/`e2e`/`e2e:a11y` correm só à mão. Testes de integração na DB partilhada (dívida documentada em `status.md`) → isolar com Testcontainers. |
| 16 | Infraestrutura & Deploy (Docker + Terraform AWS) | Melhoria (produção) | Só `docker-compose.yml` de Postgres de dev. **Sem `Dockerfile` de produção nem IaC.** Deploy manual/indefinido. |
| 17 | Segurança & Hardening | Melhoria (produção) | `next.config.ts` faz `Access-Control-Allow-Origin: *` em `/:path*` (CORS wildcard em rotas autenticadas) e **não define CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy**. Rate-limit só no login. |

## Skills por spec (fonte de verdade normativa)

- **10, 11, 13** → `prisma-conventions`, `api-conventions`, `ui-conventions`.
- **12** → `api-conventions`, `ui-conventions`, `fiscalidade-mz` (fatura fiscal MZ), `pdf`, `xlsx`, `dataviz`.
- **14** → `api-conventions`, `engineering:system-design`, `engineering:architecture`.
- **15** → `engineering:testing-strategy`, `engineering:deploy-checklist`.
- **16** → `terraform-aws-scaffold`, `engineering:architecture`.
- **17** → `engineering:code-review`, `engineering:architecture`, `api-conventions`.

## Ordem de execução sugerida

1. **10, 11** (features de domínio — schema comercial/pessoas-projetos disjunto; valor de utilizador imediato).
2. **13** (notificações — habilita entrega de alertas/reset; base para 14 e 12).
3. **12** (relatórios/documentos — consolida exportação que 04/06 hand-rolam; consome faturação/produção/clientes).
4. **14** e **17** (produção — observabilidade e segurança; 14 antes de 17 pela fronteira `middleware.ts`).
5. **15** e **16** (DevOps — CI/CD e infra; podem correr em paralelo, integram por último).

Cada spec mantém as regras invioláveis do `CLAUDE.md`: multi-tenancy por contexto, `Decimal`
para dinheiro, documentos append-only, UI sem modais, integração inter-domínio por funções de
contrato em `$transaction`, e gates de CI (`pnpm gates`) a zero.
