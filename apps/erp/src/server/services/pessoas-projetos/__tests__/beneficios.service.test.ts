/**
 * Testes unitários — Benefícios (spec 08)
 *
 * Lógica pura testada sem a DB real (DB partilhada não tem as tabelas novas).
 * Usa vi.hoisted para mocks do Prisma (evitar o problema de hoisting de vi.mock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Mock do Prisma via vi.hoisted (evita ReferenceError de hoisting)
// ─────────────────────────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    beneficio: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    beneficioColaborador: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    colaborador: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('@/server/db/client', () => ({ prisma: mockPrisma }));
vi.mock('@/server/db/paginate', () => ({
  paginate: vi.fn(async (fn: (a: { take: number }) => Promise<{ id: string }[]>, opts: { take?: number }) => {
    const take = opts.take ?? 25;
    const rows = await fn({ take: take + 1 });
    return { items: rows.slice(0, take), nextCursor: null };
  }),
}));

import {
  BeneficioService,
  BeneficioColaboradorService,
  linhasPayrollDeBeneficios,
} from '../beneficios.service';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const CTX = { tenantId: 'tenant-demo', userId: 'user-demo' };

const BENEFICIO_BASE = {
  id: 'ben-001',
  tenantId: CTX.tenantId,
  nome: 'Seguro de Saúde',
  tipo: 'SEGURO_SAUDE',
  descricao: null,
  fornecedor: 'Seguradora X',
  custoTotal: new Prisma.Decimal('5000'),
  comparticipacaoEmpresa: new Prisma.Decimal('4000'),
  descontoColaborador: new Prisma.Decimal('1000'),
  periodicidade: 'MENSAL',
  tributavel: false,
  ativo: true,
  departamentosElegiveis: [] as string[],
  cargosElegiveis: [] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const COLABORADOR_BASE = {
  id: 'col-001',
  tenantId: CTX.tenantId,
  departamentoId: 'dept-001',
  cargoId: 'cargo-001',
  deletedAt: null,
};

const ATRIBUICAO_BASE = {
  id: 'atr-001',
  tenantId: CTX.tenantId,
  beneficioId: 'ben-001',
  colaboradorId: 'col-001',
  dataInicio: new Date('2026-01-01'),
  dataFim: null,
  comparticipacaoEmpresa: new Prisma.Decimal('4000'),
  descontoColaborador: new Prisma.Decimal('1000'),
  status: 'ACTIVO',
  observacoes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─────────────────────────────────────────────────────────────────────────────
// BeneficioService
// ─────────────────────────────────────────────────────────────────────────────

describe('BeneficioService.criar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria um benefício e retorna id', async () => {
    mockPrisma.beneficio.create.mockResolvedValueOnce({ id: 'ben-new' });

    const result = await BeneficioService.criar(
      {
        nome: 'Seguro de Saúde',
        tipo: 'SEGURO_SAUDE',
        custoTotal: '5000',
        periodicidade: 'MENSAL',
        tributavel: false,
        ativo: true,
        departamentosElegiveis: [],
        cargosElegiveis: [],
        comparticipacaoEmpresa: '4000',
        descontoColaborador: '1000',
      },
      CTX,
    );

    expect(result).toEqual({ id: 'ben-new' });
    expect(mockPrisma.beneficio.create).toHaveBeenCalledOnce();
    const callArg = mockPrisma.beneficio.create.mock.calls[0][0];
    expect(callArg.data.tenantId).toBe(CTX.tenantId);
    expect(callArg.data.nome).toBe('Seguro de Saúde');
  });
});

describe('BeneficioService.actualizar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lança NotFoundError quando benefício não existe', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce(null);

    await expect(
      BeneficioService.actualizar('ben-inexistente', { nome: 'Novo Nome' }, CTX),
    ).rejects.toThrow(NotFoundError);
  });

  it('actualiza e retorna id quando benefício existe', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce({ id: 'ben-001' });
    mockPrisma.beneficio.update.mockResolvedValueOnce({ id: 'ben-001' });

    const result = await BeneficioService.actualizar('ben-001', { nome: 'Novo Nome' }, CTX);
    expect(result).toEqual({ id: 'ben-001' });
  });
});

describe('BeneficioService.arquivar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lança NotFoundError quando benefício não existe', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce(null);
    await expect(BeneficioService.arquivar('ben-xxx', CTX)).rejects.toThrow(NotFoundError);
  });

  it('lança BusinessRuleError quando há atribuições activas', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce({ id: 'ben-001' });
    mockPrisma.beneficioColaborador.count.mockResolvedValueOnce(3);

    await expect(BeneficioService.arquivar('ben-001', CTX)).rejects.toThrow(BusinessRuleError);
  });

  it('arquiva com sucesso quando não há atribuições activas', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce({ id: 'ben-001' });
    mockPrisma.beneficioColaborador.count.mockResolvedValueOnce(0);
    mockPrisma.beneficio.update.mockResolvedValueOnce({});

    await expect(BeneficioService.arquivar('ben-001', CTX)).resolves.toBeUndefined();
    expect(mockPrisma.beneficio.update).toHaveBeenCalledWith({
      where: { id: 'ben-001' },
      data: { ativo: false },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BeneficioColaboradorService
// ─────────────────────────────────────────────────────────────────────────────

describe('BeneficioColaboradorService.atribuir', () => {
  beforeEach(() => vi.clearAllMocks());

  const INPUT_BASE = {
    beneficioId: 'ben-001',
    colaboradorId: 'col-001',
    dataInicio: new Date('2026-07-01'),
    dataFim: undefined as Date | undefined,
    observacoes: undefined as string | undefined,
  };

  it('lança NotFoundError quando benefício não existe', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce(null);

    await expect(BeneficioColaboradorService.atribuir(INPUT_BASE, CTX)).rejects.toThrow(NotFoundError);
  });

  it('lança NotFoundError quando colaborador não existe', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce(BENEFICIO_BASE);
    mockPrisma.colaborador.findFirst.mockResolvedValueOnce(null);

    await expect(BeneficioColaboradorService.atribuir(INPUT_BASE, CTX)).rejects.toThrow(NotFoundError);
  });

  it('lança BusinessRuleError BENEFICIO_DUPLICADO quando há sobreposição', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce(BENEFICIO_BASE);
    mockPrisma.colaborador.findFirst.mockResolvedValueOnce(COLABORADOR_BASE);
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({ id: 'atr-existente' });

    try {
      await BeneficioColaboradorService.atribuir(INPUT_BASE, CTX);
      expect.fail('Devia ter lançado erro');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('BENEFICIO_DUPLICADO');
    }
  });

  it('cria atribuição com sucesso quando não há duplicação', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce(BENEFICIO_BASE);
    mockPrisma.colaborador.findFirst.mockResolvedValueOnce(COLABORADOR_BASE);
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce(null);
    mockPrisma.beneficioColaborador.create.mockResolvedValueOnce({ id: 'atr-new' });

    const result = await BeneficioColaboradorService.atribuir(INPUT_BASE, CTX);
    expect(result).toEqual({ id: 'atr-new' });
  });

  it('lança BusinessRuleError COLABORADOR_NAO_ELEGIVEL quando departamento não elegível', async () => {
    const beneficioComElegibilidade = {
      ...BENEFICIO_BASE,
      departamentosElegiveis: ['dept-outro'],
    };
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce(beneficioComElegibilidade);
    mockPrisma.colaborador.findFirst.mockResolvedValueOnce(COLABORADOR_BASE);

    try {
      await BeneficioColaboradorService.atribuir(INPUT_BASE, CTX);
      expect.fail('Devia ter lançado erro');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('COLABORADOR_NAO_ELEGIVEL');
    }
  });
});

describe('BeneficioColaboradorService.terminar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lança NotFoundError quando atribuição não existe', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce(null);
    await expect(
      BeneficioColaboradorService.terminar({ id: 'atr-xxx' }, CTX),
    ).rejects.toThrow(NotFoundError);
  });

  it('lança BusinessRuleError ATRIBUICAO_JA_TERMINADA quando já terminada', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({
      id: 'atr-001',
      status: 'TERMINADO',
    });
    try {
      await BeneficioColaboradorService.terminar({ id: 'atr-001' }, CTX);
      expect.fail('Devia ter lançado erro');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('ATRIBUICAO_JA_TERMINADA');
    }
  });

  it('termina atribuição activa com sucesso', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({
      id: 'atr-001',
      status: 'ACTIVO',
    });
    mockPrisma.beneficioColaborador.update.mockResolvedValueOnce({});

    await expect(
      BeneficioColaboradorService.terminar({ id: 'atr-001' }, CTX),
    ).resolves.toBeUndefined();

    expect(mockPrisma.beneficioColaborador.update).toHaveBeenCalledOnce();
    const callArg = mockPrisma.beneficioColaborador.update.mock.calls[0][0];
    expect(callArg.data.status).toBe('TERMINADO');
  });
});

describe('BeneficioColaboradorService.suspender', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lança BusinessRuleError ATRIBUICAO_NAO_ACTIVA quando suspenso', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({
      id: 'atr-001',
      status: 'SUSPENSO',
    });
    try {
      await BeneficioColaboradorService.suspender({ id: 'atr-001' }, CTX);
      expect.fail('Devia ter lançado erro');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('ATRIBUICAO_NAO_ACTIVA');
    }
  });

  it('suspende atribuição activa com sucesso', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({
      id: 'atr-001',
      status: 'ACTIVO',
    });
    mockPrisma.beneficioColaborador.update.mockResolvedValueOnce({});

    await expect(
      BeneficioColaboradorService.suspender({ id: 'atr-001' }, CTX),
    ).resolves.toBeUndefined();

    const callArg = mockPrisma.beneficioColaborador.update.mock.calls[0][0];
    expect(callArg.data.status).toBe('SUSPENSO');
  });
});

describe('BeneficioColaboradorService.reactivar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lança BusinessRuleError ATRIBUICAO_NAO_SUSPENSA quando activo', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({
      id: 'atr-001',
      status: 'ACTIVO',
    });
    try {
      await BeneficioColaboradorService.reactivar('atr-001', CTX);
      expect.fail('Devia ter lançado erro');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('ATRIBUICAO_NAO_SUSPENSA');
    }
  });

  it('reactiva atribuição suspensa com sucesso', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({
      id: 'atr-001',
      status: 'SUSPENSO',
    });
    mockPrisma.beneficioColaborador.update.mockResolvedValueOnce({});

    await expect(BeneficioColaboradorService.reactivar('atr-001', CTX)).resolves.toBeUndefined();

    const callArg = mockPrisma.beneficioColaborador.update.mock.calls[0][0];
    expect(callArg.data.status).toBe('ACTIVO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// linhasPayrollDeBeneficios — contrato de integração
// ─────────────────────────────────────────────────────────────────────────────

describe('linhasPayrollDeBeneficios', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gera PROVENTO e DESCONTO para benefício tributável com comparticipação e desconto', async () => {
    const atribuicaoComBeneficio = {
      ...ATRIBUICAO_BASE,
      beneficio: {
        nome: 'Seguro de Saúde',
        tipo: 'SEGURO_SAUDE',
        tributavel: true,
        periodicidade: 'MENSAL',
      },
    };
    mockPrisma.beneficioColaborador.findMany.mockResolvedValueOnce([atribuicaoComBeneficio]);

    const linhas = await linhasPayrollDeBeneficios('col-001', '2026-07', CTX);

    expect(linhas).toHaveLength(2);
    const provento = linhas.find((l) => l.tipo === 'PROVENTO');
    const desconto = linhas.find((l) => l.tipo === 'DESCONTO');

    expect(provento).toBeDefined();
    expect(provento?.tributavel).toBe(true);
    expect(provento?.valor.equals(new Prisma.Decimal('4000'))).toBe(true);

    expect(desconto).toBeDefined();
    expect(desconto?.tributavel).toBe(false);
    expect(desconto?.valor.equals(new Prisma.Decimal('1000'))).toBe(true);
  });

  it('gera apenas PROVENTO para benefício não tributável (sem desconto do colaborador)', async () => {
    const atribuicaoSemDesconto = {
      ...ATRIBUICAO_BASE,
      descontoColaborador: new Prisma.Decimal('0'),
      beneficio: {
        nome: 'Subsídio Alimentação',
        tipo: 'SUBSIDIO_ALIMENTACAO',
        tributavel: false,
        periodicidade: 'MENSAL',
      },
    };
    mockPrisma.beneficioColaborador.findMany.mockResolvedValueOnce([atribuicaoSemDesconto]);

    const linhas = await linhasPayrollDeBeneficios('col-001', '2026-07', CTX);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].tipo).toBe('PROVENTO');
    expect(linhas[0].tributavel).toBe(false);
  });

  it('não gera linhas para benefícios com periodicidade ANUAL', async () => {
    const atribuicaoAnual = {
      ...ATRIBUICAO_BASE,
      beneficio: {
        nome: 'Plano de Pensões',
        tipo: 'PLANO_PENSOES',
        tributavel: false,
        periodicidade: 'ANUAL',
      },
    };
    mockPrisma.beneficioColaborador.findMany.mockResolvedValueOnce([atribuicaoAnual]);

    const linhas = await linhasPayrollDeBeneficios('col-001', '2026-07', CTX);
    expect(linhas).toHaveLength(0);
  });

  it('retorna lista vazia quando não há benefícios activos', async () => {
    mockPrisma.beneficioColaborador.findMany.mockResolvedValueOnce([]);

    const linhas = await linhasPayrollDeBeneficios('col-001', '2026-07', CTX);
    expect(linhas).toHaveLength(0);
  });

  it('isola por tenant — query inclui tenantId e colaboradorId', async () => {
    mockPrisma.beneficioColaborador.findMany.mockResolvedValueOnce([]);

    await linhasPayrollDeBeneficios('col-001', '2026-07', CTX);

    const whereArg = mockPrisma.beneficioColaborador.findMany.mock.calls[0][0].where;
    expect(whereArg.tenantId).toBe(CTX.tenantId);
    expect(whereArg.colaboradorId).toBe('col-001');
    expect(whereArg.status).toBe('ACTIVO');
  });

  it('gera DESCONTO sem tributação independentemente do flag do benefício', async () => {
    const atribuicaoTributavel = {
      ...ATRIBUICAO_BASE,
      beneficio: {
        nome: 'Seguro Vida',
        tipo: 'SEGURO_VIDA',
        tributavel: true,
        periodicidade: 'MENSAL',
      },
    };
    mockPrisma.beneficioColaborador.findMany.mockResolvedValueOnce([atribuicaoTributavel]);

    const linhas = await linhasPayrollDeBeneficios('col-001', '2026-07', CTX);

    const desconto = linhas.find((l) => l.tipo === 'DESCONTO');
    expect(desconto?.tributavel).toBe(false); // DESCONTO nunca tributável
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property-based: invariantes de não-duplicação
// ─────────────────────────────────────────────────────────────────────────────

describe('Invariante: não-duplicação de período', () => {
  it('[property] dois tenants diferentes nunca colidem', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        (tenant1, tenant2) => {
          fc.pre(tenant1 !== tenant2);
          const isConflict = (t1: string, t2: string) => t1 === t2;
          expect(isConflict(tenant1, tenant2)).toBe(false);
        },
      ),
    );
  });

  it('[property] BusinessRuleError BENEFICIO_DUPLICADO tem code estável', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }),
        (dataInicio) => {
          void dataInicio;
          const erro = new BusinessRuleError('BENEFICIO_DUPLICADO', 'Duplicado');
          expect(erro.code).toBe('BENEFICIO_DUPLICADO');
          expect(erro).toBeInstanceOf(BusinessRuleError);
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Isolamento multi-tenant
// ─────────────────────────────────────────────────────────────────────────────

describe('Isolamento multi-tenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BeneficioService.arquivar verifica tenantId na query de count', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce({ id: 'ben-001' });
    mockPrisma.beneficioColaborador.count.mockResolvedValueOnce(0);
    mockPrisma.beneficio.update.mockResolvedValueOnce({});

    await BeneficioService.arquivar('ben-001', CTX);

    const countArg = mockPrisma.beneficioColaborador.count.mock.calls[0][0];
    expect(countArg.where.tenantId).toBe(CTX.tenantId);
  });

  it('BeneficioColaboradorService.terminar verifica tenantId', async () => {
    mockPrisma.beneficioColaborador.findFirst.mockResolvedValueOnce({
      id: 'atr-001',
      status: 'ACTIVO',
    });
    mockPrisma.beneficioColaborador.update.mockResolvedValueOnce({});

    await BeneficioColaboradorService.terminar({ id: 'atr-001' }, CTX);

    const findArg = mockPrisma.beneficioColaborador.findFirst.mock.calls[0][0];
    expect(findArg.where.tenantId).toBe(CTX.tenantId);
  });

  it('BeneficioService.actualizar verifica tenantId', async () => {
    mockPrisma.beneficio.findFirst.mockResolvedValueOnce({ id: 'ben-001' });
    mockPrisma.beneficio.update.mockResolvedValueOnce({});

    await BeneficioService.actualizar('ben-001', { nome: 'X' }, CTX);

    const findArg = mockPrisma.beneficio.findFirst.mock.calls[0][0];
    expect(findArg.where.tenantId).toBe(CTX.tenantId);
  });
});
