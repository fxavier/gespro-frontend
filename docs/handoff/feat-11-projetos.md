# Handoff — Spec 11: Projectos — Cronograma, Riscos, Qualidade, Comunicações, Relatórios, Configurações

Branch: `ws-11` | Domínio E (`pessoas-projetos`) | Wave 5

## Scope

Extensão do domínio de projectos existente com 4 novos modelos Prisma, 4 novos serviços,
11 novas Server Actions e 6 páginas completas (nenhuma `EmptyState`).

---

## Schema Prisma (`prisma/schema/pessoas-projetos.prisma`)

Adicionados ao fim do ficheiro (additive-only, Wave 5):

### Novos modelos

| Modelo | Campos-chave | Notas |
|---|---|---|
| `RiscoProjeto` | `probabilidade`, `impacto`, `severidade Int`, `status`, `estrategiaResposta` | `severidade` derivada no serviço, nunca do cliente |
| `RegistoQualidade` | `tipo`, `status`, `descricao`, `acaoCorretiva?` | machine state ABERTA→EM_ANALISE→RESOLVIDA→FECHADA |
| `ComunicacaoProjeto` | `tipo`, `resumo`, `participantes String[]`, `deletedAt?` | append-only; soft-delete via `deletedAt` |
| `ConfiguracaoProjeto` | `politicaAprovacaoTimesheet`, `tiposTarefaAtivos String[]`, `papeisEquipaAtivos String[]` | upsert por `projetoId`; lazy create |

### Novos enums

`ProbabilidadeRisco`, `ImpactoRisco`, `EstrategiaRisco`, `StatusRisco`,
`TipoQualidade`, `StatusQualidade`, `TipoComunicacao`

Back-references adicionadas ao modelo `Projeto`:
```
riscos            RiscoProjeto[]
registosQualidade RegistoQualidade[]
comunicacoes      ComunicacaoProjeto[]
configuracao      ConfiguracaoProjeto?
```

---

## Serviços

### `risco.service.ts`

- `calcularSeveridade(probabilidade, impacto): number` — pura, PROB_PESO × IMPACTO_PESO, resultado 1-16.
- `classificarSeveridade(severidade): 'BAIXO'|'MEDIO'|'ALTO'|'CRITICO'` — thresholds: ≤2 BAIXO, ≤6 MEDIO, ≤12 ALTO, >12 CRITICO.
- `RiscoService.criar` — computa `severidade` e define `status='IDENTIFICADO'`.
- `RiscoService.matrizRisco` — retorna riscos activos agrupados por `(probabilidade, impacto)` para a matriz 4×4.
- `RiscoService.kpis` — totais, abertos, materializados, críticos.

### `qualidade.service.ts`

- `QualidadeService.criar` — define `status='ABERTA'`.
- `QualidadeService.transitarStatus` — usa `TRANSICOES_QUALIDADE` + `transitar()`.

### `comunicacao.service.ts`

- `ComunicacaoService.registar` — append-only; nunca edita.
- `ComunicacaoService.listar` — filtra `deletedAt: null`.

### `configuracao-projeto.service.ts`

- `ConfiguracaoProjetoService.obter` — devolve defaults se sem registo (sem criar na DB).
- `ConfiguracaoProjetoService.actualizar` — upsert por `projetoId`.
- `ConfiguracaoProjetoService.listarProjetos` — lista projectos activos com `configuracao?` para o selector.

### Extensões a `projetos.service.ts`

- `CronogramaService.cronograma(projetoId, ctx)` — tarefas + marcos + projecto.
- `CronogramaService.listarCronograma(ctx)` — projectos PLANEAMENTO/EM_ANDAMENTO/PAUSADO.
- `RelatorioService.relatorio(projetoId, ctx)` — progresso, tarefas, horas, orçamento, marcos.
- `RelatorioService.kpisGlobais(ctx)` — totalProjetos, emAndamento, concluidos, horasTotal.
- `RelatorioService.progressoPorProjeto(ctx)` — top 20 por `dataFimPrevista`.

