# WS E — Pessoas & Projectos: Handoff Wave 2

Workstream: `domain-pessoas-projetos`
Data: 2026-07-10
Wave: 2 (Serviços + Testes + Actions + Seed)
Estado: `pnpm check` verde — 0 erros TypeScript, 84/84 testes OK
Revisão: ADR-0003 gates Wave 1 e Wave 2 aplicados (B5, A1, Numeração, Partilhado, N4)

---

## 1. Entidades Canónicas (dono: WS E)

### RH

| Modelo Prisma | Tabela lógica | Notas |
|---|---|---|
| `Departamento` | departamentos | hierarquia self-referencial |
| `Cargo` | cargos | ligado a Departamento (opcional) |
| `Colaborador` | colaboradores | soft delete; uniqueness por BI, NUIT, email |
| `FormacaoAcademica` | formacoes_academicas | filha de Colaborador (cascade) |
| `ExperienciaProfissional` | experiencias_profissionais | filha de Colaborador (cascade) |
| `DocumentoColaborador` | documentos_colaborador | filha de Colaborador (cascade) |
| `Ferias` | ferias | período aquisitivo; pai de SolicitacaoFerias |
| `SolicitacaoFerias` | solicitacoes_ferias | máquina de estado |
| `Ausencia` | ausencias | máquina de estado |
| `RegistoAssiduidade` | registos_assiduidade | append-only (unique por colaborador+data) |
| `Avaliacao` | avaliacoes | dual-relation a Colaborador (avaliado/avaliador) |
| `CriterioAvaliacao` | criterios_avaliacao | filha de Avaliacao (cascade) |
| `Formacao` | formacoes | formação institucional |
| `ParticipanteFormacao` | participantes_formacao | unique(formacaoId, colaboradorId) |
| `Payroll` | payroll | **EXTENSÃO FUTURA** — schema modelado, sem serviços na Wave 2 |

### Projectos

