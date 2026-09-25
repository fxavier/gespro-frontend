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
  proximoNumeroSerie: vi.fn().mockResolvedValue('CP-2026-00001'),
}));

// Fornecedor + ContaPGC base para testes de criar()
const fornecedorMock = { nuit: '123456789', tenantId: 'tenant-test' };
const contaPGCMock   = { codigo: '3111', tenantId: 'tenant-test' };

// ContaPagar criada que o mock de tx.contaPagar.create devolve
const contaCriadaMock = {
  id: 'cp-novo', tenantId: 'tenant-test', numero: 'CP-2026-00001',
  fornecedorId: 'for-1', descricao: 'Factura FRN-001', status: 'ABERTA',
  valorOriginal: 116, valorPago: 0, valorRestante: 116,
  dataEmissao: new Date('2026-02-10'), dataVencimento: new Date('2026-03-10'),
  contaContabilId: 'pgc-id-1',
  numeroDocumento: 'FRN-001', dataDocumento: new Date('2026-02-10'),
  nuitFornecedor: '123456789', baseIva: 100, taxaIva: 0.16, valorIva: 16,
  tipoAquisicao: 'INVENTARIOS',
  fornecedor: { nome: 'Fornecedor A' }, pagamentos: [],
};

// Mock do Prisma
vi.mock('@/server/db/client', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn({
      fornecedor:  { findUnique: vi.fn().mockResolvedValue(fornecedorMock) },
      contaPGC:    { findUnique: vi.fn().mockResolvedValue(contaPGCMock) },
      contaPagar:  { findUnique: vi.fn(), update: vi.fn(), create: vi.fn().mockResolvedValue(contaCriadaMock) },
      pagamento:   { create: vi.fn().mockResolvedValue({ id: 'pag-001', tenantId: 'tenant-test', numero: 'CP-2026-00001', contaPagarId: 'cp-001', dataPagamento: new Date(), valor: 100, formaPagamento: 'Transferência', status: 'CONCLUIDO', createdAt: new Date() }), update: vi.fn() },
    })),
    contaPagar: {
      findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
    },
    pagamento: { findMany: vi.fn(), create: vi.fn() },
  },
}));

const ctx = { tenantId: 'tenant-test', userId: 'user-test' };

// #78 — registarPagamento passa a exigir o meio: forma do enum + contaBancariaId, e a
// ContaBancaria (com a sua ContaPGC) tem de existir no tenant. Delegados lenientes
// (findFirst/findUnique) para não ditar a query da implementação.
const CONTA_BANCARIA_ID = '1c7d9a5e-2f4b-4c1e-9a0b-3d5e6f7a8b9c';
const contaPGCBancoMock = { id: 'pgc-123', tenantId: 'tenant-test', codigo: '123', ativo: true, aceitaLancamento: true };
const contaBancariaMock = {
  id: CONTA_BANCARIA_ID, tenantId: 'tenant-test', tipoConta: 'CORRENTE', ativo: true,
  contaContabilId: contaPGCBancoMock.id, contaContabil: contaPGCBancoMock,
};
function meioBancario() {
  return {
    contaBancaria: {
      findFirst: vi.fn(async () => contaBancariaMock),
      findUnique: vi.fn(async () => contaBancariaMock),
      findFirstOrThrow: vi.fn(async () => contaBancariaMock),
      findUniqueOrThrow: vi.fn(async () => contaBancariaMock),
    },
    contaPGC: {
      findFirst: vi.fn(async () => contaPGCBancoMock),
      findUnique: vi.fn(async () => contaPGCBancoMock),
    },
  };
}

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
        ...meioBancario(), // #78: meio bancário real (ContaBancaria CORRENTE → PGC 123)
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
        { contaPagarId: 'cp-1', dataPagamento: new Date(), valor: 1000, formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: CONTA_BANCARIA_ID } as any,
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
        ...meioBancario(), // #78: meio bancário real (ContaBancaria CORRENTE → PGC 123)
        contaPagar: {
          findUnique: vi.fn().mockResolvedValue(contaMock),
          update: mockContaPagarUpdate,
        },
        pagamento: { create: mockPagamentoCreate, update: mockPagamentoUpdate },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    const pag = await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-1', dataPagamento: new Date(), valor: 500, formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: CONTA_BANCARIA_ID } as any,
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

