# Plano de Implementação: CI/CD & Estratégia de Testes

Depende de: scripts `pnpm check/gates/e2e/e2e:a11y` (existem). Worktree `wt/feat-cicd-qualidade`.
Skills: `engineering:testing-strategy`, `engineering:deploy-checklist`. Integra por último (ficheiros `.github/**`, config de teste).

- [ ] 1. Pipeline CI
  - [ ] 1.1 `.github/workflows/ci.yml`: jobs lint-type, gates, test(+cobertura), e2e, a11y, build
  - [ ] 1.2 Service Postgres 17 + `db:migrate:dev` + `db:seed`; segredos via GitHub Secrets
  - [ ] 1.3 Cache pnpm/Turbopack; matriz Node conforme `engines`
  - [ ] 1.4 Documentar branch protection (merge bloqueado se falhar)

- [ ] 2. Isolamento de integração
  - [ ] 2.1 `test/integration/setup.ts` com Testcontainers (Postgres efémero) + migrations
  - [ ] 2.2 Projeto `integration` em `vitest.config.ts`; migrar testes que hoje usam DB partilhada
  - [ ] 2.3 Limiares de cobertura (global + código novo) que falham o job

- [ ] 3. Artefactos e verificações extra
  - [ ] 3.1 Publicar cobertura, `playwright-report`, axe como artefactos
  - [ ] 3.2 (Opcional) `pnpm audit`/scan de deps e `prisma migrate diff` (sem drift)

- [ ] 4. Verificação
  - [ ] 4.1 PR de teste → todos os jobs verdes num ambiente limpo
  - [ ] 4.2 Introduzir um `Dialog` proibido → CI falha (prova do gate)
  - [ ] 4.3 Testes de integração sem estado partilhado (duas execuções consecutivas verdes)
  - [ ] 4.4 Handoff `docs/handoff/feat-15-cicd.md`
