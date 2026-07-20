# Requisitos: Gestão de Projetos — Cronograma, Riscos, Qualidade, Comunicações, Relatórios, Configurações

## Introdução

O módulo de projetos tem base sólida (`projetos.service.ts`: Projeto, Tarefa/Kanban, Timesheet, Marco,
Orçamento, Equipa), mas seis páginas são apenas `EmptyState`:
`projetos/{cronograma,riscos,qualidade,comunicacoes,relatorios,configuracoes}`. Três exigem **modelos
novos** (riscos, comunicações, qualidade); as restantes são **vistas/relatórios** sobre dados existentes.
Este spec completa o módulo end-to-end.

Skills obrigatórias: `prisma-conventions`, `api-conventions`, `ui-conventions`.

## Requisitos

### Requisito 1 — Cronograma (Gantt)

1. `/projetos/cronograma` (e `/projetos/lista/[id]/cronograma`) DEVE renderizar um Gantt read/write sobre
   `TarefaProjeto` + `Marco` (datas início/fim, dependências, progresso), sem dados mock.
2. Reordenar/reagendar uma tarefa DEVE persistir via serviço (reutiliza `reordenar`/`actualizar`), respeitando
   as máquinas de estado existentes. Componente pesado com `dynamic()` + skeleton (sem layout shift).

### Requisito 2 — Riscos de projeto (novo)

1. DEVE existir `RiscoProjeto` (`projetoId` escalar, `tenantId`) com `probabilidade`/`impacto` (enums), `severidade`
   calculada, `estrategiaResposta` (`EVITAR/MITIGAR/TRANSFERIR/ACEITAR`), `responsavelId?`, e `StatusRisco`
   (`IDENTIFICADO → EM_MITIGACAO → FECHADO`, com `MATERIALIZADO`).
2. UI `/projetos/riscos` (+ `novo`, `[id]`, `[id]/editar`), matriz de risco (probabilidade×impacto) em `dataviz`.

### Requisito 3 — Qualidade (novo)

1. DEVE existir `RegistoQualidade` (não-conformidades/inspeções por projeto): `tipo`, `StatusQualidade`
   (`ABERTA → EM_ANALISE → RESOLVIDA/FECHADA`), `acaoCorretiva?`, `marcoId?`/`tarefaId?`.
2. UI `/projetos/qualidade` (+ `novo`, `[id]`).

### Requisito 4 — Comunicações (novo)

1. DEVE existir `ComunicacaoProjeto` (registo de reuniões/atas/decisões/anúncios): `tipo`, `data`, `participantes`,
   `resumo`, anexos opcionais (`AnexoTarefa`-like). Documento append-only para atas.
2. UI `/projetos/comunicacoes` (+ `novo`, `[id]`). Integra (opcional) com spec 13 para notificar participantes.

### Requisito 5 — Relatórios e Configurações (vistas)

1. `/projetos/relatorios`: KPIs por projeto (progresso, desvio de orçamento vs `OrcamentoProjeto`, horas via
   `Timesheet`, marcos em atraso) através de métodos de agregação no serviço; gráficos com `dataviz`.
2. `/projetos/configuracoes`: definições por projeto (tipos de tarefa, papéis de equipa, políticas de aprovação de
   timesheet) persistidas por serviço — **sem** ecrã mock.

## Critérios de Aceitação

1. `pnpm check`/`pnpm gates` verdes; zero `Dialog`/`'use client'` proibidos; zero `@/data`; zero mocks.
2. Nenhuma das 6 páginas fica `EmptyState`; todas consomem serviços reais (Server Components).
3. Property/unit: severidade de risco = f(probabilidade,impacto); máquinas de estado de risco/qualidade.
4. Isolamento multi-tenant nos novos serviços; smoke autenticado das 6 páginas (200).

## Fontes

- Código: `src/server/services/pessoas-projetos/projetos.service.ts`, `prisma/schema/pessoas-projetos.prisma`
  (Projeto, TarefaProjeto, Marco, Timesheet, OrcamentoProjeto, Equipa).
- Convenções: `CLAUDE.md`, skills `prisma-conventions`/`api-conventions`/`ui-conventions`; gráficos: `dataviz`.
- Golden standard UI: `src/app/(dashboard)/compras/requisicoes/**`.
