# Prompt — Executar a Wave 5 (specs 10–17) em paralelo

> Cola o bloco abaixo no Claude Code, a partir da raiz do repositório `gespro/`.
> Põe o Claude Code a agir como orquestrador, a lançar os 8 agentes `feat-*` da Wave 5 em
> paralelo (um worktree cada), cada um a invocar as suas skills. Pré-requisito: **Wave 4
> (04–09) mergida**.

---

```text
Age como o agente `orchestrator` do GestPro. Objetivo: executar a Wave 5 — implementar os
specs 10–17 (funcionalidades em falta + melhorias de produção) — com os 8 agentes `feat-*`
em paralelo, em worktrees separados, respeitando as regras invioláveis do CLAUDE.md.

## PRÉ-REQUISITO
Confirma que a Wave 4 (specs 04–09) está mergida na branch de integração (payroll, recrutamento,
benefícios, reconciliações e correções de páginas/rotas). Se não estiver, mergeia a Wave 4 primeiro
(ver docs/prompt-wave4-claude-code.md) — a Wave 5 assume esse schema/rotas.

## FONTES DE VERDADE (lê primeiro)
- `.kiro/specs/00b-melhorias-wave5-visao-geral.md` — visão geral e evidência.
- `docs/handoff/execucao-paralela-10-17.md` — mapa de conflitos + ordem de merge.
- `.kiro/specs/1{0,1,2,3,4,5,6,7}-*/tasks.md` — o plano de cada spec.
- `CLAUDE.md` e `.claude/skills/*` — convenções normativas. Cada agente invoca as skills listadas
  no seu ficheiro `.claude/agents/feat-*.md` e no handoff.

## SETUP (worktrees — isolamento para paralelismo real)
Cria uma branch de integração `wave5` e um worktree por agente:
  git switch -c wave5
  git worktree add wt/feat-vendas-encomendas    -b ws-10
  git worktree add wt/feat-projetos-gestao      -b ws-11
  git worktree add wt/feat-relatorios-documentos -b ws-12
  git worktree add wt/feat-notificacoes         -b ws-13
  git worktree add wt/feat-observabilidade      -b ws-14
  git worktree add wt/feat-cicd-qualidade       -b ws-15
  git worktree add wt/feat-infra-deploy         -b ws-16
  git worktree add wt/feat-seguranca            -b ws-17

## LANÇAMENTO EM PARALELO (Task tool, várias chamadas na MESMA mensagem)
Fase A (paralela, ficheiros disjuntos à partida):
  feat-vendas-encomendas (10), feat-projetos-gestao (11), feat-notificacoes (13),
  feat-observabilidade (14), feat-cicd-qualidade (15), feat-infra-deploy (16), feat-seguranca (17)
  feat-relatorios-documentos (12) desenvolve em paralelo mas integra depois de 13.
A cada subagente passa: (1) o `tasks.md` do seu spec, (2) o worktree (caminho absoluto), (3) o
excerto do handoff com o mapa de conflitos, (4) as skills a invocar (do `.claude/agents/feat-*.md`).
Exige que termine com `pnpm check` verde no seu worktree e um resumo CURTO (ficheiros, decisões, gaps).

## MIGRATIONS E MERGE (só tu, ordem determinística)
Os agentes NUNCA correm `prisma migrate` nem fazem merge. Só editam `prisma/schema/*.prisma`.
Ordem de merge: 10 → 11 → 13 → 12 → 14 → 17 → 15 → 16 (ver handoff). Resolve de forma aditiva os
ficheiros partilhados: `package.json`/lockfile (corre `pnpm install` uma vez por merge), `prisma/seed/
rbac.ts`, `patterns/status-badge.tsx`. `middleware.ts` e o bloco de headers de `next.config.ts` são
exclusivos do spec 17 (merge 14 → 17). Após cada merge com schema, regenera migrations na ordem
`comercial → inventario → pessoas-projetos → plataforma` (nome `11xx_<feature>`) e corre `pnpm check`
na `wave5`. Pede revisão ao `code-reviewer` antes de cada merge; merge só sem BLOCKERs (foco:
isolamento multi-tenant, Decimal, partidas dobradas, máquinas de estado, sem modais, segredos fora do repo).

## GATE POR AGENTE (antes do merge)
- `pnpm check` verde; `pnpm gates` verde (Dialog fora de AlertDialog=0; `'use client'` em page.tsx de
  listagem/detalhe=0; imports `@/data`=0). Cobertura ≥80% no código novo.
- 15: pipeline verde num PR de teste. 16: `terraform validate`/`plan` limpos + `docker build` OK + zero
  segredos. 17: headers presentes (CSP/HSTS) + sem CORS `*` em rotas autenticadas + rate-limit testado.

## FECHO
- Após todos mergidos: `qa-e2e` para os fluxos novos (encomendas/devoluções, projetos, relatórios/PDF,
  notificações) + smoke autenticado das novas páginas.
- Atualiza `docs/status.md` com o estado da Wave 5 (tabela: spec, estado, bloqueios).
- Reporta no fim: resumo por spec e resultado dos gates.

Começa por: (1) confirmar a Wave 4 mergida; (2) ler o handoff e os tasks.md; (3) criar os worktrees;
(4) lançar a Fase A em paralelo.
```

---

## Notas de uso

- **Paralelismo real** exige os worktrees: sem eles, dois agentes a editar o mesmo schema/`page.tsx`
  colidem. Cada agente tem um checkout isolado; o merge e as migrations são exclusivos do orquestrador.
- **Variante mais barata**: correr por fases sequenciais (10+11 → 13 → 12 → 14+17 → 15+16) com 1–2
  agentes de cada vez.
- **Skills**: cada `feat-*` invoca as skills do seu ficheiro em `.claude/agents/`. As de engenharia
  (`engineering:architecture`, `engineering:system-design`, `engineering:testing-strategy`,
  `engineering:deploy-checklist`, `engineering:code-review`), `terraform-aws-scaffold`, `pdf`, `xlsx`,
  `dataviz` e `fiscalidade-mz` são a fonte normativa para 12/14/15/16/17.
