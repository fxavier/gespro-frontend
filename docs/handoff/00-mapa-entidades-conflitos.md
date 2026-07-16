# Mapa de Propriedade de Entidades & Arbitragem de Conflitos (input Wave 1)

> Produzido por 7 inventários paralelos read-only (A–G) sobre `src/types`, `src/data`,
> `src/lib/storage`, `src/services` e as páginas. É o input que o gate da Wave 1 exige
> ("code-reviewer valida consistência inter-domínio antes de gerar migrations").
> **Decisões marcadas 🔴 precisam de confirmação do owner** (negócio/fiscal); as ⚪ o
> orquestrador decide por design.md.

## 1. Propriedade canónica de entidades (uma entidade → um workstream dono)

| WS | Dono de (entidades canónicas) |
|----|-------------------------------|
| **A — Inventário** | Produto, VarianteProduto, CategoriaProduto, MovimentoStock, SaldoStock, Localizacao, Ativo, CategoriaAtivo, MovimentacaoAtivo, ManutencaoAtivo, InventarioFisico, ItemInventario, AmortizacaoCalculo |
| **B — Compras** | Fornecedor, ContactoFornecedor, DocumentoFornecedor, RequisicaoCompra, ItemRequisicao, AprovacaoWorkflow, ConfiguracaoWorkflow/NivelAprovacao, Cotacao(RFQ), PedidoCompra, RecebimentoCompra, ContaPagar, Pagamento, Servico, CategoriaServico, AgendamentoServico, TecnicoServico, ContratoServico |
| **C — Comercial** | Cliente, EnderecoCliente, ContactoCliente, HistoricoTransacao, SegmentacaoCliente, Venda, ItemVenda, Comissao, RegraComissao |
| **D — Finanças** | SessaoCaixa, MovimentoCaixa, ContaPGC, Lancamento, PartidaLancamento, Diario, CentroCusto, ContaBancaria, ReconciliacaoBancaria, **SerieDocumento**, Fatura, LinhaFatura, NotaCredito, NotaDebito, Proforma, CotacaoComercial |
| **E — Pessoas & Projectos** | Colaborador, Departamento, Cargo, Ferias, Ausencia, RegistoAssiduidade, Avaliacao, Formacao, Payroll(futuro), Projeto, Tarefa, Equipa, Timesheet, Marco, OrcamentoProjeto, EstruturaProduto(BOM), ComponenteBOM, Roteiro, OrdemProducao, OperacaoOrdem, CentroTrabalho |
| **F — Operações** | Atividade, EventoAtividade, Viatura, DocumentoViatura, ManutencaoViatura, Checklist, Motorista, DocumentoMotorista, Rota, Entrega, Abastecimento, Ticket, CategoriaTicket, EquipeSuporte, BaseConhecimento |
| **G — Plataforma** | Tenant(extensão), User/Role/Permission/AuditLog (Wave 0), SystemModule(estático), contratos de leitura agregada (analytics) |

## 2. Conflitos e duplicações a resolver ANTES de gerar schemas