// =====================================================================
// registarPagamento() — pagamento parcial numa conta VENCIDA
// =====================================================================

describe('registarPagamento() — conta VENCIDA', () => {
  it('pagamento parcial mantém VENCIDA (não há transição para PARCIALMENTE_PAGA)', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    // VENCIDA → PARCIALMENTE_PAGA não é transição válida; antes da correcção o
    // serviço tentava-a e rebentava com «Transição inválida» (500) no caso
    // mais comum: o fornecedor a receber por prestações depois do prazo.
    const contaMock = {
      id: 'cp-v', tenantId: 'tenant-test', status: 'VENCIDA',
      valorOriginal: 500, valorPago: 0, valorRestante: 500,
      descricao: 'Factura em atraso', pagamentos: [],
    };
    const pagamentoMock = {
      id: 'pag-v', numero: 'PAG-2026-V', dataPagamento: new Date(),
      valor: 200, formaPagamento: 'TRF', referencia: null, status: 'CONCLUIDO', lancamentoId: null,
    };
    const mockContaPagarUpdate = vi.fn().mockResolvedValue({ ...contaMock });
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        ...meioBancario(), // #78: meio bancário real (ContaBancaria CORRENTE → PGC 123)
        contaPagar: { findUnique: vi.fn().mockResolvedValue(contaMock), update: mockContaPagarUpdate },
        pagamento: { create: vi.fn().mockResolvedValue(pagamentoMock), update: vi.fn().mockResolvedValue(pagamentoMock) },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    await expect(
      contaPagarService.registarPagamento(
        { contaPagarId: 'cp-v', dataPagamento: new Date(), valor: 200, formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: CONTA_BANCARIA_ID } as any,
        ctx,
      ),
    ).resolves.toBeDefined();

    expect(mockContaPagarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'VENCIDA', valorPago: 200, valorRestante: 300 }),
      }),
    );
  });

  it('liquidação total de uma VENCIDA passa a PAGA', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;
    const contaMock = {
      id: 'cp-v2', tenantId: 'tenant-test', status: 'VENCIDA',
      valorOriginal: 500, valorPago: 200, valorRestante: 300,
      descricao: 'Factura em atraso', pagamentos: [],
    };
    const mockContaPagarUpdate = vi.fn().mockResolvedValue({ ...contaMock, status: 'PAGA' });
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        ...meioBancario(), // #78: meio bancário real (ContaBancaria CORRENTE → PGC 123)
        contaPagar: { findUnique: vi.fn().mockResolvedValue(contaMock), update: mockContaPagarUpdate },
        pagamento: {
          create: vi.fn().mockResolvedValue({ id: 'pag-v2', numero: 'PAG-2026-V2', dataPagamento: new Date(), valor: 300, formaPagamento: 'TRF', referencia: null, status: 'CONCLUIDO', lancamentoId: null }),
          update: vi.fn().mockResolvedValue({}),
        },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-v2', dataPagamento: new Date(), valor: 300, formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: CONTA_BANCARIA_ID } as any,
      ctx,
    );
    expect(mockContaPagarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAGA' }) }),
    );
  });
});

// =====================================================================
// criar() — reconhecimento da dívida + IVA dedutível (ADR-0034 §1)
// =====================================================================

// Input base partilhado pelos testes de criar()
const inputBase = {
  fornecedorId: 'for-1',
  descricao: 'Factura FRN-001',
  valorOriginal: 116,
  dataEmissao: new Date('2026-02-10'),
  dataVencimento: new Date('2026-03-10'),
  contaContabilId: 'pgc-id-1',
};

