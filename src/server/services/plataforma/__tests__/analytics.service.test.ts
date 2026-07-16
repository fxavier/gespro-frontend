import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn(<T extends (...args: unknown[]) => unknown>(fn: T) => fn),
}));

const mocks = vi.hoisted(() => ({
  vendaAggregate: vi.fn(),
  vendaFindMany: vi.fn(), // Wave 3: clientesAtivos via findMany+distinct
  comissaoAggregate: vi.fn(),
  saldoStockFindMany: vi.fn(),
  movimentoStockFindMany: vi.fn(),
  movimentoStockCount: vi.fn(),
  produtoCount: vi.fn(),
  pedidoCompraAggregate: vi.fn(),
  pedidoCompraCount: vi.fn(),
  contaPagarAggregate: vi.fn(),
  contaPagarFindMany: vi.fn(),
  sessaoCaixaAggregate: vi.fn(),
  movimentoCaixaAggregate: vi.fn(),
  itemReconciliacaoBancariaCount: vi.fn(), // Wave 3: reconciliacaoRatio
  colaboradorCount: vi.fn(),
  registoAssiduidadeCount: vi.fn(),
  solicitacaoFeriasCount: vi.fn(),
  projetoCount: vi.fn(),
  timesheetAggregate: vi.fn(),
  ticketCount: vi.fn(),
  viaturaCount: vi.fn(),
  atividadeCount: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    venda: { aggregate: mocks.vendaAggregate, findMany: mocks.vendaFindMany },
    comissao: { aggregate: mocks.comissaoAggregate },
    saldoStock: { findMany: mocks.saldoStockFindMany },
    movimentoStock: { findMany: mocks.movimentoStockFindMany, count: mocks.movimentoStockCount },
    produto: { count: mocks.produtoCount },
    pedidoCompra: { aggregate: mocks.pedidoCompraAggregate, count: mocks.pedidoCompraCount },
    contaPagar: { aggregate: mocks.contaPagarAggregate, findMany: mocks.contaPagarFindMany },
    sessaoCaixa: { aggregate: mocks.sessaoCaixaAggregate },
    movimentoCaixa: { aggregate: mocks.movimentoCaixaAggregate },
    itemReconciliacaoBancaria: { count: mocks.itemReconciliacaoBancariaCount },
    colaborador: { count: mocks.colaboradorCount },
    registoAssiduidade: { count: mocks.registoAssiduidadeCount },
    solicitacaoFerias: { count: mocks.solicitacaoFeriasCount },
    projeto: { count: mocks.projetoCount },
    timesheet: { aggregate: mocks.timesheetAggregate },
    ticket: { count: mocks.ticketCount },
    viatura: { count: mocks.viaturaCount },
    atividade: { count: mocks.atividadeCount },
  },
}));

import {
  kpiVendasImpl,
  kpiStockImpl,
  kpiComprasImpl,
  kpiFinancasImpl,
  kpiRHImpl,
  kpiOperacoesImpl,
  dashboardGeralImpl,
  dashboardService,
} from '../analytics.service';
import { ANALYTICS_TAGS } from '../analytics.interface';
import { unstable_cache } from 'next/cache';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };

function setupZeros() {
  mocks.vendaAggregate.mockResolvedValue({ _sum: { total: null }, _count: { _all: 0 } });
  mocks.vendaFindMany.mockResolvedValue([]); // clientesAtivos = 0
  mocks.comissaoAggregate.mockResolvedValue({ _sum: { valorComissao: null } });
  mocks.saldoStockFindMany.mockResolvedValue([]);
  mocks.movimentoStockFindMany.mockResolvedValue([]);
  mocks.movimentoStockCount.mockResolvedValue(0);
  mocks.produtoCount.mockResolvedValue(0);
  mocks.pedidoCompraAggregate.mockResolvedValue({ _sum: { valorTotal: null } });
  mocks.pedidoCompraCount.mockResolvedValue(0);
  mocks.contaPagarAggregate.mockResolvedValue({ _sum: { valorRestante: null } });
  mocks.contaPagarFindMany.mockResolvedValue([]);
  mocks.sessaoCaixaAggregate.mockResolvedValue({ _sum: { fundoInicial: null, totalEntradas: null, totalSaidas: null } });
  mocks.movimentoCaixaAggregate.mockResolvedValue({ _sum: { valor: null } });
  mocks.itemReconciliacaoBancariaCount.mockResolvedValue(0); // total + conciliados
  mocks.colaboradorCount.mockResolvedValue(0);
  mocks.registoAssiduidadeCount.mockResolvedValue(0);
  mocks.solicitacaoFeriasCount.mockResolvedValue(0);
  mocks.projetoCount.mockResolvedValue(0);
  mocks.timesheetAggregate.mockResolvedValue({ _sum: { duracaoHoras: null } });
  mocks.ticketCount.mockResolvedValue(0);
  mocks.viaturaCount.mockResolvedValue(0);
  mocks.atividadeCount.mockResolvedValue(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupZeros();
});

