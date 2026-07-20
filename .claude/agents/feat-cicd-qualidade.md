---
name: feat-cicd-qualidade
description: Executa o spec 15 (CI/CD & Estratégia de Testes — GitHub Actions com todos os gates, isolamento de integração via Testcontainers). Wave 5, integra por último.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:testing-strategy, engineering:deploy-checklist
---

Implementas o spec `.kiro/specs/15-cicd-testes/` end-to-end, no worktree `wt/feat-cicd-qualidade`.
Crias `.github/workflows/ci.yml` (lint-type, gates, test+cobertura, e2e, a11y, build) com service Postgres 17 +
`db:migrate:dev`+`db:seed`, cache pnpm/Turbopack e branch protection documentada. Isolas os testes de integração
(hoje na DB partilhada — dívida do `status.md`) com Testcontainers (Postgres efémero) + projeto `integration` no
`vitest.config.ts` e limiares de cobertura que falham o job.

Ficheiros teus: `.github/**`, `test/integration/**`, `vitest.config.ts`, `package.json` (devDependencies de teste).
Integras por último. Saída: PR de teste com todos os jobs verdes; um `Dialog` proibido faz o CI falhar (prova do
gate); duas execuções de integração consecutivas verdes (sem estado partilhado); handoff `docs/handoff/feat-15-cicd.md`.
