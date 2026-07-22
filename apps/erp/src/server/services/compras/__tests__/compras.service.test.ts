/**
 * Testes unitários do serviço de Compras — WS B
 * Mock completo do Prisma para testar lógica de negócio sem BD.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import {
  transitar,
  verificarQuorum,
  calcularTotaisPedido,
} from '../compras.service';
import {
  TRANSICOES_REQUISICAO,
  TRANSICOES_PEDIDO_COMPRA,
} from '../compras.service.interface';

// Mocks dos contratos cross-WS (WS A e WS D) — Wave 3
vi.mock('@/server/services/inventario/stock.service', () => ({
  entradaStock: vi.fn().mockResolvedValue({ id: 'mov-001', produtoId: 'prod-001', quantidade: 1 }),
}));
vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: vi.fn().mockResolvedValue('REQ-2024-00001'),
}));

// Mock do módulo prisma (nunca toca DB em testes unitários)
vi.mock('@/server/db/client', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn({
      requisicaoCompra: { findUnique: vi.fn(), update: vi.fn() },
      aprovacaoCompra: { findFirst: vi.fn(), update: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
      pedidoCompra: { findUnique: vi.fn() },
    })),
    requisicaoCompra: {
      findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    },
    pedidoCompra: {
      findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    },
    cotacao: {
      findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    },
    cotacaoFornecedor: { findFirst: vi.fn(), update: vi.fn() },
    itemCotacao: { findUnique: vi.fn() },
    respostaItemCotacao: { upsert: vi.fn() },
    recebimentoCompra: { findMany: vi.fn() },
    itemPedidoCompra: { findMany: vi.fn(), update: vi.fn() },
    contaPagar: { create: vi.fn() },
    configuracaoWorkflow: { findFirst: vi.fn() },
    aprovacaoCompra: { findFirst: vi.fn(), update: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  },
}));

const ctx = { tenantId: 'tenant-test', userId: 'user-test' };

// =====================================================================
// transitar() — validação de transições
// =====================================================================

describe('transitar()', () => {
  it('não lança para transição válida', () => {
    expect(() =>
      transitar(TRANSICOES_REQUISICAO, 'R', 'RASCUNHO', 'PENDENTE'),
    ).not.toThrow();
  });

  it('lança BusinessRuleError para transição inválida', () => {
    expect(() =>
      transitar(TRANSICOES_REQUISICAO, 'R', 'APROVADA', 'RASCUNHO'),
    ).toThrow(BusinessRuleError);
  });

  it('lança BusinessRuleError para transição de estado terminal', () => {
    expect(() =>
      transitar(TRANSICOES_REQUISICAO, 'R', 'CANCELADA', 'PENDENTE'),
    ).toThrow(BusinessRuleError);
  });

  it('transição de CONVERTIDA (terminal) lança erro', () => {
    expect(() =>
      transitar(TRANSICOES_REQUISICAO, 'R', 'CONVERTIDA', 'APROVADA'),
    ).toThrow(BusinessRuleError);
  });

  it('código de erro é TRANSICAO_INVALIDA', () => {
    try {
      transitar(TRANSICOES_REQUISICAO, 'R', 'PAGA' as any, 'RASCUNHO');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('TRANSICAO_INVALIDA');
    }
  });
});

// =====================================================================
// verificarQuorum() — lógica de quórum
// =====================================================================

describe('verificarQuorum()', () => {
  it('QUALQUER_UM: false quando apenas PENDENTE', () => {
    expect(verificarQuorum([{ status: 'PENDENTE' }, { status: 'PENDENTE' }], 'QUALQUER_UM')).toBe(false);
  });

  it('QUALQUER_UM: true com 1 APROVADO mesmo com PENDENTE', () => {
    expect(verificarQuorum([{ status: 'APROVADO' }, { status: 'PENDENTE' }], 'QUALQUER_UM')).toBe(true);
  });

  it('TODOS: false com 1 PENDENTE restante', () => {
    expect(verificarQuorum([{ status: 'APROVADO' }, { status: 'PENDENTE' }], 'TODOS')).toBe(false);
  });

  it('TODOS: true quando todos APROVADO', () => {
    expect(verificarQuorum([{ status: 'APROVADO' }, { status: 'APROVADO' }], 'TODOS')).toBe(true);
  });

  it('MAIORIA: ceil(n/2) aprovações — 2 de 3 chega', () => {
    expect(verificarQuorum(
      [{ status: 'APROVADO' }, { status: 'APROVADO' }, { status: 'PENDENTE' }],
      'MAIORIA',
    )).toBe(true);
  });

  it('MAIORIA: 1 de 3 não chega', () => {
    expect(verificarQuorum(
      [{ status: 'APROVADO' }, { status: 'PENDENTE' }, { status: 'PENDENTE' }],
      'MAIORIA',
    )).toBe(false);
  });

  it('MAIORIA: 1 de 1 é maioria', () => {
    expect(verificarQuorum([{ status: 'APROVADO' }], 'MAIORIA')).toBe(true);
  });

  it('MAIORIA com 5 aprovadores: ceil(5/2)=3 aprovações necessárias', () => {
    const dois = Array(2).fill({ status: 'APROVADO' }).concat(Array(3).fill({ status: 'PENDENTE' }));
    const tres = Array(3).fill({ status: 'APROVADO' }).concat(Array(2).fill({ status: 'PENDENTE' }));
    expect(verificarQuorum(dois, 'MAIORIA')).toBe(false);
    expect(verificarQuorum(tres, 'MAIORIA')).toBe(true);
  });
});

// =====================================================================
// calcularTotaisPedido() — cálculo financeiro
// =====================================================================

describe('calcularTotaisPedido()', () => {
  it('item único: cálculo correto', () => {
    const t = calcularTotaisPedido([{ quantidade: 5, precoUnitario: 200, desconto: 0, taxaIva: 0.16 }]);
    expect(t.valorSubtotal.toNumber()).toBe(1000);
    expect(t.valorDesconto.toNumber()).toBe(0);
    expect(t.valorIva.toNumber()).toBeCloseTo(160, 1);
    expect(t.valorTotal.toNumber()).toBeCloseTo(1160, 1);
  });

  it('múltiplos itens: soma correcta', () => {
    const t = calcularTotaisPedido([
      { quantidade: 10, precoUnitario: 100, desconto: 0, taxaIva: 0.16 },
      { quantidade: 5, precoUnitario: 50, desconto: 0, taxaIva: 0.16 },
    ]);
    expect(t.valorSubtotal.toNumber()).toBeCloseTo(1250, 1);
    expect(t.valorIva.toNumber()).toBeCloseTo(200, 1);
    expect(t.valorTotal.toNumber()).toBeCloseTo(1450, 1);
  });

  it('lista vazia: totais zero', () => {
    const t = calcularTotaisPedido([]);
    expect(t.valorSubtotal.toNumber()).toBe(0);
    expect(t.valorTotal.toNumber()).toBe(0);
  });

  it('IVA zero: valorTotal = valorSubtotal - valorDesconto', () => {
    const t = calcularTotaisPedido([{ quantidade: 2, precoUnitario: 500, desconto: 0, taxaIva: 0 }]);
    expect(t.valorTotal.toNumber()).toBeCloseTo(t.valorSubtotal.toNumber() - t.valorDesconto.toNumber(), 2);
  });
});

// =====================================================================
// submeterRequisicao() — sem workflow configurado → aprovação automática
// =====================================================================

describe('submeterRequisicao — sem workflow', () => {
  it('sem workflow → requisição passa a APROVADA directamente', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    const requisicaoMock = {
      id: 'req-1', tenantId: 'tenant-test',
      numero: 'REQ-001', status: 'RASCUNHO',
      valorTotal: 1000, solicitanteId: 'user-test',
      solicitanteNome: 'Utilizador test', departamento: 'TI',
      prioridade: 'MEDIA', justificativa: 'Teste',
      data: new Date(), createdAt: new Date(),
      itens: [{ id: 'item-1', descricao: 'Item 1', quantidade: 1, precoEstimado: 1000, subtotal: 1000, unidadeMedida: 'UN' }],
    };

    db.requisicaoCompra.findUnique.mockResolvedValue(requisicaoMock);
    db.configuracaoWorkflow.findFirst.mockResolvedValue(null); // sem workflow
    db.requisicaoCompra.update.mockResolvedValue({ ...requisicaoMock, status: 'APROVADA', aprovacoes: [] });

    const { comprasService } = await import('../compras.service');
    const result = await comprasService.submeterRequisicao('req-1', ctx);

    expect(db.requisicaoCompra.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-1' },
        data: { status: 'APROVADA' },
      }),
    );
    expect(result.status).toBe('APROVADA');
  });
});

// =====================================================================
// cancelarRequisicao() — estados válidos e inválidos
// =====================================================================

describe('cancelarRequisicao()', () => {
  it('RASCUNHO pode ser cancelada', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.requisicaoCompra.findUnique.mockResolvedValue({
      id: 'req-1', tenantId: 'tenant-test', status: 'RASCUNHO',
    });
    db.requisicaoCompra.update.mockResolvedValue({});

    const { comprasService } = await import('../compras.service');
    await expect(comprasService.cancelarRequisicao('req-1', 'Motivo', ctx)).resolves.toBeUndefined();
  });

  it('CONVERTIDA não pode ser cancelada', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.requisicaoCompra.findUnique.mockResolvedValue({
      id: 'req-1', tenantId: 'tenant-test', status: 'CONVERTIDA',
    });

    const { comprasService } = await import('../compras.service');
    await expect(comprasService.cancelarRequisicao('req-1', 'Motivo', ctx)).rejects.toThrow(BusinessRuleError);
  });

  it('cross-tenant → NotFoundError', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.requisicaoCompra.findUnique.mockResolvedValue({
      id: 'req-1', tenantId: 'outro-tenant', status: 'RASCUNHO',
    });

    const { comprasService } = await import('../compras.service');
    await expect(comprasService.cancelarRequisicao('req-1', 'Motivo', ctx)).rejects.toThrow(NotFoundError);
  });

  it('não encontrado → NotFoundError', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.requisicaoCompra.findUnique.mockResolvedValue(null);

    const { comprasService } = await import('../compras.service');
    await expect(comprasService.cancelarRequisicao('nao-existe', 'Motivo', ctx)).rejects.toThrow(NotFoundError);
  });
});

// =====================================================================
// adjudicarCotacao() — transição de estado
// =====================================================================

describe('adjudicarCotacao()', () => {
  it('RESPONDIDA → ADJUDICADA é válido', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.cotacao.findUnique.mockResolvedValue({
      id: 'cot-1', tenantId: 'tenant-test', status: 'RESPONDIDA',
    });
    db.cotacao.update.mockResolvedValue({});

    const { comprasService } = await import('../compras.service');
    await expect(
      comprasService.adjudicarCotacao({ cotacaoId: 'cot-1', fornecedorVencedorId: 'for-1' }, ctx),
    ).resolves.toBeUndefined();
  });

  it('RASCUNHO → ADJUDICADA é inválido', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.cotacao.findUnique.mockResolvedValue({
      id: 'cot-1', tenantId: 'tenant-test', status: 'RASCUNHO',
    });

    const { comprasService } = await import('../compras.service');
    await expect(
      comprasService.adjudicarCotacao({ cotacaoId: 'cot-1', fornecedorVencedorId: 'for-1' }, ctx),
    ).rejects.toThrow(BusinessRuleError);
  });
});

// =====================================================================
// expirarCotacoesVencidas() — operação de bulk
// =====================================================================

describe('expirarCotacoesVencidas()', () => {
  it('retorna o número de cotações expiradas', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.cotacao.updateMany.mockResolvedValue({ count: 3 });

    const { comprasService } = await import('../compras.service');
    const count = await comprasService.expirarCotacoesVencidas(ctx);
    expect(count).toBe(3);
  });
});

// =====================================================================
// enviarPedido() — transição de estado
// =====================================================================

describe('enviarPedido()', () => {
  it('RASCUNHO → ENVIADO é válido', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.pedidoCompra.findUnique.mockResolvedValue({
      id: 'pc-1', tenantId: 'tenant-test', status: 'RASCUNHO',
    });
    db.pedidoCompra.update.mockResolvedValue({});

    const { comprasService } = await import('../compras.service');
    await expect(comprasService.enviarPedido('pc-1', ctx)).resolves.toBeUndefined();
  });

  it('CONFIRMADO → ENVIADO é inválido', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    db.pedidoCompra.findUnique.mockResolvedValue({
      id: 'pc-1', tenantId: 'tenant-test', status: 'CONFIRMADO',
    });

    const { comprasService } = await import('../compras.service');
    await expect(comprasService.enviarPedido('pc-1', ctx)).rejects.toThrow(BusinessRuleError);
  });
});

// =====================================================================
// Invariante: TRANSICOES_PEDIDO_COMPRA — RECEBIDO_PARCIAL
// =====================================================================

describe('TRANSICOES_PEDIDO_COMPRA — invariantes críticos', () => {
  it('EM_TRANSITO pode ir para RECEBIDO_PARCIAL (recepção parcial)', () => {
    expect(TRANSICOES_PEDIDO_COMPRA.EM_TRANSITO).toContain('RECEBIDO_PARCIAL');
  });

  it('EM_TRANSITO pode ir directamente para RECEBIDO_TOTAL (recepção total na 1ª entrega)', () => {
    expect(TRANSICOES_PEDIDO_COMPRA.EM_TRANSITO).toContain('RECEBIDO_TOTAL');
  });

  it('RECEBIDO_PARCIAL só pode progredir para RECEBIDO_TOTAL (não volta a EM_TRANSITO)', () => {
    expect(TRANSICOES_PEDIDO_COMPRA.RECEBIDO_PARCIAL).toEqual(['RECEBIDO_TOTAL']);
  });
});
