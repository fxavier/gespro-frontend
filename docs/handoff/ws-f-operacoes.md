# Handoff WS F — Operações (Wave 2: Serviços + Actions)

Workstream: **domain-operacoes**
Módulos: `transporte`, `tickets`
Dono: agente `domain-operacoes`
Data: 2026-07-10 (Wave 1 + Wave 2)

---

## 1. Ficheiros entregues

### Wave 1 (Contratos)

| Ficheiro | Conteúdo |
|---|---|
| `prisma/schema/operacoes.prisma` | 21 modelos Prisma + 40 enums; `tenantId` em todos os modelos incluindo filhos (A1); pt-PT (N1) |
| `src/lib/validations/transporte.ts` | Zod Create/Update/Filter para transporte; PLANEADA (pt-PT) |
| `src/lib/validations/tickets.ts` | Zod Create/Update/Filter para tickets |
| `src/server/services/operacoes/types.ts` | Re-exporta Ctx/TxClient/PaginatedResult de @/server/services/types |
| `src/server/services/operacoes/alocacao.interface.ts` | Assinaturas alocação (porta legado) |
| `src/server/services/operacoes/alertas.interface.ts` | Assinaturas alertas (porta legado) |
| `src/server/services/operacoes/atividade.interface.ts` | Máquina estado + CRUD Atividade |
| `src/server/services/operacoes/viatura.interface.ts` | Máquina estado + CRUD Viatura |
| `src/server/services/operacoes/ticket.interface.ts` | Máquina estado + SLA + CRUD Ticket |
| `src/server/services/operacoes/rota.interface.ts` | TRANSICOES_ROTA + IRotaService (A6) |
| `src/server/services/operacoes/entrega.interface.ts` | TRANSICOES_ENTREGA + IEntregaService (A6) |
| `src/server/services/operacoes/abastecimento.interface.ts` | IAbastecimentoService append-only (A6) |

### Wave 2 (Serviços + Actions)

| Ficheiro | Conteúdo |
|---|---|
| `src/server/services/operacoes/_helpers.ts` | `transitar<E>()`, `gerarNumeroSerie()`, `assertTenant()` |
| `src/server/services/operacoes/alocacao.service.ts` | Porta do legado: `calcularEstadoDocumento`, `verificarConflitosAgenda`, `validarAlocacaoViatura`, `validarAlocacaoMotorista` |
| `src/server/services/operacoes/alertas.service.ts` | `gerarAlertasDocumentos`, `gerarAlertasManutencao`, `recalcularEstadosDocumentos` |
| `src/server/services/operacoes/viatura.service.ts` | `viaturaService: IViaturaService` |
| `src/server/services/operacoes/motorista.service.ts` | `motoristaService` (CRUD + disponibilidade) |
| `src/server/services/operacoes/atividade.service.ts` | `atividadeService: IAtividadeService`; numeração AT/YYYY/NNNNNN |
| `src/server/services/operacoes/rota.service.ts` | `rotaService: IRotaService` |
| `src/server/services/operacoes/entrega.service.ts` | `entregaService: IEntregaService`; numeração ENT/YYYY/NNNNNN |
| `src/server/services/operacoes/abastecimento.service.ts` | `abastecimentoService: IAbastecimentoService` append-only |
| `src/server/services/operacoes/ticket.service.ts` | `ticketService`, `categoriaTicketService`, `equipeSuporteService`, `baseConhecimentoService`; SLA por prioridade+categoria; numeração TKT/YYYY/NNNNNN |
| `src/server/services/operacoes/index.ts` | Barrel export de todos os serviços e contratos |
| `src/server/services/operacoes/__tests__/state-machines.test.ts` | Property tests das 5 máquinas de estado |
| `src/server/services/operacoes/__tests__/alocacao.test.ts` | Unit + property tests das funções de alocação |
| `src/server/services/operacoes/__tests__/ticket-sla.test.ts` | Unit + property tests de SLA e `recalcularSlaEmAtraso` |
| `src/server/actions/transporte.actions.ts` | Server Actions `'use server'` para Viatura/Motorista/Atividade/Rota/Entrega/Abastecimento |
| `src/server/actions/tickets.actions.ts` | Server Actions `'use server'` para Ticket/CategoriaTicket/EquipeSuporte/BaseConhecimento |
| `prisma/seed/operacoes.ts` | `seedOperacoes(prisma, tenantId)` — categorias, equipes, viaturas, motoristas, base de conhecimento demo |
| `src/app/api/cron/transporte-alertas/route.ts` | F3 — cron GET protegido por CRON_SECRET; recalcula estados de documentos de todos os tenants |