describe('contaPagarService.criar() — reconhecimento (ADR-0034 §1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CONTA_CONTABIL_OBRIGATORIA quando contaContabilId está ausente', async () => {
    const { contaPagarService } = await import('../conta-pagar.service');
    const inputSemConta = { ...inputBase, contaContabilId: undefined };
    await expect(
      contaPagarService.criar(inputSemConta as any, ctx),
    ).rejects.toMatchObject({ code: 'CONTA_CONTABIL_OBRIGATORIA' });
  });

  it('DOCUMENTO_FORNECEDOR_INCOMPLETO quando tipoAquisicao presente mas numeroDocumento ausente', async () => {
    const { contaPagarService } = await import('../conta-pagar.service');
    await expect(
      contaPagarService.criar(
        { ...inputBase, tipoAquisicao: 'INVENTARIOS', baseIva: 100, valorIva: 16 } as any,
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'DOCUMENTO_FORNECEDOR_INCOMPLETO' });
  });

  it('cria conta sem IVA: lançamento D gasto(total) / C 421(total)', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;
    const contaSemIvaMock = { ...contaCriadaMock, tipoAquisicao: null, baseIva: null, valorIva: null };
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        fornecedor: { findUnique: vi.fn().mockResolvedValue(fornecedorMock) },
        contaPGC:   { findUnique: vi.fn().mockResolvedValue(contaPGCMock) },
        contaPagar: { create: vi.fn().mockResolvedValue(contaSemIvaMock), update: vi.fn(), findUnique: vi.fn() },
        pagamento:  { create: vi.fn(), update: vi.fn() },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    const { registarLancamentoContabilistico } = await import('@/server/services/financas/contabilidade.service');
    const mockLan = registarLancamentoContabilistico as any;
    mockLan.mockResolvedValue({ id: 'lan-sem-iva' });

    await contaPagarService.criar({ ...inputBase }, ctx);

    expect(mockLan).toHaveBeenCalledOnce();
    const chamada = mockLan.mock.calls[0][1];
    // Apenas duas partidas: D gasto / C 421
    expect(chamada.partidas).toHaveLength(2);
    const debito = chamada.partidas.find((p: any) => p.tipo === 'DEBITO');
    const credito = chamada.partidas.find((p: any) => p.tipo === 'CREDITO');
    expect(debito.contaCodigo).toBe(contaPGCMock.codigo);
    expect(credito.contaCodigo).toBe('421');
    expect(String(debito.valor)).toBe(String(inputBase.valorOriginal));
    expect(String(credito.valor)).toBe(String(inputBase.valorOriginal));
  });

  it.each([
    ['INVENTARIOS',          '44321', 100, 16],
    ['ATIVOS',               '44322', 200, 32],
    ['OUTROS_BENS_SERVICOS', '44323', 500, 80],
  ] as const)(
    'cria conta com tipoAquisicao=%s → conta IVA %s correcta',
    async (tipoAquisicao, codigoIva, baseIva, valorIva) => {
      const { prisma } = await import('@/server/db/client');
      const db = prisma as any;
      const valorOriginal = baseIva + valorIva;
      const contaMockLocal = { ...contaCriadaMock, tipoAquisicao, baseIva, valorIva, valorOriginal };
      db.$transaction.mockImplementation(async (fn: any) =>
        fn({
          fornecedor: { findUnique: vi.fn().mockResolvedValue(fornecedorMock) },
          contaPGC:   { findUnique: vi.fn().mockResolvedValue(contaPGCMock) },
          contaPagar: { create: vi.fn().mockResolvedValue(contaMockLocal), update: vi.fn(), findUnique: vi.fn() },
          pagamento:  { create: vi.fn(), update: vi.fn() },
        }),
      );

      const { contaPagarService } = await import('../conta-pagar.service');
      const { registarLancamentoContabilistico } = await import('@/server/services/financas/contabilidade.service');
      const mockLan = registarLancamentoContabilistico as any;
      mockLan.mockResolvedValue({ id: `lan-${tipoAquisicao}` });

      await contaPagarService.criar(
        { ...inputBase, valorOriginal, tipoAquisicao, baseIva, valorIva, taxaIva: 0.16, numeroDocumento: 'FRN-X' },
        ctx,
      );

      const chamada = mockLan.mock.calls[0][1];
      expect(chamada.partidas).toHaveLength(3);

      const [dGasto, dIva, c421] = [
        chamada.partidas.find((p: any) => p.tipo === 'DEBITO' && p.contaCodigo === contaPGCMock.codigo),
        chamada.partidas.find((p: any) => p.tipo === 'DEBITO' && p.contaCodigo === codigoIva),
        chamada.partidas.find((p: any) => p.tipo === 'CREDITO' && p.contaCodigo === '421'),
      ];
      expect(dGasto).toBeDefined();
      expect(dIva).toBeDefined();
      expect(c421).toBeDefined();
      // Invariante débitos = créditos
      expect(Number(dGasto.valor) + Number(dIva.valor)).toBeCloseTo(Number(c421.valor), 5);
    },
  );

  it('data do lançamento é dataDocumento, não dataEmissao', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;
    const dataDocumento = new Date('2026-01-31'); // período diferente de dataEmissao
    const dataEmissao   = new Date('2026-02-10');
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        fornecedor: { findUnique: vi.fn().mockResolvedValue(fornecedorMock) },
        contaPGC:   { findUnique: vi.fn().mockResolvedValue(contaPGCMock) },
        contaPagar: { create: vi.fn().mockResolvedValue(contaCriadaMock), update: vi.fn(), findUnique: vi.fn() },
        pagamento:  { create: vi.fn(), update: vi.fn() },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    const { registarLancamentoContabilistico } = await import('@/server/services/financas/contabilidade.service');
    const mockLan = registarLancamentoContabilistico as any;
    mockLan.mockResolvedValue({ id: 'lan-data' });

    await contaPagarService.criar({ ...inputBase, dataEmissao, dataDocumento }, ctx);

    const chamada = mockLan.mock.calls[0][1];
    expect(chamada.data).toEqual(dataDocumento);
    expect(chamada.data).not.toEqual(dataEmissao);
  });

  // #78 (decisão humana C1): substitui «liquidação continua D 421 / C 121». O crédito deixa
  // de ser um 121 fixo e passa a ser a conta PGC da ContaBancaria escolhida (aqui 123), no
  // diário BANCO. Mantém-se a intenção original: a liquidação não toca em IVA (4432x).
  it('liquidação (registarPagamento) por transferência: D 421 / C <PGC da conta bancária>, sem tocar em IVA', async () => {
    const { prisma } = await import('@/server/db/client');
    const db = prisma as any;

    const contaMock = {
      id: 'cp-liq', tenantId: 'tenant-test', status: 'ABERTA',
      valorOriginal: 116, valorPago: 0, valorRestante: 116,
      descricao: 'Factura com IVA', pagamentos: [],
    };
    const pagamentoMock = {
      id: 'pag-liq', numero: 'PAG-2026-LIQ', dataPagamento: new Date(),
      valor: 116, formaPagamento: 'TRANSFERENCIA_BANCARIA', referencia: null, status: 'CONCLUIDO', lancamentoId: null,
    };
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        ...meioBancario(),
        contaPagar: {
          findUnique: vi.fn().mockResolvedValue(contaMock),
          update: vi.fn().mockResolvedValue({ ...contaMock, status: 'PAGA' }),
        },
        pagamento: {
          create: vi.fn().mockResolvedValue(pagamentoMock),
          update: vi.fn().mockResolvedValue({ ...pagamentoMock, lancamentoId: 'lan-001' }),
        },
      }),
    );

    const { contaPagarService } = await import('../conta-pagar.service');
    const { registarLancamentoContabilistico } = await import('@/server/services/financas/contabilidade.service');
    const mockLan = registarLancamentoContabilistico as any;
    mockLan.mockResolvedValue({ id: 'lan-pag' });

    await contaPagarService.registarPagamento(
      { contaPagarId: 'cp-liq', dataPagamento: new Date(), valor: 116, formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: CONTA_BANCARIA_ID } as any,
      ctx,
    );

    expect(mockLan).toHaveBeenCalledOnce();
    const chamada = mockLan.mock.calls[0][1];
    const partidas = chamada.partidas;
    // Apenas D 421 / C 123 (PGC da conta bancária) — sem contas 4432x, nem o 121 antigo
    expect(partidas).toHaveLength(2);
    expect(partidas.find((p: any) => p.contaCodigo === '421' && p.tipo === 'DEBITO')).toBeDefined();
    expect(partidas.find((p: any) => p.contaCodigo === contaPGCBancoMock.codigo && p.tipo === 'CREDITO')).toBeDefined();
    expect(partidas.find((p: any) => p.contaCodigo === '121')).toBeUndefined();
    expect(partidas.find((p: any) => p.contaCodigo.startsWith('4432'))).toBeUndefined();
    expect(chamada.diarioTipo).toBe('BANCO');
  });
});

