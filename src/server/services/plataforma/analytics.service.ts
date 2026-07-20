import 'server-only';
import { unstable_cache } from 'next/cache';
import { prismaBase } from '@/server/db/client';
import type { Ctx } from '@/server/services/types';
import {
  ANALYTICS_TAGS,
  type IDashboardService,
  type KpiVendas,
  type KpiStock,
  type KpiCompras,
  type KpiFinancas,
  type KpiRH,
  type KpiOperacoes,
  type DashboardGeral,
} from './analytics.interface';

// ---------------------------------------------------------------------------
// Helpers de data
// ---------------------------------------------------------------------------

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameMonthLastYear(d = new Date()): { start: Date; end: Date } {
  const start = new Date(d.getFullYear() - 1, d.getMonth(), 1);
  const end = new Date(d.getFullYear() - 1, d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function dec(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(String(v));
}

function fmt(v: number): string {
  return v.toFixed(2);
}

// ---------------------------------------------------------------------------
// KPI Vendas — WS C (Venda, Comissao, Cliente)
// Invalidado por: ANALYTICS_TAGS.vendas
// ---------------------------------------------------------------------------

export async function kpiVendasImpl(tenantId: string): Promise<KpiVendas> {
  const som = startOfMonth();
  const { start: lyStart, end: lyEnd } = sameMonthLastYear();

  const cutoff90d = daysAgo(90);

  const [thisMonth, lastYear, clientesAtivos90d, comissoesPend] = await Promise.all([
    prismaBase.venda.aggregate({
      where: {
        tenantId,
        status: { not: 'CANCELADA' },
        dataVenda: { gte: som },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prismaBase.venda.aggregate({
      where: {
        tenantId,
        status: { not: 'CANCELADA' },
        dataVenda: { gte: lyStart, lte: lyEnd },
      },
      _sum: { total: true },
    }),
    // Wave 3: "activos" = clientes com venda nos últimos 90 dias (join via Venda.clienteId)
    // clienteId nullable = venda anónima (POS sem identificação); excluímos nulls.
    prismaBase.venda.findMany({
      where: {
        tenantId,
        clienteId: { not: null },
        status: { not: 'CANCELADA' },
        dataVenda: { gte: cutoff90d },
      },
      select: { clienteId: true },
      distinct: ['clienteId'],
    }),
    prismaBase.comissao.aggregate({
      where: { tenantId, status: { in: ['PENDENTE', 'APROVADA'] } },
      _sum: { valorComissao: true },
    }),
  ]);

  const totalMes = dec(thisMonth._sum.total);
  const totalAno = dec(lastYear._sum.total);
  const qty = thisMonth._count._all;
  const variacao = totalAno > 0 ? ((totalMes - totalAno) / totalAno) * 100 : 0;

  return {
    totalVendasMes: fmt(totalMes),
    totalVendasAnoAnterior: fmt(totalAno),
    variacaoPercent: fmt(variacao),
    quantidadeVendas: qty,
    ticketMedio: qty > 0 ? fmt(totalMes / qty) : '0.00',
    clientesAtivos: clientesAtivos90d.length,
    comissoesDevidas: fmt(dec(comissoesPend._sum.valorComissao)),
  };
}

// ---------------------------------------------------------------------------
// KPI Stock — WS A (SaldoStock, MovimentoStock, Produto)
// Invalidado por: ANALYTICS_TAGS.stock
// ---------------------------------------------------------------------------

export async function kpiStockImpl(tenantId: string): Promise<KpiStock> {
  const cutoff90d = daysAgo(90);
  const cutoff30d = daysAgo(30);

  // Valor total do stock: SaldoStock.saldo × Produto.precoCompra (JOIN via include)
  // Nota: não é N+1 — Prisma gera um JOIN SQL.
  const saldos = await prismaBase.saldoStock.findMany({
    where: { tenantId },
    select: { saldo: true, produto: { select: { precoCompra: true, stockMinimo: true } } },
  });

  const valorTotalStock = saldos.reduce(
    (acc, s) => acc + dec(s.saldo) * dec(s.produto.precoCompra),
    0,
  );

  const produtosAbaixoMinimo = saldos.filter(
    (s) => s.produto.stockMinimo !== null && dec(s.saldo) < dec(s.produto.stockMinimo),
  ).length;

  // Produtos com movimento nos últimos 90 dias (distinct produtoId)
  const [comMovimento90d, totalProdutos, movimentos30d] = await Promise.all([
    prismaBase.movimentoStock.findMany({
      where: { tenantId, createdAt: { gte: cutoff90d } },
      select: { produtoId: true },
      distinct: ['produtoId'],
    }),
    prismaBase.produto.count({ where: { tenantId, ativo: true, deletedAt: null } }),
    prismaBase.movimentoStock.count({
      where: {
        tenantId,
        tipo: { in: ['SAIDA', 'TRANSFERENCIA_SAIDA'] },
        createdAt: { gte: cutoff30d },
      },
    }),
  ]);

  const produtosSemMovimento90d = Math.max(0, totalProdutos - comMovimento90d.length);

  // Rotatividade simplificada: movimentos de saída nos 30d / total produtos × 100
  const rotatividade = totalProdutos > 0
    ? (movimentos30d / totalProdutos) * 100
    : 0;

  return {
    valorTotalStock: fmt(valorTotalStock),
    produtosAbaixoMinimo,
    rotatividade30d: fmt(rotatividade),
    produtosSemMovimento90d,
  };
}

// ---------------------------------------------------------------------------
// KPI Compras — WS B (PedidoCompra, ContaPagar, Fornecedor)
// Invalidado por: ANALYTICS_TAGS.compras
// ---------------------------------------------------------------------------

export async function kpiComprasImpl(tenantId: string): Promise<KpiCompras> {
  const som = startOfMonth();
  const hoje = new Date();

  const [totalMes, pendentes, vencidas, agingData] = await Promise.all([
    prismaBase.pedidoCompra.aggregate({
      where: {
        tenantId,
        status: { not: 'CANCELADO' },
        createdAt: { gte: som },
      },
      _sum: { valorTotal: true },
    }),
    prismaBase.pedidoCompra.count({
      where: {
        tenantId,
        status: { in: ['RASCUNHO', 'ENVIADO'] },
      },
    }),
    prismaBase.contaPagar.aggregate({
      where: {
        tenantId,
        status: { in: ['ABERTA', 'VENCIDA'] },
        dataVencimento: { lt: hoje },
      },
      _sum: { valorRestante: true },
    }),
    prismaBase.contaPagar.findMany({
      where: { tenantId, status: { in: ['ABERTA', 'VENCIDA', 'PARCIALMENTE_PAGA'] } },
      select: { dataVencimento: true },
    }),
  ]);

  // Média de aging em dias
  const agingMediaDias =
    agingData.length > 0
      ? Math.round(
          agingData.reduce((acc, c) => {
            const diff = Math.max(0, (hoje.getTime() - c.dataVencimento.getTime()) / 86_400_000);
            return acc + diff;
          }, 0) / agingData.length,
        )
      : 0;

  return {
    totalComprasMes: fmt(dec(totalMes._sum.valorTotal)),
    pedidosPendentes: pendentes,
    contasAPagarVencidas: fmt(dec(vencidas._sum.valorRestante)),
    agingMediaDias,
  };
}

// ---------------------------------------------------------------------------
// KPI Finanças — WS D (SessaoCaixa, MovimentoCaixa, Lancamento, ContaBancaria)
// Invalidado por: ANALYTICS_TAGS.financas
// ---------------------------------------------------------------------------

export async function kpiFinancasImpl(tenantId: string): Promise<KpiFinancas> {
  const som = startOfMonth();

  const [caixaAgg, receitaAgg, despesaAgg, totalItensRecon, itensConciliados] = await Promise.all([
    // Saldo das caixas abertas: fundo_inicial + entradas - saídas
    prismaBase.sessaoCaixa.aggregate({
      where: { tenantId, status: 'ABERTA' },
      _sum: { fundoInicial: true, totalEntradas: true, totalSaidas: true },
    }),
    // Movimentos de entrada no mês
    prismaBase.movimentoCaixa.aggregate({
      where: {
        tenantId,
        tipo: { in: ['VENDA', 'RECEBIMENTO', 'REFORCO'] },
        dataMovimento: { gte: som },
      },
      _sum: { valor: true },
    }),
    // Movimentos de saída no mês
    prismaBase.movimentoCaixa.aggregate({
      where: {
        tenantId,
        tipo: { in: ['SANGRIA', 'DEVOLUCAO'] },
        dataMovimento: { gte: som },
      },
      _sum: { valor: true },
    }),
    // Wave 3: ratio de reconciliação via ItemReconciliacaoBancaria.conciliado
    prismaBase.itemReconciliacaoBancaria.count({ where: { tenantId } }),
    prismaBase.itemReconciliacaoBancaria.count({ where: { tenantId, conciliado: true } }),
  ]);

  const saldoCaixa =
    dec(caixaAgg._sum.fundoInicial) +
    dec(caixaAgg._sum.totalEntradas) -
    dec(caixaAgg._sum.totalSaidas);

  const receita = dec(receitaAgg._sum.valor);
  const despesa = dec(despesaAgg._sum.valor);

  return {
    saldoCaixaAtual: fmt(saldoCaixa),
    receitaMes: fmt(receita),
    despesaMes: fmt(despesa),
    resultadoLiquido: fmt(receita - despesa),
    reconciliacaoRatio: `${itensConciliados}/${totalItensRecon}`,
  };
}

// ---------------------------------------------------------------------------
// KPI RH — WS E (Colaborador, RegistoAssiduidade, SolicitacaoFerias, Projeto, Timesheet)
// Invalidado por: ANALYTICS_TAGS.rh
// ---------------------------------------------------------------------------

export async function kpiRHImpl(tenantId: string): Promise<KpiRH> {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fimHoje = new Date(inicioHoje.getTime() + 86_400_000 - 1);
  const som = startOfMonth();

  const [
    ativos,
    ausenciasHoje,
    feriasPendentes,
    projetosEmAndamento,
    timesheetHoras,
  ] = await Promise.all([
    prismaBase.colaborador.count({ where: { tenantId, status: 'ACTIVO' } }),
    prismaBase.registoAssiduidade.count({
      where: { tenantId, tipo: 'AUSENCIA', data: { gte: inicioHoje, lte: fimHoje } },
    }),
    prismaBase.solicitacaoFerias.count({ where: { tenantId, status: 'PENDENTE' } }),
    prismaBase.projeto.count({ where: { tenantId, status: 'EM_ANDAMENTO' } }),
    prismaBase.timesheet.aggregate({
      where: { tenantId, data: { gte: som } },
      _sum: { duracaoHoras: true },
    }),
  ]);

  return {
    colaboradoresAtivos: ativos,
    ausenciasHoje,
    feriasPendentesAprovacao: feriasPendentes,
    projetosEmCurso: projetosEmAndamento,
    timesheetHorasMes: fmt(dec(timesheetHoras._sum.duracaoHoras)),
  };
}

// ---------------------------------------------------------------------------
// KPI Operações — WS F (Ticket, Atividade, Viatura)
// Invalidado por: ANALYTICS_TAGS.operacoes
// ---------------------------------------------------------------------------

export async function kpiOperacoesImpl(tenantId: string): Promise<KpiOperacoes> {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fimHoje = new Date(inicioHoje.getTime() + 86_400_000 - 1);

  const [
    ticketsAbertos,
    ticketsDentroSLA,
    ticketsForaSLA,
    viaturaDisponiveis,
    viaturaEmMissao,
    viaturaEmManutencao,
    atividadesHoje,
  ] = await Promise.all([
    prismaBase.ticket.count({
      where: { tenantId, estado: { in: ['ABERTO', 'EM_PROGRESSO', 'AGUARDANDO_CLIENTE'] } },
    }),
    prismaBase.ticket.count({
      where: {
        tenantId,
        estado: { in: ['ABERTO', 'EM_PROGRESSO', 'AGUARDANDO_CLIENTE'] },
        slaDataLimiteResposta: { gte: hoje },
      },
    }),
    prismaBase.ticket.count({
      where: {
        tenantId,
        estado: { in: ['ABERTO', 'EM_PROGRESSO', 'AGUARDANDO_CLIENTE'] },
        slaDataLimiteResposta: { lt: hoje },
      },
    }),
    prismaBase.viatura.count({ where: { tenantId, estado: 'DISPONIVEL' } }),
    prismaBase.viatura.count({ where: { tenantId, estado: 'EM_ACTIVIDADE' } }),
    prismaBase.viatura.count({ where: { tenantId, estado: 'EM_MANUTENCAO' } }),
    prismaBase.atividade.count({
      where: {
        tenantId,
        dataInicioPrevista: { gte: inicioHoje, lte: fimHoje },
        estado: { in: ['PLANEADA', 'EM_CURSO'] },
      },
    }),
  ]);

  return {
    ticketsAbertos,
    ticketsDentroSLA,
    ticketsForaSLA,
    viaturaDisponiveis,
    viaturaEmMissao,
    viaturaEmManutencao,
    atividadesHoje,
  };
}

// ---------------------------------------------------------------------------
// Dashboard Geral — agrega todos os domínios
// Invalidado por: todos os ANALYTICS_TAGS
// ---------------------------------------------------------------------------

export async function dashboardGeralImpl(tenantId: string): Promise<DashboardGeral> {
  const [vendas, stock, compras, financas, rh, operacoes] = await Promise.all([
    kpiVendasImpl(tenantId),
    kpiStockImpl(tenantId),
    kpiComprasImpl(tenantId),
    kpiFinancasImpl(tenantId),
    kpiRHImpl(tenantId),
    kpiOperacoesImpl(tenantId),
  ]);

  return {
    vendas: {
      totalVendasMes: vendas.totalVendasMes,
      variacaoPercent: vendas.variacaoPercent,
      quantidadeVendas: vendas.quantidadeVendas,
    },
    stock: {
      produtosAbaixoMinimo: stock.produtosAbaixoMinimo,
      valorTotalStock: stock.valorTotalStock,
    },
    compras: {
      pedidosPendentes: compras.pedidosPendentes,
      contasAPagarVencidas: compras.contasAPagarVencidas,
    },
    financas: {
      saldoCaixaAtual: financas.saldoCaixaAtual,
      resultadoLiquido: financas.resultadoLiquido,
    },
    rh: {
      colaboradoresAtivos: rh.colaboradoresAtivos,
      ausenciasHoje: rh.ausenciasHoje,
    },
    operacoes: {
      ticketsAbertos: operacoes.ticketsAbertos,
      ticketsDentroSLA: operacoes.ticketsDentroSLA,
      ticketsForaSLA: operacoes.ticketsForaSLA,
    },
  };
}

// ---------------------------------------------------------------------------
// Serviço público — impl functions envolvidas em unstable_cache por-tenant
// ---------------------------------------------------------------------------

const REVALIDATE = 60; // segundos

export const dashboardService: IDashboardService = {
  kpiVendas(ctx: Ctx) {
    return unstable_cache(kpiVendasImpl, ['kpi-vendas'], {
      tags: [ANALYTICS_TAGS.vendas],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },

  kpiStock(ctx: Ctx) {
    return unstable_cache(kpiStockImpl, ['kpi-stock'], {
      tags: [ANALYTICS_TAGS.stock],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },

  kpiCompras(ctx: Ctx) {
    return unstable_cache(kpiComprasImpl, ['kpi-compras'], {
      tags: [ANALYTICS_TAGS.compras],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },

  kpiFinancas(ctx: Ctx) {
    return unstable_cache(kpiFinancasImpl, ['kpi-financas'], {
      tags: [ANALYTICS_TAGS.financas],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },

  kpiRH(ctx: Ctx) {
    return unstable_cache(kpiRHImpl, ['kpi-rh'], {
      tags: [ANALYTICS_TAGS.rh],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },

  kpiOperacoes(ctx: Ctx) {
    return unstable_cache(kpiOperacoesImpl, ['kpi-operacoes'], {
      tags: [ANALYTICS_TAGS.operacoes],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },

  dashboardGeral(ctx: Ctx) {
    return unstable_cache(dashboardGeralImpl, ['dashboard-geral'], {
      tags: Object.values(ANALYTICS_TAGS),
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },
};
