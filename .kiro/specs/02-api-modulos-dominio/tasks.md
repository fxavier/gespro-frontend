# Plano de Implementação: APIs e Serviços de Domínio

Execução: 7 agentes de domínio em paralelo (worktrees separados), coordenados pelo `orchestrator` (claude-fable-5). Cada workstream repete a mesma sequência interna; as tasks 1.x de todos os WS formam a Wave 1 e são revistas em conjunto pelo `code-reviewer` antes da Wave 2.

## Estrutura de cada Workstream (template)

- [ ] 1. Contratos (Wave 1)
  - [ ] 1.1 Modelos Prisma do domínio em `prisma/schema/<modulo>.prisma` (convenções spec 01)
  - [ ] 1.2 Zod schemas em `src/lib/validations/<modulo>.ts` (Create/Update/Filter)
  - [ ] 1.3 Interfaces de serviço (assinaturas + tipos) e mapa de máquinas de estado
  - [ ] 1.4 Nota de contratos expostos a outros WS (funções que outros chamarão)
- [ ] 2. Implementação (Wave 2)
  - [ ] 2.1 Serviços de domínio + testes unitários (≥80%)
  - [ ] 2.2 Property tests das máquinas de estado (fast-check)
  - [ ] 2.3 Server Actions via `createSafeAction` com revalidação declarada
  - [ ] 2.4 Seed do módulo a partir dos mocks de `src/data`
  - [ ] 2.5 Conversão do data-fetching das páginas para Server Components (visual inalterado; UI é spec 03)
  - [ ] 2.6 Route Handlers de exportação onde requerido
  - [ ] 2.7 Remover mocks e re-exports temporários de tipos
- [ ] 3. Integração (Wave 3) — apenas WS com dependências cruzadas
- [ ] 4. Handoff para spec 03: documento `docs/handoff/<ws>.md` com lista páginas→actions/serviços

## WS A — Catálogo & Inventário (agente: `domain-inventario`)

- [ ] A1. Contratos: `Produto`, `CategoriaProduto`, `Localizacao`, `MovimentoStock`, `SaldoStock`, `InventarioFisico`, `ContagemInventario`, `Ativo`, `Amortizacao`, `Manutencao` (incorporar spec existente `manutencao-detalhes`)
- [ ] A2. Serviços: catálogo CRUD; movimentos imutáveis + saldo agregado; portar `StockValidationService` (reserva, alertas, disponibilidade com lock optimista); inventário físico com reconciliação e ajustes automáticos; amortização linear com plano gerado
- [ ] A3. Expor contratos: `reservarStock()`, `baixarStock()`, `entradaStock()` (consumidos por B, C, E)
- [ ] A4. Exportações: relatório de stock e de activos (CSV)

## WS B — Compras & Fornecedores (agente: `domain-compras`)

- [ ] B1. Contratos: `Fornecedor`, `RequisicaoCompra` (+itens/aprovações — migrar de `src/data/requisicoes-compras.ts`), `Cotacao`, `PedidoCompra`, `RecepcaoMercadoria`, `ContaPagar`, `ContratoServico`, `NivelAprovacao`
- [ ] B2. Serviços: fluxo requisição→aprovação multi-nível por valor→cotação→pedido→recepção (transacção com `entradaStock()` de A)→conta a pagar; scoring de fornecedores; aging de contas a pagar
- [ ] B3. Unificação `compras`/`procurement` num único domínio de serviço; documentar mapeamento de rotas para o spec 03
- [ ] B4. Property tests: aprovação nunca salta níveis; recepção parcial nunca excede quantidade pedida

## WS C — Comercial (agente: `domain-comercial`)

- [ ] C1. Contratos: `Cliente` (NUIT/BI, endereços com províncias, segmentos), `Venda`, `ItemVenda`, `SessaoPOS`, `Comissao`, `RegraComissao`
- [ ] C2. Serviços: pipeline de vendas; POS com venda em transacção (baixa stock via A + movimento de caixa via contrato D); portar `ComissaoService` com testes
- [ ] C3. Relatórios: comissões por vendedor/período; histórico de cliente

## WS D — Finanças (agente: `domain-financas`)

- [ ] D1. Contratos: `SessaoCaixa`, `MovimentoCaixa`, `ContaPGC`, `Lancamento`, `PartidaLancamento`, `Diario`, `CentroCusto`, `SerieDocumento`, `Fatura`, `LinhaFatura`, `NotaCredito`, `Proforma`
- [ ] D2. Serviços: abertura/fecho de caixa com conferência e bloqueio por pendências; lançamentos com invariante débito=crédito (property test); balancete/razão/DRE por agregação; emissão de factura com numeração sequencial transaccional e imutabilidade; nota de crédito referenciada; IVA 16%
- [ ] D3. Expor contratos: `registarLancamentoContabilistico()`, `registarMovimentoCaixa()` (consumidos por A, B, C)
- [ ] D4. Exportações: DRE e balancete (CSV/PDF via Route Handler)

## WS E — Pessoas & Projectos (agente: `domain-pessoas-projetos`)

- [ ] E1. Contratos: `Colaborador`, `RegistoAssiduidade`, `Ferias`, `Formacao`, `Projeto`, `TarefaProjeto`, `Marco`, `Timesheet`, `OrcamentoProjeto`, `BOM`, `Roteiro`, `OrdemProducao`, `ConsumoProducao`
- [ ] E2. Serviços: assiduidade e férias com saldos; kanban (posições ordenadas por chave fraccional para drag-and-drop estável); timesheet ligado a tarefas; ordens de produção com consumo de stock (contrato A) e apuramento de custo real vs. padrão
- [ ] E3. Registar extensão futura: processamento salarial (fora de âmbito)

## WS F — Operações (agente: `domain-operacoes`)

- [ ] F1. Contratos: portar integralmente o domínio do spec `transporte-logistica-refatoracao` (`Atividade`, `Viatura`, `Motorista`, `DocumentoViatura`, `DocumentoMotorista`, `ManutencaoViatura`, `Checklist`) para Prisma; `Ticket`, `ComentarioTicket`, `SLA`
- [ ] F2. Serviços: portar `transporte-alocacao.service.ts` e `transporte-alertas.service.ts` com os property tests existentes (documento expirado bloqueia alocação, etc.); tickets com SLA e escalamento
- [ ] F3. Job de recálculo de estado de documentos (`valido`/`proximo_expirar`/`expirado`) via route handler cron-safe (`/api/cron/transporte-alertas`)

## WS G — Plataforma (agente: `domain-plataforma`)

- [ ] G1. Contratos: gestão de tenants (plataforma) e de utilizadores/roles (admin do tenant) sobre os modelos do spec 01
- [ ] G2. Serviços de analytics: uma query agregada dedicada por painel de KPI (dashboard geral, compras, vendas, stock, RH), com `unstable_cache` + tags invalidadas pelas actions dos outros WS
- [ ] G3. Ecrã de auditoria (consome `GET /api/audit` do spec 01)
- [ ] G4. Verificação final: lint/CI a falhar se existir qualquer import de `src/data/*`

## Gate de Saída do Spec 02

- [ ] Todas as migrations geradas em ordem determinística pelo orquestrador e aplicáveis de raiz
- [ ] `pnpm check` verde; cobertura serviços ≥ 80%
- [ ] Handoffs `docs/handoff/*.md` completos para o spec 03
