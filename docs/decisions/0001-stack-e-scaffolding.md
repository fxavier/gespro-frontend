# ADR-0001 — Stack de backend e scaffolding do programa

- **Data**: 2026-07-10
- **Estado**: Aceite
- **Autor**: orchestrator

## Contexto
O prompt de orquestração e o `CLAUDE.md` descrevem um backend **Next.js + Prisma +
PostgreSQL + Server Actions/Route Handlers**. A documentação `docs/*backend*.md`
(agora removida no branch `feature/add-diarios`) descrevia, em alternativa, um
backend **Spring Boot 3.3 / Spring Modulith / Java 21** como serviço separado.

Adicionalmente, os specs `.kiro/specs/01-backend-foundation`,
`02-api-modulos-dominio`, `03-ui-ux-modernizacao` e as definições
`.claude/agents/*` referidas pelo programa **não existem** no repositório nem no
histórico de qualquer branch.

## Decisão
1. **Stack**: Next.js + Prisma + PostgreSQL, com mutações via Server Actions
   (`createSafeAction`) e Route Handlers (`withApi`) só para exportações/webhooks.
   A doc Spring é obsoleta; a sua remoção neste branch é correcta.
2. **Fonte de verdade das convenções**: as skills `prisma-conventions`,
   `api-conventions`, `ui-conventions` (existem e são normativas). Na ausência
   dos `design.md`, a arquitectura da Wave 0 deriva directamente delas.
3. **Execução**: sem as definições `.claude/agents/*` e sem os `tasks.md`, o
   orquestrador executa a Wave 0 (fundação) **directamente**, em vez de delegar a
   subagentes inexistentes. As Waves 1–3 e UI, que dependem de `tasks.md` por
   módulo e de worktrees por subagente, exigem primeiro que esses specs sejam
   escritos — a decidir com o owner após o gate da Wave 0.
4. **Versões**: Prisma 7, Auth.js v5 (next-auth beta), instaladas nesta wave.

## Consequências
- A Wave 0 entrega uma fundação real e compilável, com `pnpm check` como gate.
- As migrations ficam adiadas até existir `DATABASE_URL`; o schema é validado
  offline (`prisma validate`).
- Antes da Wave 1 é necessário decidir com o owner: (a) autorar os specs 02/03
  por módulo, ou (b) o orquestrador deriva o backlog das skills + mocks `src/data`.