| Modelo Prisma | Tabela lógica | Notas |
|---|---|---|
| `Equipa` | equipas | unique(tenantId, nome) |
| `MembroEquipa` | membros_equipa | unique(equipaId, colaboradorId) |
| `Projeto` | projetos | clienteId é FK escalar → WS C |
| `ProjetoEquipa` | projeto_equipa | tabela de junção M:N |
| `TarefaProjeto` | tarefas_projeto | campo `posicao` (conflito #13) |
| `ComentarioTarefa` | comentarios_tarefa | autorId é FK escalar → User |
| `AnexoTarefa` | anexos_tarefa | uploadPorId é FK escalar → User |
| `Timesheet` | timesheets | ligado a Colaborador (intra-WS) |
| `Marco` | marcos | máquina de estado |
| `OrcamentoProjeto` | orcamentos_projeto | máquina de estado |
| `CategoriaOrcamento` | categorias_orcamento | cascade de OrcamentoProjeto |
| `ItemOrcamento` | itens_orcamento | cascade de CategoriaOrcamento |

### Produção

| Modelo Prisma | Tabela lógica | Notas |
|---|---|---|
| `CentroTrabalho` | centros_trabalho | unique(tenantId, codigo) |
| `EstruturaProduto` | estruturas_produto | produtoId FK escalar → WS A |
| `ComponenteBOM` | componentes_bom | recursivo — validar DAG (conflito #14) |
| `Roteiro` | roteiros | ligado a EstruturaProduto (opcional) |
| `OperacaoRoteiro` | operacoes_roteiro | unique(roteiroId, sequencia) |
| `OrdemProducao` | ordens_producao | máquina de estado principal |
| `OperacaoOrdem` | operacoes_ordem | colaboradorId → Colaborador (conflito #15) |
| `ConsumoProducao` | consumos_producao | append-only; movimentoStockId FK escalar → WS A |

---

## 2. Enums Prisma

### RH
`GeneroColaborador`, `EstadoCivil`, `StatusColaborador`, `TipoContratoTrabalho`,
`RegimeTrabalho`, `NivelAcessoColaborador`, `NivelFormacaoAcademica`,
`TipoDocColaborador`, `TipoAusencia`, `StatusAusencia`, `TipoSolicitacaoFerias`,
`StatusSolicitacaoFerias`, `TipoAssiduidade`, `TipoAvaliacao`, `StatusAvaliacao`,
`ModalidadeFormacao`, `StatusFormacao`, `StatusParticipante`, `StatusPayroll`

### Projectos
`TipoProjeto`, `StatusProjeto`, `PrioridadeProjeto`, `TipoTarefa`, `StatusTarefa`,
`PrioridadeTarefa`, `StatusEquipa`, `PapelMembroEquipa`, `StatusMembroEquipa`,
`TipoTimesheet`, `StatusMilestone`, `StatusOrcamento`, `TipoCategoriaOrcamento`

### Produção
`TipoCentroTrabalho`, `StatusBOM`, `CategoriaBOM`, `ComplexidadeBOM`,
`StatusRoteiro`, `StatusOperacaoRoteiro`, `StatusOrdemProducao`,
`PrioridadeOrdemProducao`, `StatusOperacaoOrdem`

---

## 3. Máquinas de Estado

### StatusColaborador
```
PERIODO_EXPERIMENTAL → ACTIVO | INACTIVO
ACTIVO → INACTIVO | FERIAS | AFASTADO
FERIAS → ACTIVO
AFASTADO → ACTIVO | INACTIVO
INACTIVO → (terminal)
```

### StatusSolicitacaoFerias
```
PENDENTE → APROVADA | REJEITADA | CANCELADA
APROVADA → CANCELADA
REJEITADA → (terminal)
CANCELADA → (terminal)
```

### StatusAusencia
```
PENDENTE → APROVADA | REJEITADA
APROVADA → (terminal)
REJEITADA → (terminal)
```

### StatusAvaliacao
```
PENDENTE → EM_ANDAMENTO | CANCELADA
EM_ANDAMENTO → CONCLUIDA | CANCELADA
CONCLUIDA → (terminal)
CANCELADA → (terminal)
```

### StatusFormacao
```
PLANEADA → EM_ANDAMENTO | CANCELADA
EM_ANDAMENTO → CONCLUIDA | CANCELADA
CONCLUIDA → (terminal)
CANCELADA → (terminal)
```

### StatusProjeto
```
PLANEAMENTO → EM_ANDAMENTO | CANCELADO
EM_ANDAMENTO → PAUSADO | CONCLUIDO | CANCELADO
PAUSADO → EM_ANDAMENTO | CANCELADO
CONCLUIDO → ARQUIVADO
CANCELADO → ARQUIVADO
ARQUIVADO → (terminal)
```

### StatusTarefa (Kanban — Conflito #13)
```
A_FAZER → EM_PROGRESSO | CANCELADA
EM_PROGRESSO → EM_REVISAO | BLOQUEADA | CONCLUIDA | CANCELADA
EM_REVISAO → EM_PROGRESSO | CONCLUIDA | CANCELADA
BLOQUEADA → A_FAZER | EM_PROGRESSO | CANCELADA
CONCLUIDA → (terminal)
CANCELADA → (terminal)
```
Campo `posicao: String` (chave fraccional LexoRank) — reordenação independente da
mudança de status. O serviço `ITarefaService.reordenar()` persiste a nova posicao
sem alterar o status, ou ambos em simultâneo numa drag-and-drop de coluna.

### StatusMilestone
```
PENDENTE → EM_ANDAMENTO | ATRASADO
EM_ANDAMENTO → CONCLUIDO | ATRASADO
ATRASADO → CONCLUIDO
CONCLUIDO → (terminal)
```

### StatusOrcamento
```
RASCUNHO → REVISAO | APROVADO
REVISAO → RASCUNHO | APROVADO | REJEITADO
APROVADO → (terminal)
REJEITADO → RASCUNHO
```

### StatusBOM
```
RASCUNHO → ATIVO | INATIVO
ATIVO → INATIVO | SUBSTITUIDO
INATIVO → ATIVO
SUBSTITUIDO → (terminal)
```

### StatusRoteiro
```
RASCUNHO → EM_REVISAO | ATIVO
EM_REVISAO → RASCUNHO | ATIVO
ATIVO → INATIVO | SUBSTITUIDO
INATIVO → ATIVO
SUBSTITUIDO → (terminal)
```

### StatusOrdemProducao (máquina principal de produção)
```
PLANEADA → LIBERADA | CANCELADA
LIBERADA → EM_PRODUCAO | CANCELADA
EM_PRODUCAO → CONCLUIDA | PAUSADA | CANCELADA
PAUSADA → EM_PRODUCAO | CANCELADA
CONCLUIDA → (terminal)
CANCELADA → (terminal)
```

### StatusOperacaoOrdem
```
PENDENTE → EM_ANDAMENTO | CANCELADA
EM_ANDAMENTO → CONCLUIDA | PAUSADA | CANCELADA
PAUSADA → EM_ANDAMENTO | CANCELADA
CONCLUIDA → (terminal)
CANCELADA → (terminal)
```

---

## 4. TENANT_MODELS a registar (orquestrador adiciona em tenant-extension.ts)

```ts
// Adicionar ao Set<string> em src/server/db/tenant-extension.ts:
'Departamento', 'Cargo', 'Colaborador', 'Ferias', 'Ausencia',
'RegistoAssiduidade', 'Avaliacao', 'Formacao', 'Payroll',
'Equipa', 'Projeto', 'TarefaProjeto', 'Timesheet', 'Marco', 'OrcamentoProjeto',
'CentroTrabalho', 'EstruturaProduto', 'Roteiro', 'OrdemProducao', 'ConsumoProducao',
```

Modelos com soft delete (adicionar ao SOFT_DELETE_MODELS):
```ts
'Colaborador'
```

---

## 5. Contratos Cross-WS Consumidos (WS E → WS A)

Definidos em `src/server/services/pessoas-projetos/producao.interface.ts`:

```ts
interface StockContratoA {
  reservarStock(tx, produtoId, quantidade, referenciaId, ctx): Promise<void>
  confirmarConsumoStock(tx, produtoId, quantidadeReal, referenciaId, ctx): Promise<{ movimentoStockId }>
  libertarStock(tx, produtoId, quantidade, referenciaId, ctx): Promise<void>
  entradaStock(tx, produtoId, quantidade, custoUnitario, referenciaId, ctx): Promise<{ movimentoStockId }>
}
```

Invocados dentro de `prisma.$transaction` na transição de `OrdemProducao`:
- **PLANEADA → LIBERADA**: `reservarStock` para cada material da BOM explodida.
- **EM_PRODUCAO → CONCLUIDA**: `confirmarConsumoStock` (por ConsumoProducao) + `entradaStock` (produto acabado).
- **→ CANCELADA** (se havia LIBERADA/EM_PRODUCAO/PAUSADA): `libertarStock`.

---

## 6. FKs Escalares Cross-WS (sem @relation)

| Campo | Modelo | WS Alvo |
|---|---|---|
| `produtoId` | `EstruturaProduto`, `ComponenteBOM`, `OrdemProducao`, `ConsumoProducao` | WS A |
| `componenteProdutoId` | `ComponenteBOM` | WS A |
| `movimentoStockId` | `ConsumoProducao` | WS A |
| `fornecedorPrincipalId` | `ComponenteBOM` | WS B |
| `clienteId` | `Projeto`, `OrdemProducao` | WS C |
| `pedidoVendaId` | `OrdemProducao` | WS C |
| `gerenteId` | `Projeto` | Foundation (User) |
| `responsavelId` | `TarefaProjeto`, `EstruturaProduto`, `Roteiro`, `OrdemProducao` | Foundation (User) ou Colaborador |
| `criadoPorId` | `TarefaProjeto`, `OrdemProducao` | Foundation (User) |
| `aprovadoPorId` | `SolicitacaoFerias`, `Ausencia`, `OrcamentoProjeto` | Foundation (User) |
| `autorId` | `ComentarioTarefa` | Foundation (User) |
| `uploadPorId` | `AnexoTarefa` | Foundation (User) |

---

## 7. Resolução de Conflitos

### Conflito #13 — Kanban drag-and-drop (TarefaProjeto.posicao)
`posicao String @default("0.5")` — chave fraccional lexicográfica (LexoRank ou
algoritmo próprio). Permite reordenação O(1) sem renumeração. O serviço
`ITarefaService.reordenar()` aceita a nova posição calculada pelo cliente e persiste.
Índice: `@@index([tenantId, projetoId, posicao])`.

### Conflito #14 — ComponenteBOM recursivo (validação DAG)
O modelo `ComponenteBOM` tem auto-relação `componentePaiId → ComponenteBOM`.
**O serviço `IEstruturaProdutoService.adicionarComponente()` DEVE:**
1. Antes de inserir, percorrer a árvore de ancestrais do `componentePaiId` proposto.
2. Verificar que o `componenteProdutoId` do novo componente não aparece em nenhum
   ancestral (ciclo directo) nem em nenhum descendente (ciclo inverso).
3. Lançar `BusinessRuleError('CICLO_BOM')` se detectar ciclo.
O método `explodir()` usa topological sort (DFS) e detecta ciclos durante a explosão.

### Conflito #15 — Sem tabela Operador paralela
`OperacaoOrdem.colaboradorId` tem `@relation` directa a `Colaborador` (intra-WS E).
Não existe modelo `Operador` ou `RegistoPresenca` em produção; usa-se
`RegistoAssiduidade` do módulo RH para o controlo de presença dos operadores.

---

## 8. Mapa Páginas → Actions/Serviços (para agente UI)

| Página | Serviço | Actions (Wave 2) |
|---|---|---|
| `/rh/colaboradores` | `IColaboradorService.listar` | `criarColaborador`, `actualizarColaborador` |
| `/rh/colaboradores/[id]` | `IColaboradorService.obter` | `transitarStatusColaborador` |
| `/rh/assiduidade` | `IAssiduidadeService.listar` | `registarPonto` |
| `/rh/ferias` | `IFeriasService.obterSaldo`, `listar` | `solicitarFerias`, `aprovarSolicitacao` |
| `/rh/ausencias` | `IAusenciaService.listar` | `registarAusencia`, `aprovarAusencia` |
| `/rh/avaliacoes` | `IAvaliacaoService.listar` | `criarAvaliacao`, `transitarStatusAvaliacao` |
| `/rh/formacoes` | `IFormacaoService.listar` | `criarFormacao`, `inscreverColaborador` |
| `/projetos` | `IProjetoService.listar` | `criarProjeto` |
| `/projetos/[id]` | `IProjetoService.obter`, `resumo` | `actualizarProjeto`, `transitarStatusProjeto` |
| `/projetos/[id]/kanban` | `ITarefaService.listarKanban` | `criarTarefa`, `reordenarTarefa`, `transitarStatusTarefa` |
| `/projetos/[id]/timesheet` | `ITimesheetService.listar` | `registarTimesheet`, `aprovarTimesheet` |
| `/projetos/[id]/orcamento` | `IOrcamentoProjetoService.obter` | `criarOrcamento`, `transitarStatusOrcamento` |
| `/producao` | dashboard (agregados) | — |
| `/producao/estrutura` | `IEstruturaProdutoService.listar` | `criarEstrutura`, `adicionarComponente` |
| `/producao/estrutura/[id]` | `IEstruturaProdutoService.explodir` | `transitarStatusBOM` |
| `/producao/roteiros` | `IRoteiroService.listar` | `criarRoteiro`, `transitarStatusRoteiro` |
| `/producao/ordens` | `IOrdemProducaoService.listar` | `criarOrdem`, `transitarStatusOrdem` |
| `/producao/ordens/[id]` | `IOrdemProducaoService.obter`, `apurarCusto` | `registarConsumo`, `transitarOperacao` |
| `/producao/mao-obra` | `IAssiduidadeService` (RH) | — (usa módulo RH) |

---

## 9. Payroll — Extensão Futura

O modelo `Payroll` está modelado no schema Prisma (`prisma/schema/pessoas-projetos.prisma`)
com todos os campos necessários (IRPS, INSS, proventos, descontos).
**Não implementar `IPayrollService` na Wave 2.**
Motivo: processamento salarial requer integração com contabilidade (WS D) para
lançamentos de salários e implica regras fiscais moçambicanas específicas (IRPS
progressivo por escalões, INSS 4% colaborador + 4% entidade). Tarefa para Wave futura.

---

## 10. Mapa Páginas → Server Actions (para agente UI)

Todas as mutações usam `createSafeAction`. Leituras em Server Components chamando o serviço directamente.

### RH (`src/server/actions/rh.actions.ts`)

| Página | Action(s) | Permissão |
|---|---|---|
| `/rh/colaboradores` | `criarColaboradorAction`, `listarColaboradoresAction` | `rh:colaboradores:create/read` |
| `/rh/colaboradores/[id]` | `actualizarColaboradorAction`, `transitarStatusColaboradorAction`, `arquivarColaboradorAction` | `rh:colaboradores:update/delete` |
| `/rh/ferias` | `iniciarPeriodoFeriasAction`, `solicitarFeriasAction`, `aprovarFeriasAction` | `rh:ferias:create/solicitar/aprovar` |
| `/rh/ausencias` | `registarAusenciaAction` | `rh:ausencias:create` |
| `/rh/assiduidade` | `registarAssiduidadeAction`, `listarAssiduidadeAction` | `rh:assiduidade:create/read` |
| `/rh/avaliacoes` | `criarAvaliacaoAction`, `actualizarAvaliacaoAction`, `transitarStatusAvaliacaoAction` | `rh:avaliacoes:*` |
| `/rh/formacoes` | `criarFormacaoAction`, `actualizarFormacaoAction`, `transitarStatusFormacaoAction`, `inscreverColaboradorFormacaoAction` | `rh:formacoes:*` |

### Projectos (`src/server/actions/projetos.actions.ts`)

| Página | Action(s) | Permissão |
|---|---|---|
| `/projetos` | `criarProjetoAction`, `listarProjetosAction` | `projetos:create/read` |
| `/projetos/equipas` | `criarEquipaAction`, `actualizarEquipaAction`, `adicionarMembroEquipaAction` | `projetos:equipas:*` |
| `/projetos/[id]` | `actualizarProjetoAction`, `transitarStatusProjetoAction` | `projetos:update` |
| `/projetos/[id]/kanban` | `criarTarefaAction`, `actualizarTarefaAction`, `transitarStatusTarefaAction`, `reordenarTarefaAction`, `listarTarefasAction` | `projetos:tarefas:*` |
| `/projetos/[id]/timesheet` | `registarTimesheetAction`, `aprovarTimesheetAction`, `listarTimesheetsAction` | `projetos:timesheets:*` |
| `/projetos/[id]/marcos` | `criarMarcoAction`, `transitarStatusMarcoAction` | `projetos:marcos:*` |
| `/projetos/[id]/orcamento` | `criarOrcamentoProjetoAction`, `transitarStatusOrcamentoAction` | `projetos:orcamentos:*` |

### Produção (`src/server/actions/producao.actions.ts`)

| Página | Action(s) | Permissão |
|---|---|---|
| `/producao/centros` | `criarCentroTrabalhoAction`, `actualizarCentroTrabalhoAction` | `producao:centros:*` |
| `/producao/estrutura` | `criarEstruturaProdutoAction`, `actualizarEstruturaProdutoAction`, `adicionarComponenteBOMAction`, `removerComponenteBOMAction`, `transitarStatusBOMAction`, `listarEstruturasProdutoAction`, `explodirBOMAction` | `producao:bom:*` |
| `/producao/roteiros` | `criarRoteiroAction`, `actualizarRoteiroAction`, `transitarStatusRoteiroAction`, `listarRoteirosAction` | `producao:roteiros:*` |
| `/producao/ordens` | `criarOrdemProducaoAction`, `actualizarOrdemProducaoAction`, `transitarStatusOrdemProducaoAction`, `listarOrdensProducaoAction` | `producao:ordens:*` |
| `/producao/ordens/[id]` | `registarConsumoOrdemAction`, `transitarOperacaoOrdemAction` | `producao:ordens:update` |

---

## 11. Ficheiros Criados/Modificados

### Wave 1 (Contratos)
- `prisma/schema/pessoas-projetos.prisma` — schema Prisma completo
- `src/lib/validations/rh.ts` — Zod schemas RH
- `src/lib/validations/projetos.ts` — Zod schemas Projectos
- `src/lib/validations/producao.ts` — Zod schemas Produção
- `src/server/services/pessoas-projetos/rh.interface.ts` — interfaces RH + máquinas de estado
- `src/server/services/pessoas-projetos/projetos.interface.ts` — interfaces Projectos + máquinas de estado
- `src/server/services/pessoas-projetos/producao.interface.ts` — interfaces Produção + contratos WS A

### Wave 2 (Implementação)
- `src/server/services/pessoas-projetos/rh.service.ts` — serviços RH (`ColaboradorService`, `FeriasService`, `AusenciaService`, `AssiduidadeService`, `AvaliacaoService`, `FormacaoService`)
- `src/server/services/pessoas-projetos/projetos.service.ts` — serviços Projectos (`EquipaService`, `ProjetoService`, `TarefaService`, `TimesheetService`, `MarcoService`, `OrcamentoProjetoService`); exporta `calcularMidpoint`, `calcularPosicaoKanban`
- `src/server/services/pessoas-projetos/producao.service.ts` — serviços Produção (`CentroTrabalhoService`, `EstruturaProdutoService`, `RoteiroService`, `OrdemProducaoService`); BOM DAG/ciclo; stock via `StockContratoA`
- `src/server/services/pessoas-projetos/__tests__/rh.service.test.ts` — testes máquinas de estado RH
- `src/server/services/pessoas-projetos/__tests__/projetos.service.test.ts` — testes `calcularMidpoint` + property tests reordenação + máquinas de estado
- `src/server/services/pessoas-projetos/__tests__/producao.service.test.ts` — testes BOM DAG + explosão + property tests + máquinas de estado
- `src/server/actions/rh.actions.ts` — Server Actions RH via `createSafeAction`
- `src/server/actions/projetos.actions.ts` — Server Actions Projectos via `createSafeAction`
- `src/server/actions/producao.actions.ts` — Server Actions Produção via `createSafeAction` (mock `StockContratoA` para Wave 2)
- `prisma/seed/pessoas-projetos.ts` — seed idempotente; exporta `seedPessoasProjetos(prisma, tenantId)`

---

## 12. Notas Wave 3

- `producao.actions.ts` contém `stockServiceMock`; substituir por injecção real de `@/server/services/inventario/stock.service` em Wave 3.
- `ARMAZEM_MATERIAS_PRIMAS_ID` e `ARMAZEM_PRODUTO_ACABADO_ID` são env vars placeholder; Wave 3 carrega da config do tenant.
- Payroll (`StatusPayroll`, modelo `Payroll`) modelado no schema mas sem serviço — implementar em Wave futura com integração WS D (contabilidade).
