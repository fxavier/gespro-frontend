# Plano de Implementação: Gestão de Projetos (Cronograma/Riscos/Qualidade/Comunicações/Relatórios/Config)

Depende de: módulo de projetos (implementado). Worktree `wt/feat-projetos-gestao`.
Skills: `prisma-conventions`, `api-conventions`, `ui-conventions` (+ `dataviz` na UI). Migrations só o orquestrador.

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums de risco/qualidade/comunicação
  - [ ] 1.2 Modelos `RiscoProjeto`, `RegistoQualidade`, `ComunicacaoProjeto`, `ConfiguracaoProjeto`
  - [ ] 1.3 Migração `11xx_projetos_gestao` (orquestrador)

- [ ] 2. Serviços e máquinas de estado
  - [ ] 2.1 `risco.service.ts` (+ severidade pura + `TRANSICOES_RISCO`)
  - [ ] 2.2 `qualidade.service.ts` (+ `TRANSICOES_QUALIDADE`), `comunicacao.service.ts`, `configuracao-projeto.service.ts`
  - [ ] 2.3 `relatorio()`/`cronograma()` de agregação no serviço de projetos (com `unstable_cache` + tags)

- [ ] 3. Validações e actions
  - [ ] 3.1 `validations/projetos.ts` (Risco/Qualidade/Comunicacao/Config)
  - [ ] 3.2 `projetos.actions.ts` + permissões `projetos:{riscos,qualidade,comunicacoes,config}:*` (RBAC aditivo)

- [ ] 4. Testes (≥80%)
  - [ ] 4.1 Property: severidade = f(prob,impacto); máquinas de estado risco/qualidade
  - [ ] 4.2 Isolamento multi-tenant

- [ ] 5. UI (sem modais, sem mocks)
  - [ ] 5.1 Cronograma (Gantt `dynamic()` + escrita via action) em `/projetos/cronograma` e `/lista/[id]/cronograma`
  - [ ] 5.2 `/projetos/riscos` (+`novo`,`[id]`,`[id]/editar`) + matriz de risco (`dataviz`)
  - [ ] 5.3 `/projetos/qualidade` (+`novo`,`[id]`), `/projetos/comunicacoes` (+`novo`,`[id]`)
  - [ ] 5.4 `/projetos/relatorios` (KPIs+gráficos) e `/projetos/configuracoes` (FormPage)
  - [ ] 5.5 Estados novos no `patterns/status-badge.tsx`

- [ ] 6. Verificação
  - [ ] 6.1 `pnpm check` + `pnpm gates` verdes; nenhuma das 6 páginas fica `EmptyState`
  - [ ] 6.2 Smoke autenticado das 6 páginas (200) + escrita no Gantt
  - [ ] 6.3 Handoff `docs/handoff/feat-11-projetos.md`