// ---------------------------------------------------------------------------
// kpiVendasImpl — Wave 3: clientesAtivos via join em Venda
// ---------------------------------------------------------------------------
describe('kpiVendasImpl', () => {
  it('devolve zeros quando não há dados', async () => {
    const kpi = await kpiVendasImpl('tenant-1');
    expect(kpi.totalVendasMes).toBe('0.00');
    expect(kpi.quantidadeVendas).toBe(0);
    expect(kpi.ticketMedio).toBe('0.00');
    expect(kpi.variacaoPercent).toBe('0.00');
    expect(kpi.clientesAtivos).toBe(0);
  });

  it('Wave 3: clientesAtivos conta clientes distintos com venda nos últimos 90 dias', async () => {
    mocks.vendaAggregate
      .mockResolvedValueOnce({ _sum: { total: 2000 }, _count: { _all: 3 } })
      .mockResolvedValueOnce({ _sum: { total: null }, _count: { _all: 0 } });
    // 2 clientes distintos com venda nos 90 dias (clienteId null excluído via query where)
    mocks.vendaFindMany.mockResolvedValue([
      { clienteId: 'cli-1' },
      { clienteId: 'cli-2' },
    ]);
    mocks.comissaoAggregate.mockResolvedValue({ _sum: { valorComissao: null } });

    const kpi = await kpiVendasImpl('tenant-1');
    expect(kpi.clientesAtivos).toBe(2);
    // Verificar que a query usa clienteId: { not: null } e distinct
    expect(mocks.vendaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clienteId: { not: null },
          status: { not: 'CANCELADA' },
        }),
        distinct: ['clienteId'],
      }),
    );
  });

  it('calcula ticket médio e variação correctamente', async () => {
    mocks.vendaAggregate
      .mockResolvedValueOnce({ _sum: { total: 1000 }, _count: { _all: 4 } })
      .mockResolvedValueOnce({ _sum: { total: 800 }, _count: { _all: 2 } });
    mocks.vendaFindMany.mockResolvedValue([{ clienteId: 'cli-1' }]);
    mocks.comissaoAggregate.mockResolvedValue({ _sum: { valorComissao: 50 } });

    const kpi = await kpiVendasImpl('tenant-1');
    expect(kpi.totalVendasMes).toBe('1000.00');
    expect(kpi.ticketMedio).toBe('250.00');
    expect(kpi.variacaoPercent).toBe('25.00');
    expect(kpi.comissoesDevidas).toBe('50.00');
  });

  it('executa 4 queries paralelas sem N+1', async () => {
    await kpiVendasImpl('tenant-1');
    expect(mocks.vendaAggregate).toHaveBeenCalledTimes(2);
    expect(mocks.vendaFindMany).toHaveBeenCalledTimes(1); // uma query para clientesAtivos
    expect(mocks.comissaoAggregate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// kpiStockImpl
// ---------------------------------------------------------------------------
describe('kpiStockImpl', () => {
  it('devolve zeros quando não há stock', async () => {
    const kpi = await kpiStockImpl('tenant-1');
    expect(kpi.valorTotalStock).toBe('0.00');
    expect(kpi.produtosAbaixoMinimo).toBe(0);
    expect(kpi.produtosSemMovimento90d).toBe(0);
  });

  it('calcula valor total e produtos abaixo mínimo', async () => {
    mocks.saldoStockFindMany.mockResolvedValue([
      { saldo: 10, produto: { precoCompra: 100, stockMinimo: 5 } },
      { saldo: 2, produto: { precoCompra: 50, stockMinimo: 5 } },
    ]);
    mocks.movimentoStockFindMany.mockResolvedValue([{ produtoId: 'p1' }]);
    mocks.movimentoStockCount.mockResolvedValue(10);
    mocks.produtoCount.mockResolvedValue(5);

    const kpi = await kpiStockImpl('tenant-1');
    expect(kpi.valorTotalStock).toBe('1100.00');
    expect(kpi.produtosAbaixoMinimo).toBe(1);
    expect(kpi.produtosSemMovimento90d).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// kpiComprasImpl
// ---------------------------------------------------------------------------
describe('kpiComprasImpl', () => {
  it('devolve zeros quando não há compras', async () => {
    const kpi = await kpiComprasImpl('tenant-1');
    expect(kpi.totalComprasMes).toBe('0.00');
    expect(kpi.pedidosPendentes).toBe(0);
    expect(kpi.agingMediaDias).toBe(0);
  });

  it('calcula aging médio correctamente', async () => {
    const dataVencida = new Date(Date.now() - 10 * 86_400_000);
    mocks.contaPagarFindMany.mockResolvedValue([{ dataVencimento: dataVencida }]);
    mocks.contaPagarAggregate.mockResolvedValue({ _sum: { valorRestante: 500 } });
    mocks.pedidoCompraCount.mockResolvedValue(3);

    const kpi = await kpiComprasImpl('tenant-1');
    expect(kpi.pedidosPendentes).toBe(3);
    expect(kpi.contasAPagarVencidas).toBe('500.00');
    expect(kpi.agingMediaDias).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// kpiFinancasImpl — Wave 3: reconciliacaoRatio via ItemReconciliacaoBancaria.conciliado
// ---------------------------------------------------------------------------
describe('kpiFinancasImpl', () => {
  it('calcula saldo de caixa: fundo + entradas - saídas', async () => {
    mocks.sessaoCaixaAggregate.mockResolvedValue({
      _sum: { fundoInicial: 5000, totalEntradas: 3000, totalSaidas: 1000 },
    });
    mocks.movimentoCaixaAggregate
      .mockResolvedValueOnce({ _sum: { valor: 3000 } })
      .mockResolvedValueOnce({ _sum: { valor: 1000 } });
    mocks.itemReconciliacaoBancariaCount
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(7); // conciliados

    const kpi = await kpiFinancasImpl('tenant-1');
    expect(kpi.saldoCaixaAtual).toBe('7000.00');
    expect(kpi.receitaMes).toBe('3000.00');
    expect(kpi.despesaMes).toBe('1000.00');
    expect(kpi.resultadoLiquido).toBe('2000.00');
  });

  it('Wave 3: reconciliacaoRatio usa ItemReconciliacaoBancaria.conciliado', async () => {
    mocks.itemReconciliacaoBancariaCount
      .mockResolvedValueOnce(20) // total
      .mockResolvedValueOnce(15); // conciliados

    const kpi = await kpiFinancasImpl('tenant-1');
    expect(kpi.reconciliacaoRatio).toBe('15/20');
    // Confirmar que usa itemReconciliacaoBancaria, não contaBancaria
    expect(mocks.itemReconciliacaoBancariaCount).toHaveBeenCalledTimes(2);
    // 1ª chamada: total (sem filtro conciliado)
    expect(mocks.itemReconciliacaoBancariaCount).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }),
    );
    // 2ª chamada: só conciliados
    expect(mocks.itemReconciliacaoBancariaCount).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ where: expect.objectContaining({ conciliado: true }) }),
    );
  });

  it('devolve 0/0 sem dados de reconciliação', async () => {
    const kpi = await kpiFinancasImpl('tenant-1');
    expect(kpi.reconciliacaoRatio).toBe('0/0');
  });
});

// ---------------------------------------------------------------------------
// kpiRHImpl
// ---------------------------------------------------------------------------
describe('kpiRHImpl', () => {
  it('agrega métricas de RH com 5 queries paralelas (sem N+1)', async () => {
    mocks.colaboradorCount.mockResolvedValue(50);
    mocks.registoAssiduidadeCount.mockResolvedValue(2);
    mocks.solicitacaoFeriasCount.mockResolvedValue(5);
    mocks.projetoCount.mockResolvedValue(3);
    mocks.timesheetAggregate.mockResolvedValue({ _sum: { duracaoHoras: 168 } });

    const kpi = await kpiRHImpl('tenant-1');
    expect(kpi.colaboradoresAtivos).toBe(50);
    expect(kpi.ausenciasHoje).toBe(2);
    expect(kpi.feriasPendentesAprovacao).toBe(5);
    expect(kpi.projetosEmCurso).toBe(3);
    expect(kpi.timesheetHorasMes).toBe('168.00');

    expect(mocks.colaboradorCount).toHaveBeenCalledTimes(1);
    expect(mocks.registoAssiduidadeCount).toHaveBeenCalledTimes(1);
    expect(mocks.solicitacaoFeriasCount).toHaveBeenCalledTimes(1);
    expect(mocks.projetoCount).toHaveBeenCalledTimes(1);
    expect(mocks.timesheetAggregate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// kpiOperacoesImpl
// ---------------------------------------------------------------------------
describe('kpiOperacoesImpl', () => {
  it('conta tickets por estado SLA e viaturas por estado', async () => {
    mocks.ticketCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3);
    mocks.viaturaCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    mocks.atividadeCount.mockResolvedValue(4);

    const kpi = await kpiOperacoesImpl('tenant-1');
    expect(kpi.ticketsAbertos).toBe(10);
    expect(kpi.ticketsDentroSLA).toBe(7);
    expect(kpi.ticketsForaSLA).toBe(3);
    expect(kpi.viaturaDisponiveis).toBe(5);
    expect(kpi.viaturaEmMissao).toBe(2);
    expect(kpi.viaturaEmManutencao).toBe(1);
    expect(kpi.atividadesHoje).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// dashboardGeralImpl
// ---------------------------------------------------------------------------
describe('dashboardGeralImpl', () => {
  it('agrega todos os domínios num único objecto com zeros', async () => {
    const dash = await dashboardGeralImpl('tenant-1');
    expect(dash).toHaveProperty('vendas');
    expect(dash).toHaveProperty('stock');
    expect(dash).toHaveProperty('compras');
    expect(dash).toHaveProperty('financas');
    expect(dash).toHaveProperty('rh');
    expect(dash).toHaveProperty('operacoes');
    expect(dash.vendas.totalVendasMes).toBe('0.00');
  });
});

// ---------------------------------------------------------------------------
// dashboardService — verifica que unstable_cache é chamado com as tags certas
// ---------------------------------------------------------------------------
describe('dashboardService (cache tags)', () => {
  it('kpiVendas usa tag "vendas"', async () => {
    await dashboardService.kpiVendas(CTX);
    const calls = vi.mocked(unstable_cache).mock.calls;
    const allTags = calls.flatMap((c) => (c[2] as { tags?: string[] }).tags ?? []);
    expect(allTags).toContain(ANALYTICS_TAGS.vendas);
  });

  it('kpiStock usa tag "stock"', async () => {
    await dashboardService.kpiStock(CTX);
    const calls = vi.mocked(unstable_cache).mock.calls;
    const allTags = calls.flatMap((c) => (c[2] as { tags?: string[] }).tags ?? []);
    expect(allTags).toContain(ANALYTICS_TAGS.stock);
  });

  it('kpiCompras usa tag "compras"', async () => {
    await dashboardService.kpiCompras(CTX);
    const calls = vi.mocked(unstable_cache).mock.calls;
    const allTags = calls.flatMap((c) => (c[2] as { tags?: string[] }).tags ?? []);
    expect(allTags).toContain(ANALYTICS_TAGS.compras);
  });

  it('kpiFinancas usa tag "financas"', async () => {
    await dashboardService.kpiFinancas(CTX);
    const calls = vi.mocked(unstable_cache).mock.calls;
    const allTags = calls.flatMap((c) => (c[2] as { tags?: string[] }).tags ?? []);
    expect(allTags).toContain(ANALYTICS_TAGS.financas);
  });

  it('kpiRH usa tag "rh"', async () => {
    await dashboardService.kpiRH(CTX);
    const calls = vi.mocked(unstable_cache).mock.calls;
    const allTags = calls.flatMap((c) => (c[2] as { tags?: string[] }).tags ?? []);
    expect(allTags).toContain(ANALYTICS_TAGS.rh);
  });

  it('kpiOperacoes usa tag "operacoes"', async () => {
    await dashboardService.kpiOperacoes(CTX);
    const calls = vi.mocked(unstable_cache).mock.calls;
    const allTags = calls.flatMap((c) => (c[2] as { tags?: string[] }).tags ?? []);
    expect(allTags).toContain(ANALYTICS_TAGS.operacoes);
  });

  it('dashboardGeral usa TODOS os ANALYTICS_TAGS', async () => {
    await dashboardService.dashboardGeral(CTX);
    const calls = vi.mocked(unstable_cache).mock.calls;
    const allTags = calls.flatMap((c) => (c[2] as { tags?: string[] }).tags ?? []);
    for (const tag of Object.values(ANALYTICS_TAGS)) {
      expect(allTags, `tag "${tag}" deve estar presente`).toContain(tag);
    }
  });
});