---

## State Machines (`src/lib/state-machines.ts`)

```
TRANSICOES_RISCO: {
  IDENTIFICADO: ['EM_MITIGACAO', 'FECHADO', 'MATERIALIZADO'],
  EM_MITIGACAO: ['FECHADO', 'MATERIALIZADO', 'IDENTIFICADO'],
  FECHADO: [],
  MATERIALIZADO: ['EM_MITIGACAO', 'FECHADO'],
}

TRANSICOES_QUALIDADE: {
  ABERTA: ['EM_ANALISE', 'FECHADA'],
  EM_ANALISE: ['RESOLVIDA', 'FECHADA'],
  RESOLVIDA: ['FECHADA'],
  FECHADA: [],
}
```

---

## RBAC (`prisma/seed/rbac.ts`)

11 novas permissões:
`projetos:riscos:{read,create,update}`, `projetos:qualidade:{read,create,update}`,
`projetos:comunicacoes:{read,create}`, `projetos:config:{read,update}`, `projetos:relatorios:read`

---

## Páginas (6 de 6 completas)

| Rota | Componentes-chave | Dynamic |
|---|---|---|
| `/projetos/cronograma` | `GanttWrapper` → `GanttChart` | `ssr:false` + `GanttSkeleton` |
| `/projetos/riscos` | `RiscosTable`, `MatrizRiscoWrapper` → `MatrizRisco` | `ssr:false` + `MatrizSkeleton` |
| `/projetos/qualidade` | `QualidadeTable` | — |
| `/projetos/comunicacoes` | `ComunicacoesTable` | — |
| `/projetos/relatorios` | `ProgressoChartWrapper` → `ProgressoChart` | `ssr:false` + `ChartSkeleton` |
| `/projetos/configuracoes` | `ConfiguracaoForm` | — |

Todas as páginas são Server Components (`page.tsx` sem `'use client'`).
Formulários: `FormPage` + `UnsavedChangesGuard` + `useActionState` + `zodResolver`.

---

## Testes

Ficheiro: `src/server/services/pessoas-projetos/__tests__/riscos-qualidade.test.ts`

- Property tests para `calcularSeveridade` (monotonia, limites, erros)
- Unit tests para `classificarSeveridade` (todos os thresholds)
- Unit tests para `TRANSICOES_RISCO` (todos os arcos, terminais, inválidos)
- Unit tests para `TRANSICOES_QUALIDADE` (todos os arcos, terminais, inválidos)

Total: **26 testes, todos verdes**.

---

## Gates

- `pnpm gates` — PASSED (dialog, use-client, data-imports)
- ESLint — PASSED (exit 0 nos novos ficheiros)
- Vitest — 26/26 testes verdes

---

## Decisões e padrões

1. **Severidade derivada no serviço** — `CreateRiscoSchema` não tem campo `severidade`; o serviço calcula e persiste.
2. **Dynamic() sempre em Client Component wrapper** — `gantt-wrapper.tsx`, `matriz-risco-wrapper.tsx`, `progresso-chart-wrapper.tsx` têm `'use client'`; as páginas são RSC puras.
3. **Comunicações append-only** — `ComunicacaoService.registar` só cria; sem acção de editar. Soft-delete via `deletedAt`.
4. **ConfiguracaoProjeto lazy** — `obter` devolve defaults se sem registo (sem criar); `actualizar` faz upsert.
5. **StatusBadge mapa único** — novos status adicionados ao mapa global em `status-badge.tsx`, sem mapas locais.
6. **Multi-tenant** — `tenantId` nunca vem do cliente; todos os `findFirst`/`update`/`upsert` filtram por `tenantId` explicitamente.
7. **Dataviz** — `ProgressoChart` e `MatrizRisco` usam exclusivamente tokens CSS (`bg-primary`, `bg-success`, `bg-destructive`, `bg-warning`, `bg-muted`); sem cores hardcoded.
