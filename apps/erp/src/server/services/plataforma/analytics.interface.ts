import 'server-only';

// ---------------------------------------------------------------------------
// Contexto de serviço — nunca vem do cliente
// ---------------------------------------------------------------------------

export interface Ctx {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Tags de cache (Next.js unstable_cache)
//
// Cada tag é invalidada pelas Server Actions dos WS correspondentes via
// `revalidateTag(tag)`. O IDashboardService usa `unstable_cache` com as tags
// listadas em cada método.
//
// Convenção: as actions dos outros WS DEVEM incluir a tag relevante em
// `revalidate.tags` do seu `createSafeAction`.
// ---------------------------------------------------------------------------

export const ANALYTICS_TAGS = {
  /** Invalidado por acções de Venda, ItemVenda, Comissao (WS C). */
  vendas: 'vendas',
  /** Invalidado por acções de MovimentoStock, SaldoStock, InventarioFisico (WS A). */
  stock: 'stock',
  /** Invalidado por acções de PedidoCompra, ContaPagar, RecepcaoMercadoria (WS B). */
  compras: 'compras',
  /** Invalidado por acções de SessaoCaixa, Lancamento, Fatura (WS D). */
  financas: 'financas',
  /** Invalidado por acções de Colaborador, RegistoAssiduidade, Ferias, Projeto (WS E). */
  rh: 'rh',
  /** Invalidado por acções de Ticket, Atividade, Viatura (WS F). */
  operacoes: 'operacoes',
  /** Tag geral do dashboard; invalidada quando qualquer módulo actualiza. */
  dashboard: 'dashboard',
} as const;

export type AnalyticsTag = (typeof ANALYTICS_TAGS)[keyof typeof ANALYTICS_TAGS];

// ---------------------------------------------------------------------------
// KPI types — valores monetários como string (Decimal serializado, MZN)
// ---------------------------------------------------------------------------

/** KPIs de Vendas — painel /vendas/dashboard. */
export interface KpiVendas {
  /** Total de vendas no mês corrente (MZN). */
  totalVendasMes: string;
  /** Total de vendas no mesmo mês do ano anterior (MZN). */
  totalVendasAnoAnterior: string;
  /** Variação percentual mês vs. mês anterior (ex.: "12.50" para +12,5%). */
  variacaoPercent: string;
  quantidadeVendas: number;
  ticketMedio: string;
  /** Clientes com pelo menos uma venda nos últimos 90 dias. */
  clientesAtivos: number;
  /** Comissões calculadas e ainda não pagas. */
  comissoesDevidas: string;
}

/** KPIs de Stock — painel /stock/dashboard. */
export interface KpiStock {
  /** Valor total do stock em armazém (custo médio × quantidade). */
  valorTotalStock: string;
  /** Número de SKUs com saldo abaixo do mínimo configurado. */
  produtosAbaixoMinimo: number;
  /** Rotatividade: valor saído / valor médio em stock, últimos 30 dias (%). */
  rotatividade30d: string;
  /** SKUs sem qualquer movimento nos últimos 90 dias. */
  produtosSemMovimento90d: number;
}

/** KPIs de Compras — painel /compras e /procurement. */
export interface KpiCompras {
  /** Total de compras recebidas no mês corrente. */
  totalComprasMes: string;
  /** PedidoCompra em estado PENDENTE ou EM_APROVACAO. */
  pedidosPendentes: number;
  /** Soma de ContaPagar com dataVencimento < hoje. */
  contasAPagarVencidas: string;
  /** Média de dias em aberto das contas a pagar não liquidadas. */
  agingMediaDias: number;
}

/** KPIs de Finanças — painel /contabilidade e /caixa. */
export interface KpiFinancas {
  /** Saldo das SessaoCaixa abertas (soma de MovimentoCaixa). */
  saldoCaixaAtual: string;
  /** Soma das receitas (créditos em contas de rendimento) no mês corrente. */
  receitaMes: string;
  /** Soma das despesas (débitos em contas de gasto) no mês corrente. */
  despesaMes: string;
  /** Resultado líquido = receitaMes − despesaMes. */
  resultadoLiquido: string;
  /** Ratio "ContaBancaria reconciliadas / total" (ex.: "3/5"). */
  reconciliacaoRatio: string;
}

/** KPIs de RH & Projectos — painel /rh e /projetos. */
export interface KpiRH {
  /** Colaboradores com ativo=true e sem deletedAt. */
  colaboradoresAtivos: number;
  /** RegistoAssiduidade com tipo AUSENCIA na data de hoje. */
  ausenciasHoje: number;
  /** Ferias com estado PENDENTE (aguardam aprovação). */
  feriasPendentesAprovacao: number;
  /** Projectos em estado EM_CURSO. */
  projetosEmCurso: number;
  /** Horas totais registadas em Timesheet no mês corrente. */
  timesheetHorasMes: string;
}

/** KPIs de Operações — painel /tickets e /transporte. */
export interface KpiOperacoes {
  /** Tickets em estados ABERTO ou EM_ANALISE. */
  ticketsAbertos: number;
  /** Tickets abertos cujo prazo de SLA ainda não foi ultrapassado. */
  ticketsDentroSLA: number;
  /** Tickets abertos com prazo de SLA ultrapassado. */
  ticketsForaSLA: number;
  /** Viaturas com estado DISPONIVEL. */
  viaturaDisponiveis: number;
  /** Viaturas em missão (Atividade activa). */
  viaturaEmMissao: number;
  /** Viaturas em manutenção ou com documentos expirados bloqueadas. */
  viaturaEmManutencao: number;
  /** Atividades de transporte programadas para hoje. */
  atividadesHoje: number;
}

/** Resumo agregado para o dashboard geral (página /). */
export interface DashboardGeral {
  vendas: Pick<KpiVendas, 'totalVendasMes' | 'variacaoPercent' | 'quantidadeVendas'>;
  stock: Pick<KpiStock, 'produtosAbaixoMinimo' | 'valorTotalStock'>;
  compras: Pick<KpiCompras, 'pedidosPendentes' | 'contasAPagarVencidas'>;
  financas: Pick<KpiFinancas, 'saldoCaixaAtual' | 'resultadoLiquido'>;
  rh: Pick<KpiRH, 'colaboradoresAtivos' | 'ausenciasHoje'>;
  operacoes: Pick<KpiOperacoes, 'ticketsAbertos' | 'ticketsDentroSLA' | 'ticketsForaSLA'>;
}

// ---------------------------------------------------------------------------
// Interface de serviço
// ---------------------------------------------------------------------------

/**
 * IDashboardService — contratos de leitura agregada para KPIs e dashboards.
 *
 * REGRAS (inegociáveis):
 *  - Nunca N+1: cada método executa uma query agregada (GROUP BY/COUNT/SUM)
 *    ou um Promise.all de queries paralelas independentes.
 *  - Cada método é envolvido em `unstable_cache(fn, [tenantId, key], { tags })`
 *    na implementação — o cache é por-tenant.
 *  - A invalidação é responsabilidade das Server Actions dos WS correspondentes
 *    (ver `ANALYTICS_TAGS`); este serviço é read-only.
 *
 * Cross-domain: este serviço lê de modelos de TODOS os WS. Na Wave 2, usa
 * queries directas ao Prisma (mesmo schema, banco partilhado). Na Wave 3,
 * as queries serão ajustadas se surgirem índices em falta.
 *
 * Implementação em Wave 2: `src/server/services/plataforma/analytics.service.ts`
 */
export interface IDashboardService {
  /**
   * Dashboard geral — agregado de todos os domínios para a página inicial.
   *
   * Tags de cache: todas ([`dashboard`, `vendas`, `stock`, `compras`, `financas`, `rh`, `operacoes`])
   * TTL sugerido: 60 s (dados de gestão, não de operação em tempo real).
   *
   * Lê de: Venda (C), SaldoStock (A), PedidoCompra/ContaPagar (B),
   *         SessaoCaixa/Lancamento (D), Colaborador/RegistoAssiduidade (E),
   *         Ticket (F).
   */
  dashboardGeral(ctx: Ctx): Promise<DashboardGeral>;