// =====================================================================
// lancarReconhecimentoDivida() — função partilhada (ADR-0034 §1)
// Testa a lógica de reconhecimento isolada do fluxo de criar()
// para validar o que registarRecepcao usará quando tiver contaContabilId.
// =====================================================================

describe('lancarReconhecimentoDivida() — lançamento equilibrado sem 4432x', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem tipoAquisicao: D gasto(total) / C 421(total) — equilibrado, sem 4432x', async () => {
    const mockTx = {} as any; // lancarReconhecimentoDivida não faz lookups — só constrói partidas

    const { registarLancamentoContabilistico } = await import('@/server/services/financas/contabilidade.service');
    const mockLan = registarLancamentoContabilistico as any;
    mockLan.mockResolvedValue({ id: 'lan-reconh' });

    const { lancarReconhecimentoDivida } = await import('../conta-pagar.service');
    await lancarReconhecimentoDivida(
      mockTx,
      {
        contaPagarId:  'cp-r-1',
        numero:        'CP-2026-00001',
        descricao:     'Compra via pedido PED-001',
        contaCodigo:   '211',
        valorOriginal: 1000,
        tipoAquisicao: null,
        baseIva:       null,
        valorIva:      null,
        dataLancamento: new Date('2026-02-15'),
      },
      ctx,
    );

    expect(mockLan).toHaveBeenCalledOnce();
    const chamada = mockLan.mock.calls[0][1];

    // Equilibrado: débitos = créditos
    const totalDebito  = chamada.partidas.filter((p: any) => p.tipo === 'DEBITO').reduce((s: number, p: any) => s + Number(p.valor), 0);
    const totalCredito = chamada.partidas.filter((p: any) => p.tipo === 'CREDITO').reduce((s: number, p: any) => s + Number(p.valor), 0);
    expect(totalDebito).toBeCloseTo(totalCredito, 5);

    // Apenas 2 partidas: D gasto / C 421 — sem 4432x
    expect(chamada.partidas).toHaveLength(2);
    expect(chamada.partidas.find((p: any) => p.contaCodigo.startsWith('4432'))).toBeUndefined();
    expect(chamada.partidas.find((p: any) => p.contaCodigo === '421' && p.tipo === 'CREDITO')).toBeDefined();
    expect(chamada.partidas.find((p: any) => p.contaCodigo === '211' && p.tipo === 'DEBITO')).toBeDefined();
  });
});