**Testes:** 3 ficheiros, 57 testes, 100% passam (`npx vitest run src/server/services/operacoes/`).
**TypeScript:** 0 erros em WS F (`npx tsc --noEmit` — erros restantes são de WS E, não WS F).

---

## 2. Entidades e modelos Prisma

### 2.1 Transporte & Logística

| Modelo | Descrição |
|---|---|
| `Viatura` | Frota; FK intra-WS para Motorista (responsável) |
| `DocumentoViatura` | Seguro/Inspecção/Licença por viatura; estado calculado |
| `ManutencaoViatura` | Preventiva/Correctiva; custo Decimal(18,2) |
| `Checklist` | Inspecção de viatura; 1:N para ItemChecklist |
| `ItemChecklist` | Item individual de checklist |
| `Motorista` | Dados pessoais + carta de condução |
| `DocumentoMotorista` | BI/Carta/Outro por motorista; estado calculado |
| `DisponibilidadeMotorista` | Estado actual (1:1 com Motorista) |
| `Atividade` | **Entidade central**; código AT-YYYY-NNNN; FK para Viatura e Motorista |
| `EventoAtividade` | Histórico imutável de transições (append-only) |
| `Rota` | Planeamento; FK para Viatura e Motorista |
| `PontoEntrega` | Pontos sequenciados numa Rota |
| `Entrega` | Compromisso de entrega; FK escalares cross-WS para Cliente e Venda |
| `ItemEntrega` | Itens de uma entrega; FK escalar cross-WS para Produto |
| `Abastecimento` | Registo de combustível; custo Decimal(18,2) |

### 2.2 Tickets & Suporte

| Modelo | Descrição |
|---|---|
| `Ticket` | Ciclo de vida completo; SLA embutido; polimorfismo origem |
| `AtividadeTicket` | Comentários/log imutável (append-only) |
| `CategoriaTicket` | Categorias com SLA por defeito |
| `EquipeSuporte` | Equipas; 1:N para MembroEquipeSuporte |
| `MembroEquipeSuporte` | Membros com papel/estado; FK escalar para User |
| `BaseConhecimento` | Artigos públicos/internos com estado editorial |

---

## 3. Enums por domínio

### Transporte
- `TipoViatura`, `UnidadeCapacidade`, `EstadoViatura`
- `TipoDocumentoViatura`, `EstadoDocumento` (partilhado viatura + motorista)
- `TipoManutencaoViatura`, `CategoriaItemChecklist`, `EstadoItemChecklist`
- `TipoDocumentoMotorista`, `EstadoOperacionalMotorista`
- `MotivoIndisponibilidade`, `FonteDisponibilidade`
- `TipoActividade`, `PrioridadeAtividade`, `EstadoAtividade`
- `EstadoRota`, `TipoPontoRota`, `EstadoPontoRota`
- `EstadoEntrega`, `PrioridadeEntrega`, `TipoProvaEntrega`
- `TipoCombustivel`

### Tickets
- `TipoTicket`, `PrioridadeTicket`, `EstadoTicket`
- `TipoAtividadeTicket`, `VisibilidadeAtividadeTicket`
- `EstadoBaseConhecimento`, `EstadoEquipeSuporte`
- `PapelMembroEquipeSuporte`, `EstadoMembroEquipeSuporte`

