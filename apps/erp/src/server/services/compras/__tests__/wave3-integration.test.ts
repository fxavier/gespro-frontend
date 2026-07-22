/**
 * Wave 3 — integração WS B → WS A (entradaStock) e WS D (registarLancamentoContabilistico)
 *
 * Verifica as invariantes críticas dos pontos de wiring sem precisar de DB real:
 *   1. Receção com itens aceites → entradaStock chamado por item, com dados correctos
 *   2. Liquidação de ContaPagar → débito Fornecedores + crédito Banco (débito=crédito)
 *
 * Para testes E2E com DB real, usar prisma/seed + npx tsx prisma/seed/index.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// ─── Mocks cross-WS (WS A e WS D) ──────────────────────────────────────────

const mockEntradaStock = vi.fn().mockResolvedValue({ id: 'mov-001' });
const mockRegistarLancamento = vi.fn().mockResolvedValue({ id: 'lan-001' });
const mockProximoNumeroSerie = vi.fn().mockResolvedValue('NUM-2026-00001');

vi.mock('@/server/services/inventario/stock.service', () => ({
  entradaStock: mockEntradaStock,
}));

vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: mockRegistarLancamento,
}));

vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: mockProximoNumeroSerie,
}));

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// Recebimento mock: pedido com 2 itens; um item aceite, outro rejeitado
const pedidoMock = {
  id: 'pc-001', tenantId: 'tenant-test', numero: 'PC-2026-00001',
  fornecedorId: 'for-001', status: 'EM_TRANSITO',
  prazoEntregaDias: 30, valorTotal: new Prisma.Decimal('5000.00'),
  itens: [
    {
      id: 'item-1', produtoId: 'prod-001', descricao: 'Produto A',
      quantidade: new Prisma.Decimal('10'), unidadeMedida: 'UN',
      quantidadeRecebida: new Prisma.Decimal('0'),
    },
    {
      id: 'item-2', produtoId: null, descricao: 'Produto B sem código',
      quantidade: new Prisma.Decimal('5'), unidadeMedida: 'UN',
      quantidadeRecebida: new Prisma.Decimal('0'),
    },
  ],
};

const recebimentoMock = {
  id: 'rec-001', tenantId: 'tenant-test',
  pedidoCompraId: 'pc-001', status: 'COMPLETO',
  data: new Date(), itens: [],
};

// Conta a pagar mock
const contaMock = {
  id: 'cp-001', tenantId: 'tenant-test', status: 'ABERTA',
  numero: 'CP-2026-00001', descricao: 'Compra via pedido PC-2026-00001',
  valorOriginal: new Prisma.Decimal('5000.00'),
  valorPago: new Prisma.Decimal('0'),
  valorRestante: new Prisma.Decimal('5000.00'),
  pagamentos: [],
};

const pagamentoMock = {
  id: 'pag-001', tenantId: 'tenant-test', numero: 'NUM-2026-00001',
  contaPagarId: 'cp-001', dataPagamento: new Date(),
  valor: new Prisma.Decimal('5000.00'), formaPagamento: 'Transferência',
  status: 'CONCLUIDO', lancamentoId: null, createdAt: new Date(),
};

// Itens actualizados após a recepção (todos recebidos)
const itensActualizados = [
  { id: 'item-1', quantidade: new Prisma.Decimal('10'), quantidadeRecebida: new Prisma.Decimal('8') },
  { id: 'item-2', quantidade: new Prisma.Decimal('5'), quantidadeRecebida: new Prisma.Decimal('0') },
];

vi.mock('@/server/db/client', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn({
      pedidoCompra: {
        findUnique: vi.fn().mockResolvedValue(pedidoMock),
        update: vi.fn(),
      },
      recebimentoCompra: {
        create: vi.fn().mockResolvedValue(recebimentoMock),
      },
      itemPedidoCompra: {
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue(itensActualizados),
      },
      contaPagar: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(contaMock),
        update: vi.fn(),
      },
      pagamento: {
        create: vi.fn().mockResolvedValue(pagamentoMock),
        update: vi.fn(),
      },
    })),
    // nível de topo (não usados nestes testes mas necessários para inicialização)
    pedidoCompra: { findUnique: vi.fn() },
    recebimentoCompra: { findMany: vi.fn() },
    contaPagar: { findUnique: vi.fn(), create: vi.fn() },
    pagamento: { findMany: vi.fn() },
  },
}));

// ─── Testes ──────────────────────────────────────────────────────────────────

const ctx = { tenantId: 'tenant-test', userId: 'user-test' };

beforeEach(() => {
  vi.clearAllMocks();
  mockProximoNumeroSerie.mockResolvedValue('NUM-2026-00001');
  mockEntradaStock.mockResolvedValue({ id: 'mov-001' });
  mockRegistarLancamento.mockResolvedValue({ id: 'lan-001' });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Receção → entradaStock (WS A)
// ─────────────────────────────────────────────────────────────────────────────

describe('Wave 3 — Receção → entradaStock (WS A)', () => {
  it('chama entradaStock para cada item aceite com produtoId', async () => {
    const { comprasService } = await import('../compras.service');

    await comprasService.registarRecebimento(
      {
        pedidoCompraId: 'pc-001',
        data: new Date(),
        itens: [
          {
            itemPedidoCompraId: 'item-1',
            localizacaoDestinoId: 'loc-001',
            quantidadeRecebida: 8,
            quantidadeAceita: 8,
            quantidadeRejeitada: 0,
          },
          {
            itemPedidoCompraId: 'item-2',
            localizacaoDestinoId: 'loc-001',
            quantidadeRecebida: 3,
            quantidadeAceita: 0,
            quantidadeRejeitada: 3,
            motivoRejeicao: 'Danificado',
          },
        ],
      },
      ctx,
    );

    // Apenas item-1 tem produtoId e quantidadeAceita > 0 → 1 chamada
    expect(mockEntradaStock).toHaveBeenCalledTimes(1);
    expect(mockEntradaStock).toHaveBeenCalledWith(
      expect.anything(), // tx (TransactionClient)
      expect.objectContaining({
        produtoId: 'prod-001',
        localizacaoDestinoId: 'loc-001',
        quantidade: 8,
        documentoReferenciaId: 'rec-001',
        documentoReferenciaTipo: 'RecebimentoCompra',
      }),
      ctx,
    );
  });

  it('não chama entradaStock quando quantidadeAceita = 0', async () => {
    const { comprasService } = await import('../compras.service');

    await comprasService.registarRecebimento(
      {
        pedidoCompraId: 'pc-001',
        data: new Date(),
        itens: [
          {
            itemPedidoCompraId: 'item-1',
            localizacaoDestinoId: 'loc-001',
            quantidadeRecebida: 5,
            quantidadeAceita: 0,
            quantidadeRejeitada: 5,
            motivoRejeicao: 'Qualidade insuficiente',
          },
        ],
      },
      ctx,
    );

    expect(mockEntradaStock).not.toHaveBeenCalled();
  });

  it('não chama entradaStock para itens sem produtoId (serviços)', async () => {
    const { comprasService } = await import('../compras.service');

    await comprasService.registarRecebimento(
      {
        pedidoCompraId: 'pc-001',
        data: new Date(),
        itens: [
          {
            itemPedidoCompraId: 'item-2', // produtoId: null
            localizacaoDestinoId: 'loc-001',
            quantidadeRecebida: 5,
            quantidadeAceita: 5,
            quantidadeRejeitada: 0,
          },
        ],
      },
      ctx,
    );

    expect(mockEntradaStock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Liquidação ContaPagar → registarLancamentoContabilistico (WS D)
// ─────────────────────────────────────────────────────────────────────────────

describe('Wave 3 — ContaPagar liquidada → lançamento contabilístico (WS D)', () => {
  it('chama registarLancamentoContabilistico com partidas equilibradas (débito=crédito)', async () => {
    const { contaPagarService } = await import('../conta-pagar.service');

    await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-001', dataPagamento: new Date(), valor: 5000, formaPagamento: 'Transferência' },
      ctx,
    );

    expect(mockRegistarLancamento).toHaveBeenCalledTimes(1);
    const [, input] = mockRegistarLancamento.mock.calls[0];

    // Invariante: débitos = créditos
    function soma(tipo: 'DEBITO' | 'CREDITO'): Prisma.Decimal {
      return input.partidas
        .filter((p: { tipo: string }) => p.tipo === tipo)
        .reduce(
          (acc: Prisma.Decimal, p: { valor: string }) => acc.plus(new Prisma.Decimal(String(p.valor))),
          new Prisma.Decimal(0),
        );
    }
    const totalDebito = soma('DEBITO');
    const totalCredito = soma('CREDITO');
    expect(totalDebito.equals(totalCredito)).toBe(true);
  });

  it('lançamento usa conta 421 (Fornecedores c/c) como DÉBITO', async () => {
    const { contaPagarService } = await import('../conta-pagar.service');

    await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-001', dataPagamento: new Date(), valor: 5000, formaPagamento: 'Transferência' },
      ctx,
    );

    const [, input] = mockRegistarLancamento.mock.calls[0];
    const debito = input.partidas.find((p: any) => p.tipo === 'DEBITO');
    expect(debito?.contaCodigo).toBe('421');
  });

  it('lançamento usa conta 121 (Depósitos à ordem) como CRÉDITO', async () => {
    const { contaPagarService } = await import('../conta-pagar.service');

    await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-001', dataPagamento: new Date(), valor: 5000, formaPagamento: 'Transferência' },
      ctx,
    );

    const [, input] = mockRegistarLancamento.mock.calls[0];
    const credito = input.partidas.find((p: any) => p.tipo === 'CREDITO');
    expect(credito?.contaCodigo).toBe('121');
  });

  it('lançamento tem origem PAGAMENTO e diário BANCO', async () => {
    const { contaPagarService } = await import('../conta-pagar.service');

    await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-001', dataPagamento: new Date(), valor: 5000, formaPagamento: 'Transferência' },
      ctx,
    );

    const [, input] = mockRegistarLancamento.mock.calls[0];
    expect(input.origem).toBe('PAGAMENTO');
    expect(input.diarioTipo).toBe('BANCO');
    expect(input.documentoOrigemTipo).toBe('Pagamento');
    expect(input.documentoOrigemId).toBe('pag-001'); // id do pagamento criado
  });

  it('pagamento actualiza lancamentoId após lançamento registado', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;
    const mockPagUpdate = vi.fn().mockResolvedValue({});

    db.$transaction.mockImplementationOnce(async (fn: any) => fn({
      contaPagar: {
        findUnique: vi.fn().mockResolvedValue(contaMock),
        update: vi.fn(),
      },
      pagamento: {
        create: vi.fn().mockResolvedValue(pagamentoMock),
        update: mockPagUpdate,
      },
    }));

    const { contaPagarService } = await import('../conta-pagar.service');
    await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-001', dataPagamento: new Date(), valor: 5000, formaPagamento: 'Transferência' },
      ctx,
    );

    expect(mockPagUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pag-001' },
        data: { lancamentoId: 'lan-001' },
      }),
    );
  });
});