  /**
   * KPIs de vendas.
   *
   * Tags de cache: [`vendas`]
   * Invalidado por: criarVenda, cancelarVenda, registarComissao (WS C)
   *
   * Lê de (WS C): Venda, ItemVenda, Comissao, Cliente.
   * Lê de (WS D): SerieDocumento (para totais por série).
   */
  kpiVendas(ctx: Ctx): Promise<KpiVendas>;

  /**
   * KPIs de stock.
   *
   * Tags de cache: [`stock`]
   * Invalidado por: entradaStock, baixarStock, ajustarStock, iniciarInventario (WS A)
   *
   * Lê de (WS A): SaldoStock, MovimentoStock, Produto, Localizacao.
   */
  kpiStock(ctx: Ctx): Promise<KpiStock>;

  /**
   * KPIs de compras.
   *
   * Tags de cache: [`compras`]
   * Invalidado por: criarPedidoCompra, receberMercadoria, liquidarContaPagar (WS B)
   *
   * Lê de (WS B): PedidoCompra, ContaPagar, Fornecedor.
   */
  kpiCompras(ctx: Ctx): Promise<KpiCompras>;

  /**
   * KPIs de finanças.
   *
   * Tags de cache: [`financas`]
   * Invalidado por: abrirCaixa, fecharCaixa, emitirFatura, registarLancamento (WS D)
   *
   * Lê de (WS D): SessaoCaixa, MovimentoCaixa, Lancamento, PartidaLancamento,
   *               ContaBancaria, ReconciliacaoBancaria.
   */
  kpiFinancas(ctx: Ctx): Promise<KpiFinancas>;

  /**
   * KPIs de RH e Projectos.
   *
   * Tags de cache: [`rh`]
   * Invalidado por: criarColaborador, registarAssiduidade, submeterFerias,
   *                 criarProjeto, registarTimesheet (WS E)
   *
   * Lê de (WS E): Colaborador, RegistoAssiduidade, Ferias, Projeto, Timesheet.
   */
  kpiRH(ctx: Ctx): Promise<KpiRH>;

  /**
   * KPIs de Operações (Tickets + Transporte).
   *
   * Tags de cache: [`operacoes`]
   * Invalidado por: criarTicket, fecharTicket, criarAtividade,
   *                 alocarViatura, concluirAtividade (WS F)
   *
   * Lê de (WS F): Ticket, SLA, Atividade, Viatura, DocumentoViatura.
   */
  kpiOperacoes(ctx: Ctx): Promise<KpiOperacoes>;
}