---

## 4. Máquinas de estado

### 4.1 Atividade (TRANSICOES_ATIVIDADE)

```
PLANEADA  → EM_CURSO, CANCELADA
EM_CURSO  → SUSPENSA, CONCLUIDA, CANCELADA
SUSPENSA  → EM_CURSO, CANCELADA
CONCLUIDA → (terminal)
CANCELADA → (terminal)
```

Regra de negócio: PLANEADA→EM_CURSO requer viatura com documentos válidos e motorista disponível.

### 4.2 Viatura (TRANSICOES_VIATURA)

```
DISPONIVEL    → EM_ACTIVIDADE, EM_MANUTENCAO, INACTIVA, ABATIDA
EM_ACTIVIDADE → DISPONIVEL
EM_MANUTENCAO → DISPONIVEL, INACTIVA
INACTIVA      → DISPONIVEL, ABATIDA
ABATIDA       → (terminal)
```

Regra de negócio: DISPONIVEL→EM_ACTIVIDADE falha se existirem documentos EXPIRADO.

### 4.3 Ticket (TRANSICOES_TICKET)

```
ABERTO              → EM_PROGRESSO, AGUARDANDO_CLIENTE, AGUARDANDO_TERCEIRO, CANCELADO
EM_PROGRESSO        → AGUARDANDO_CLIENTE, AGUARDANDO_TERCEIRO, RESOLVIDO, CANCELADO
AGUARDANDO_CLIENTE  → EM_PROGRESSO, RESOLVIDO, CANCELADO
AGUARDANDO_TERCEIRO → EM_PROGRESSO, CANCELADO
RESOLVIDO           → FECHADO, EM_PROGRESSO
FECHADO             → EM_PROGRESSO
CANCELADO           → (terminal)
```

Regra de negócio: ABERTO→EM_PROGRESSO requer agente atribuído.

### 4.4 Rota (TRANSICOES_ROTA) — adicionado em ADR-0003 A6

```
PLANEADA  → ATIVA, CANCELADA
ATIVA     → PAUSADA, CONCLUIDA, CANCELADA
PAUSADA   → ATIVA, CANCELADA
CONCLUIDA → (terminal)
CANCELADA → (terminal)
```

Regra de negócio: PLANEADA→ATIVA requer viatura e motorista com documentos válidos.
ATIVA→CONCLUIDA falha se existirem pontos de entrega abertos (BusinessRuleError: PONTOS_ABERTOS).

### 4.5 Entrega (TRANSICOES_ENTREGA) — adicionado em ADR-0003 A6

```
PENDENTE    → AGENDADA, CANCELADA
AGENDADA    → EM_TRANSITO, CANCELADA
EM_TRANSITO → ENTREGUE, FALHADA
FALHADA     → AGENDADA, CANCELADA
ENTREGUE    → (terminal)
CANCELADA   → (terminal)
```

Regra de negócio: EM_TRANSITO→ENTREGUE requer comprovante (BusinessRuleError: COMPROVANTE_OBRIGATORIO).
EM_TRANSITO→FALHADA requer motivo (BusinessRuleError: MOTIVO_OBRIGATORIO).

---

## 5. Conflitos resolvidos

| # | Conflito | Resolução aplicada |
|---|---|---|
| #16 | Rota com 2 definições (sem `PAUSADA` vs com `PAUSADA`) | Adoptada versão docs/transporte.md + página: `PLANEADA \| ATIVA \| PAUSADA \| CONCLUIDA \| CANCELADA` (pt-PT: PLANEJADA → PLANEADA, corrigido em ADR-0003 N1) |
| #18 | Ticket sem FK à entidade de origem | Adicionados `origemTipo String?` + `origemId String?` escalares (polimorfismo opcional) |
| #20 | Estado de documento calculado vs editável | `EstadoDocumento` é calculado pelo job F3; campo marcado como nunca editável pelo cliente; função `calcularEstadoDocumento()` pura e property-test-ready |

