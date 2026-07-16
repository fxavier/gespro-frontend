/**
 * Testes unitários do serviço de Contas a Pagar — WS B
 * Mock completo do Prisma para testar lógica de negócio sem BD.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { calcularDiasAtraso, bucketAging } from '../conta-pagar.service';
import {
  TRANSICOES_CONTA_PAGAR,
  TRANSICOES_PAGAMENTO,
  transitarContaPagar,
  transitarPagamento,
} from '../conta-pagar.service.interface';

// Mocks dos contratos cross-WS (WS D) — Wave 3
vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: vi.fn().mockResolvedValue({ id: 'lan-001' }),
}));
vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: vi.fn().mockResolvedValue('PAG-2024-00001'),
}));

// Mock do Prisma
vi.mock('@/server/db/client', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn({
      contaPagar: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
      pagamento: { create: vi.fn().mockResolvedValue({ id: 'pag-001', tenantId: 'tenant-test', numero: 'PAG-2024-00001', contaPagarId: 'cp-001', dataPagamento: new Date(), valor: 100, formaPagamento: 'Transferência', status: 'CONCLUIDO', createdAt: new Date() }), update: vi.fn() },
    })),
    contaPagar: {
      findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
    },
    pagamento: { findMany: vi.fn(), create: vi.fn() },
  },
}));

const ctx = { tenantId: 'tenant-test', userId: 'user-test' };

// =====================================================================
// calcularDiasAtraso
// =====================================================================

describe('calcularDiasAtraso()', () => {
  it('data futura retorna 0', () => {
    const futuro = new Date(Date.now() + 86_400_000 * 7);
    expect(calcularDiasAtraso(futuro)).toBe(0);
  });

  it('data de hoje retorna 0', () => {
    expect(calcularDiasAtraso(new Date())).toBe(0);
  });

  it('data passada retorna dias corretos', () => {
    const passado = new Date(Date.now() - 86_400_000 * 15);
    expect(calcularDiasAtraso(passado)).toBe(15);
  });

  it('exactamente 30 dias atrás', () => {
    const d30 = new Date(Date.now() - 86_400_000 * 30);
    expect(calcularDiasAtraso(d30)).toBe(30);
  });
});

// =====================================================================
// bucketAging
// =====================================================================

describe('bucketAging()', () => {
  it('0 dias → corrente', () => expect(bucketAging(0)).toBe('corrente'));
  it('negativo (futuro) → corrente', () => expect(bucketAging(-10)).toBe('corrente'));
  it('1-30 → ate30Dias', () => {
    expect(bucketAging(1)).toBe('ate30Dias');
    expect(bucketAging(30)).toBe('ate30Dias');
  });
  it('31-60 → de31a60Dias', () => {
    expect(bucketAging(31)).toBe('de31a60Dias');
    expect(bucketAging(60)).toBe('de31a60Dias');
  });
  it('61-90 → de61a90Dias', () => {
    expect(bucketAging(61)).toBe('de61a90Dias');
    expect(bucketAging(90)).toBe('de61a90Dias');
  });
  it('91+ → acima90Dias', () => {
    expect(bucketAging(91)).toBe('acima90Dias');
    expect(bucketAging(365)).toBe('acima90Dias');
  });
});

// =====================================================================
// transitarContaPagar
// =====================================================================

describe('transitarContaPagar()', () => {
  it('ABERTA → PARCIALMENTE_PAGA é válido', () => {
    expect(() => transitarContaPagar('ABERTA', 'PARCIALMENTE_PAGA')).not.toThrow();
  });

  it('ABERTA → PAGA é válido (liquidação directa)', () => {
    expect(() => transitarContaPagar('ABERTA', 'PAGA')).not.toThrow();
  });

  it('PAGA → ABERTA é inválido', () => {
    expect(() => transitarContaPagar('PAGA', 'ABERTA')).toThrow();
  });

  it('CANCELADA → qualquer estado é inválido', () => {
    const estados = Object.keys(TRANSICOES_CONTA_PAGAR);
    for (const s of estados) {
      expect(() => transitarContaPagar('CANCELADA', s as any)).toThrow();
    }
  });

  it('VENCIDA pode ser paga', () => {
    expect(() => transitarContaPagar('VENCIDA', 'PAGA')).not.toThrow();
  });

  it('VENCIDA pode ser cancelada', () => {
    expect(() => transitarContaPagar('VENCIDA', 'CANCELADA')).not.toThrow();
  });
});

// =====================================================================
// transitarPagamento
// =====================================================================

describe('transitarPagamento()', () => {
  it('PENDENTE → CONCLUIDO é válido', () => {
    expect(() => transitarPagamento('PENDENTE', 'CONCLUIDO')).not.toThrow();
  });

  it('PENDENTE → CANCELADO é válido', () => {
    expect(() => transitarPagamento('PENDENTE', 'CANCELADO')).not.toThrow();
  });

  it('CONCLUIDO → CANCELADO é inválido (não pode regressar)', () => {
    expect(() => transitarPagamento('CONCLUIDO', 'CANCELADO')).toThrow();
  });

  it('CANCELADO é estado terminal', () => {
    expect(TRANSICOES_PAGAMENTO.CANCELADO).toHaveLength(0);
  });
});

// =====================================================================
// cancelar() — serviço
// =====================================================================

describe('contaPagarService.cancelar()', () => {
  it('ABERTA pode ser cancelada', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.contaPagar.findUnique.mockResolvedValue({
      id: 'cp-1', tenantId: 'tenant-test', status: 'ABERTA',
    });
    db.contaPagar.update.mockResolvedValue({});

    const { contaPagarService } = await import('../conta-pagar.service');
    await expect(contaPagarService.cancelar('cp-1', 'Motivo', ctx)).resolves.toBeUndefined();
    expect(db.contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELADA', observacoes: 'Motivo' } }),
    );
  });

  it('PAGA não pode ser cancelada', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.contaPagar.findUnique.mockResolvedValue({
      id: 'cp-1', tenantId: 'tenant-test', status: 'PAGA',
    });

    const { contaPagarService } = await import('../conta-pagar.service');
    await expect(contaPagarService.cancelar('cp-1', 'Motivo', ctx)).rejects.toThrow();
  });

  it('cross-tenant → NotFoundError', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.contaPagar.findUnique.mockResolvedValue({
      id: 'cp-1', tenantId: 'outro-tenant', status: 'ABERTA',
    });

    const { contaPagarService } = await import('../conta-pagar.service');
    await expect(contaPagarService.cancelar('cp-1', 'Motivo', ctx)).rejects.toThrow(NotFoundError);
  });
});

// =====================================================================
// actualizarVencidas()
// =====================================================================

describe('contaPagarService.actualizarVencidas()', () => {
  it('retorna o número de registos marcados como VENCIDA', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.contaPagar.updateMany.mockResolvedValue({ count: 7 });

    const { contaPagarService } = await import('../conta-pagar.service');
    const n = await contaPagarService.actualizarVencidas(ctx);
    expect(n).toBe(7);
    expect(db.contaPagar.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'VENCIDA' } }),
    );
  });
});

// =====================================================================
// registarPagamento() — validação de valor
// =====================================================================

describe('registarPagamento() — validação', () => {
  it('pagamento que excede valor restante lança BusinessRuleError', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    const contaMock = {
      id: 'cp-1', tenantId: 'tenant-test', status: 'ABERTA',
      valorOriginal: 1000, valorPago: 200, valorRestante: 800,
      pagamentos: [],
    };

    // Mock da transacção para retornar a conta
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        contaPagar: {
          findUnique: vi.fn().mockResolvedValue(contaMock),
          update: vi.fn(),
        },
        pagamento: { create: vi.fn().mockResolvedValue({ id: 'pag-err', numero: 'PAG-2024-E', dataPagamento: new Date(), valor: 1000, formaPagamento: 'TRF', status: 'CONCLUIDO' }), update: vi.fn() },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    await expect(
      contaPagarService.registarPagamento(
        { contaPagarId: 'cp-1', dataPagamento: new Date(), valor: 1000, formaPagamento: 'TRF' },
        ctx,
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('pagamento que liquida totalmente actualiza status para PAGA', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    const contaMock = {
      id: 'cp-1', tenantId: 'tenant-test', status: 'ABERTA',
      valorOriginal: 500, valorPago: 0, valorRestante: 500,
      pagamentos: [],
    };

    const pagamentoMock = {
      id: 'pag-1', numero: 'PAG-2026-XXX', dataPagamento: new Date(),
      valor: 500, formaPagamento: 'TRF', referencia: null, status: 'CONCLUIDO',
      lancamentoId: null,
    };

    const mockContaPagarUpdate = vi.fn().mockResolvedValue({ ...contaMock, status: 'PAGA' });
    const mockPagamentoCreate = vi.fn().mockResolvedValue(pagamentoMock);

    const mockPagamentoUpdate = vi.fn().mockResolvedValue({ ...pagamentoMock, lancamentoId: 'lan-001' });
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        contaPagar: {
          findUnique: vi.fn().mockResolvedValue(contaMock),
          update: mockContaPagarUpdate,
        },
        pagamento: { create: mockPagamentoCreate, update: mockPagamentoUpdate },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    const pag = await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-1', dataPagamento: new Date(), valor: 500, formaPagamento: 'TRF' },
      ctx,
    );

    expect(mockContaPagarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAGA' }) }),
    );
    expect(pag.status).toBe('CONCLUIDO');
  });
});

// =====================================================================
// relatorioAging() — agregação
// =====================================================================

describe('relatorioAging()', () => {
  it('conta aberta vencida há 45 dias vai para bucket de31a60Dias', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    const vencimento = new Date(Date.now() - 86_400_000 * 45);
    db.contaPagar.findMany.mockResolvedValue([
      {
        id: 'cp-1', fornecedorId: 'for-1', status: 'VENCIDA',
        valorOriginal: 1000, valorPago: 0, valorRestante: 1000,
        dataVencimento: vencimento, fornecedor: { nome: 'Fornecedor A' },
        dataEmissao: new Date(), numero: 'CP-001', descricao: 'Teste',
      },
    ]);

    const { contaPagarService } = await import('../conta-pagar.service');
    const relatorio = await contaPagarService.relatorioAging(ctx);

    expect(relatorio.linhas).toHaveLength(1);
    expect(relatorio.linhas[0].de31a60Dias).toBe(1000);
    expect(relatorio.linhas[0].total).toBe(1000);
    expect(relatorio.totalAberto).toBe(1000);
  });

  it('retorna lista vazia quando não há contas abertas', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.contaPagar.findMany.mockResolvedValue([]);

    const { contaPagarService } = await import('../conta-pagar.service');
    const relatorio = await contaPagarService.relatorioAging(ctx);

    expect(relatorio.linhas).toHaveLength(0);
    expect(relatorio.totalAberto).toBe(0);
  });
});