| # | Conflito (evidência) | WS | Resolução recomendada |
|---|---|---|---|
| 1 | **Cliente duplo**: `types/cliente.ts` (rico) vs `types/venda.ts` (leve, `tipo:individual/empresarial`, `endereco:string`) | C | ⚪ Canónico = `cliente.ts`. `venda.ts.Cliente` desaparece; Venda→FK Cliente. `tipo`∈{fisica,juridica,revendedor}; endereço é relação. |
| 2 | **Cotacao tripla**: RFQ de compras (`procurement.ts`/`data/cotacoes.ts`) vs cotação de venda (`faturacao/cotacoes`, `numeroCotacao COT`) | B/D | ⚪ RFQ = `Cotacao` em **B**. Cotação comercial = `CotacaoComercial` em **D** (ou fundir com Proforma). Nomes distintos, sem fusão. |
| 3 | **Fornecedor duplo**: `fornecedor.ts` (endereço/rating/formasPagamento) vs `procurement.ts` (crédito: saldoDevedor💰/limiteCredito💰/totalCompras💰) | B | ⚪ Um só `Fornecedor` = união dos campos (dados + crédito). |
| 4 | **Ordem de compra dupla**: `PedidoFornecedor` (PED, simples) vs `PedidoCompra` (PC, IVA/desconto/recebimentos/aprovações) | B | ⚪ Canónico = `PedidoCompra`. `PedidoFornecedor` descartado. |
| 5 | **ContactoFornecedor / DocumentoFornecedor** definidos 2× divergentes | B | ⚪ Unificar na versão rica de `fornecedor.ts`. |
| 6 | **ContaPagar sem modelo** (inline em `/fornecedores/contas-pagar`) sobrepõe `PagamentoFornecedor` | B→D | ⚪ Criar `ContaPagar` (documento a pagar) + `Pagamento` (liquidação); liquidação gera lançamento em D. |
| 7 | **Venda vs Pedido**: `venda.ts.Venda` (POS/directa) vs `pedido.ts.Pedido` (encomenda) + `ComissaoVendedor` | C | 🔴 Decidir: uma `Venda` com `origem`(pos/pedido/ecommerce) **ou** duas entidades com Pedido→Venda no faturar. Afeta comissões e stock. |
| 8 | **SessaoCaixa / MovimentoCaixa inexistentes** — POS[C] e caixa[D] precisam; hoje `vendasDia` hardcoded | D | ⚪ Modelar em **D**; C consome contrato `registarMovimentoCaixa(tx)`. (spec 02 D1/D3 já prevê.) |
| 9 | **Ativo/Localizacao/CategoriaAtivo SEM `tenantId`**; datas `Date` vs `string` inconsistentes | A | ⚪ Adicionar `tenantId` + registar em `TENANT_MODELS`; normalizar tudo a `DateTime`. |
| 10 | **Lixo de modelação**: `em_andamento`+`em_curso` duplicados (ManutencaoAtivo); typo `confirmdadaPor` | A | ⚪ Limpar no schema. |
| 11 | **PGC-NIRF placeholder**: seed de contas é genérico (`1`,`1.1`,…), não o plano oficial | D | 🔴 Precisa do **plano PGC-NIRF real (classes 1–8)** — spec 01 task 10. Fonte oficial? |
| 12 | **Numeração sequencial partida** (`Date.now()` em faturas/lançamentos/caixa) | D+todos | ⚪ `SerieDocumento` transaccional (`UPDATE…RETURNING`) para TODOS os docs (REQ/COT/PC/PED/PAG/REC/AT/TKT/CLI/FOR/SRV/AGD/Fatura/NC/ND). |
| 13 | **Kanban NÃO é drag-drop** (hoje read-only; status muda por botão) | E | ⚪ Implementar DnD persistente (chave fraccional) — spec 02 E2 + spec 03 task 9. |
| 14 | **Produção sem tipos nem persistência** (tudo inline nas páginas) | E | ⚪ Modelar de raiz BOM/OrdemProducao/Roteiro/CentroTrabalho; **validar DAG** (BOM recursivo → risco de ciclos). |
| 15 | **Operador/RegistoPresenca (produção) duplicam Colaborador/RegistoAssiduidade (RH)** | E | ⚪ Unificar: produção referencia `Colaborador`; sem tabela `Operador` paralela. |
| 16 | **Rota com 2 definições** (`types/transporte.ts` vs inline em `rotas/[id]`: origem/destino/pausada) | F | ⚪ Consolidar na versão da página + `transporte.md` (origem/destino/pontos/pausada). |
| 17 | **Tenant minimalista** (Wave 0) vs mock rico (fiscal/plano/moeda) | G | ⚪ Acrescentar `ConfiguracoesFiscais` (JSON ou modelo) + ligar `SerieDocumento`(D). |
| 18 | **Ticket sem FK à entidade de origem** (entrega/incidente) | F | ⚪ Polimorfismo opcional (`origemTipo`+`origemId`) para ligar entrega↔ticket. |
| 19 | **AuditLog sem escrita** (nenhum serviço escreve) | G/Found. | ⚪ Hooks de auditoria nos serviços de mutação (spec 01 task 8, ainda por fazer na Wave 0). |
| 20 | **Serviços de transporte já refatorizados** (Atividade central, alocação/alertas puros) | F | ⚪ Portar 1:1 para Prisma + property tests (já property-test-ready). Legado Rota/Entrega/Abastecimento consolida em paralelo. |

## 3. Contratos de integração inter-workstream (funções expostas)

| Fornecedor | Função (dentro de `$transaction`) | Consumidores |
|---|---|---|
| **A** | `reservarStock`, `confirmarConsumoStock`, `libertarStock`, `entradaStock`, `baixarStock` | B (recepção), C (venda/POS), E (produção) |
| **D** | `proximoNumeroSerie(tx, serie)`, `registarLancamentoContabilistico(tx, doc)`, `registarMovimentoCaixa(tx, mov)` | A (amortização/abate), B (conta a pagar), C (factura/POS) |
| **C** | factura de venda → D; histórico cliente | D, G |
| **E** | consumo de produção → A; custo mão-de-obra ← RH | A |
| **G** | contratos de leitura agregada (só leitura, cache por tags) | lê de todos |

Regra (design.md §35): integração com consistência obrigatória = **chamada de serviço directa na mesma transacção** (venda→stock→caixa; recepção→stock→conta a pagar; factura→contabilidade). Sem message broker nesta fase.

## 4. Ordem determinística de migrations (orquestrador, fim da Wave 1)
`A → B → C → D → E → F → G` (consumidores depois de fornecedores). Nomes `00XX_<modulo>`.
Nota: como o ambiente ainda não tem `DATABASE_URL`, as migrations ficam adiadas; os schemas validam via `prisma validate`.