---

## 6. FK escalares cross-WS (sem @relation)

| Campo | Modelo | Destino (WS) |
|---|---|---|
| `clienteId` | `Entrega`, `PontoEntrega` | WS C — Cliente |
| `vendaId` | `Entrega` | WS C — Venda (opcional) |
| `produtoId` | `ItemEntrega` | WS A — Produto |
| `criadoPorId` | `Atividade` | Foundation — User |
| `utilizadorId` | `EventoAtividade` | Foundation — User |
| `responsavelId` | `Checklist` | Foundation — User (opcional) |
| `solicitanteId` | `Ticket` | Foundation — User |
| `atribuidoParaId` | `Ticket` | Foundation — User (opcional) |
| `avaliadoPorId` | `Ticket` | Foundation — User (opcional) |
| `autorId` | `AtividadeTicket`, `BaseConhecimento` | Foundation — User |
| `usuarioId` | `MembroEquipeSuporte` | Foundation — User |

---

## 7. TENANT_MODELS — acrescentar ao orquestrador

O orquestrador deve acrescentar os seguintes modelos ao `TENANT_MODELS` em
`src/server/db/tenant-extension.ts` após merge da Wave 1:

```
Viatura, DocumentoViatura, ManutencaoViatura, Checklist, ItemChecklist,
Motorista, DocumentoMotorista, DisponibilidadeMotorista,
Atividade, EventoAtividade,
Rota, PontoEntrega, Entrega, ItemEntrega, Abastecimento,
Ticket, AtividadeTicket, CategoriaTicket,
EquipeSuporte, MembroEquipeSuporte, BaseConhecimento
```

O orquestrador deve também acrescentar os back-references em `prisma/schema/tenant.prisma`
(e.g., `viaturas Viatura[]`, `atividades Atividade[]`, etc.).

---

## 8. Mapa páginas → Server Actions (para agente UI)

Imports de `@/server/actions/transporte.actions` e `@/server/actions/tickets.actions`.

Leituras de página via serviços directamente em Server Components (ex.: `viaturaService.listarViaturas(...)`).
Mutações via Server Actions (ex.: `criarViaturaAction(data)`).

### 8.1 Transporte

| Página | Server Actions (mutações) | Serviço (leituras) |
|---|---|---|
| `/transporte` | — | `viaturaService.listarViaturas`, `atividadeService.listarAtividades` |
| `/transporte/veiculos` | `criarViaturaAction` | `viaturaService.listarViaturas` |
| `/transporte/veiculos/[id]` | `atualizarViaturaAction`, `transitarViaturaAction`, `adicionarDocumentoViaturaAction`, `registarManutencaoViaturaAction`, `registarChecklistAction` | `viaturaService.obterViatura` |
| `/transporte/motoristas` | `criarMotoristaAction` | `motoristaService.listarMotoristas` |
| `/transporte/motoristas/[id]` | `atualizarMotoristaAction`, `adicionarDocumentoMotoristaAction`, `atualizarDisponibilidadeAction` | `motoristaService.obterMotorista` |
| `/transporte/atividades` | `criarAtividadeAction` | `atividadeService.listarAtividades` |
| `/transporte/atividades/[id]` | `atualizarAtividadeAction`, `transitarAtividadeAction` | `atividadeService.obterAtividade` |
| `/transporte/rotas` | `criarRotaAction` | `rotaService.listarRotas` |
| `/transporte/rotas/[id]` | `atualizarRotaAction`, `transitarRotaAction`, `atribuirRecursosRotaAction` | `rotaService.obterRota` |
| `/transporte/entregas` | `criarEntregaAction` | `entregaService.listarEntregas` |
| `/transporte/entregas/[id]` | `atualizarEntregaAction`, `transitarEntregaAction`, `registarProvaEntregaAction`, `atribuirRecursosEntregaAction` | `entregaService.obterEntrega` |
| `/transporte/combustivel` | `registarAbastecimentoAction` | `abastecimentoService.listarAbastecimentos` |

