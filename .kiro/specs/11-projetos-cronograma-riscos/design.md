# Design: Gestão de Projetos — Cronograma, Riscos, Qualidade, Comunicações, Relatórios, Configurações

## Arquitectura

Domínio E (pessoas-projetos). Estende `projetos.service.ts` com novos serviços coesos; as vistas
(cronograma/relatórios) são agregações read-only sobre dados existentes. Sem `@relation` cross-domínio;
FKs escalares (`projetoId`, `responsavelId`) + índices.

## Schema (`prisma/schema/pessoas-projetos.prisma`) — deltas

**Ponto de conflito único na Wave 5** neste ficheiro é este spec (11). Enums:
`ProbabilidadeRisco`, `ImpactoRisco`, `EstrategiaRisco`, `StatusRisco`, `TipoQualidade`, `StatusQualidade`,
`TipoComunicacao`.

Modelos (com `tenantId`, timestamps, índices):
- `RiscoProjeto { id, projetoId, titulo, descricao?, probabilidade, impacto, severidade Int, estrategiaResposta,
  responsavelId?, status StatusRisco, planoMitigacao? }`
- `RegistoQualidade { id, projetoId, tarefaId?, marcoId?, tipo TipoQualidade, descricao, acaoCorretiva?, status StatusQualidade }`
- `ComunicacaoProjeto { id, projetoId, tipo TipoComunicacao, data DateTime, participantes String[], resumo, deletedAt? }`
- (opcional) `ConfiguracaoProjeto { id, projetoId @unique, politicaAprovacaoTimesheet, ... }` ou JSON tipado.

`severidade` é derivada (probabilidade×impacto) e recalculada no serviço — nunca aceite do cliente.

## Serviços (`src/server/services/pessoas-projetos/`)

- Estender `projetos.service.ts` (ou `projeto-analytics.ts`) com `relatorio(projetoId, ctx)`:
  progresso (tarefas concluídas/total), desvio orçamental (real vs `OrcamentoProjeto`), horas (`Timesheet`),
  marcos em atraso. E `cronograma(projetoId, ctx)` (tarefas+marcos ordenados por data com dependências).
- `risco.service.ts`: CRUD + `transitar` (`TRANSICOES_RISCO`) + cálculo de severidade (função pura testável).
- `qualidade.service.ts`: CRUD + `transitar` (`TRANSICOES_QUALIDADE`).
- `comunicacao.service.ts`: `registar`/`listar`/`obter` (atas append-only).
- `configuracao-projeto.service.ts`: `obter`/`actualizar`.

## Validações e Actions

- `src/lib/validations/projetos.ts` (estender): `RiscoSchema`, `QualidadeSchema`, `ComunicacaoSchema`,
  `ConfiguracaoProjetoSchema`.
- `src/server/actions/projetos.actions.ts` (estender): mutações via `createSafeAction` com `permission` +
  `revalidate`. Permissões `projetos:{riscos,qualidade,comunicacoes,config}:*` no RBAC (aditivo).

## UI (Server Components; folhas `'use client'`; sem modais)

- `/projetos/cronograma` e `/projetos/lista/[id]/cronograma`: Gantt em Client Component carregado por
  `dynamic()` + `DetailSkeleton`; escrita via Server Action (reordenar/reagendar).
- `/projetos/riscos` (+`novo`,`[id]`,`[id]/editar`) com **matriz de risco** (`dataviz`, tokens, dark-mode).
- `/projetos/qualidade` (+`novo`,`[id]`), `/projetos/comunicacoes` (+`novo`,`[id]`).
- `/projetos/relatorios`: KPIs + gráficos (`dataviz`, sem cores hardcoded). `/projetos/configuracoes`: `FormPage`.
- Estados novos no mapa único `patterns/status-badge.tsx`.

## Riscos

- Gantt/matriz são componentes pesados → `dynamic()` + skeleton; respeitar a fronteira RSC (funções de
  render/rowHref só em módulos `'use client'`). Relatórios com `unstable_cache` + tags para evitar recomputação.