### 8.2 Tickets

| Página | Server Actions (mutações) | Serviço (leituras) |
|---|---|---|
| `/tickets` | `criarTicketAction` | `ticketService.listarTickets` |
| `/tickets/[id]` | `atualizarTicketAction`, `transitarTicketAction`, `atribuirTicketAction`, `adicionarComentarioTicketAction`, `avaliarTicketAction` | `ticketService.obterTicket` |
| `/tickets/configuracoes/categorias` | `criarCategoriaTicketAction`, `atualizarCategoriaTicketAction` | `categoriaTicketService.listarCategorias` |
| `/tickets/configuracoes/equipes` | `criarEquipeSuporteAction`, `atualizarEquipeSuporteAction` | `equipeSuporteService.listarEquipes` |
| `/tickets/base-conhecimento` | `criarArtigoBaseConhecimentoAction` | `baseConhecimentoService.listarArtigos` |
| `/tickets/base-conhecimento/[id]` | `atualizarArtigoBaseConhecimentoAction` | `baseConhecimentoService.obterArtigo` |

---

## 9. Correcções aplicadas em ADR-0003 (gate Wave 1)

| Item | Acção aplicada |
|---|---|
| A6 — interfaces em falta | Criados `rota.interface.ts`, `entrega.interface.ts`, `abastecimento.interface.ts` com TRANSICOES_ROTA, TRANSICOES_ENTREGA e contratos IRotaService/IEntregaService/IAbastecimentoService |
| A1 — tenantId em filhos | Adicionados `tenantId String` + `@@index([tenantId])` a: ItemChecklist, EventoAtividade, ItemEntrega |
| N1 — pt-PT | `PLANEJADA` → `PLANEADA` no enum `EstadoRota` e no `@default(PLANEADA)` da Rota |
| Partilhado | `operacoes/types.ts` reescrito como re-exportação pura de `@/server/services/types`; todas as interfaces importam `Ctx`/`TxClient`/`PaginatedResult` dessa fonte |
| Numeração | JSDoc em criarAtividade/criarEntrega/criarTicket documenta `proximoNumeroSerie(tx, 'ATIVIDADE'|'ENTREGA'|'TICKET', ctx)` de `@/server/services/financas` (WS D deve expandir TipoSerieDocumento) |

Validações após correcções: `npx prisma validate` ✓ — `npx tsc --noEmit` ✓

---

## 10. Tarefas pendentes para o orquestrador

### Pré-Wave 3 (orquestrador)
1. Adicionar back-references dos modelos WS F em `prisma/schema/tenant.prisma` (e.g. `viaturas Viatura[]`).
2. Acrescentar modelos WS F ao `TENANT_MODELS` em `src/server/db/tenant-extension.ts`.
3. Gerar migration `0006_operacoes` (ordem determinística: F após E).

### Wave 3 (WS F)
4. Integração cruzada real: `Entrega.clienteId` → validar existência via WS C.
5. Integração cruzada real: `ItemEntrega.produtoId` → validar stock via WS A.
6. Remover mocks inline (viaturas/motoristas) quando dados reais existirem.
7. Conversão das páginas de transporte/tickets para Server Components (data-fetching) — tasks 2.5/2.7 adiadas.

---

## 11. Dependências para Wave 2 e 3

| Dependência | WS origem | Fase |
|---|---|---|
| `reservarStock` / `baixarStock` | A | Wave 3 (quando entrega afectar stock) |
| `registarMovimentoCaixa` | D | Wave 3 (se taxa de entrega gerar movimento) |
| `SerieDocumento.proximoNumeroSerie` | D | Wave 2/3 (numeração de Tickets) |
| Cliente/Venda — validar existência | C | Wave 3 (cruzamento real) |
| Produto — validar existência em ItemEntrega | A | Wave 3 |
