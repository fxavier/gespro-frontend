import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockTenant = vi.fn();
  const mockCfg = vi.fn();
  const mockTx = {
    tenant: { create: vi.fn(), update: vi.fn() },
    configuracaoFiscal: { create: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  };
  return {
    mockTenant,
    mockCfg,
    mockTx,
    tenantFindMany: vi.fn(),
    cfgFindMany: vi.fn(),
    cfgUpsert: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  };
});

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    tenant: {
      findFirst: mocks.mockTenant,
      findMany: mocks.tenantFindMany,
      update: vi.fn(),
      create: vi.fn(),
    },
    configuracaoFiscal: {
      findUnique: mocks.mockCfg,
      findMany: mocks.cfgFindMany,
      upsert: mocks.cfgUpsert,
      updateMany: vi.fn(),
    },
    $transaction: mocks.$transaction,
  },
}));

import { tenantAdminService } from '../tenant-admin.service';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import { prismaBase } from '@/server/db/client';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };

const DEMO_TENANT = {
  id: 'tenant-1',
  nome: 'Demo',
  slug: 'demo',
  nuit: '400000000',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
};

const DEMO_CFG = {
  id: 'cfg-1',
  tenantId: 'tenant-1',
  planoAssinatura: 'PROFISSIONAL',
  statusAtivo: true,
  email: 'a@b.com',
  telefone: null,
  endereco: null,
  cidade: null,
  provincia: null,
  codigoPostal: null,
  timezone: 'Africa/Maputo',
  moedaBase: 'MZN',
  regimeIva: 'NORMAL',
  taxaIvaDefault: { toString: () => '0.16' },
  logoEmpresa: null,
  assinaturaDigital: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockTenant.mockResolvedValue(DEMO_TENANT);
  mocks.mockCfg.mockResolvedValue(DEMO_CFG);
  // Re-atribuir $transaction após clearAllMocks
  mocks.$transaction.mockImplementation(async (fn: (tx: typeof mocks.mockTx) => unknown) => fn(mocks.mockTx));
});

describe('tenantAdminService.obter', () => {
  it('retorna TenantRow com configuracaoFiscal', async () => {
    const row = await tenantAdminService.obter('tenant-1');
    expect(row.id).toBe('tenant-1');
    expect(row.configuracaoFiscal?.taxaIvaDefault).toBe('0.16');
    expect(row.configuracaoFiscal?.regimeIva).toBe('NORMAL');
  });

  it('lança NotFoundError quando tenant não existe', async () => {
    mocks.mockTenant.mockResolvedValue(null);
    await expect(tenantAdminService.obter('x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('retorna configuracaoFiscal null quando não existe', async () => {
    mocks.mockCfg.mockResolvedValue(null);
    const row = await tenantAdminService.obter('tenant-1');
    expect(row.configuracaoFiscal).toBeNull();
  });
});

describe('tenantAdminService.listar', () => {
  it('retorna Page<TenantRow> sem N+1 — batch fetch de CFG', async () => {
    const tenant2 = { ...DEMO_TENANT, id: 'tenant-2' };
    mocks.tenantFindMany.mockResolvedValue([DEMO_TENANT, tenant2]);
    mocks.cfgFindMany.mockResolvedValue([DEMO_CFG]);

    const page = await tenantAdminService.listar({ take: 25 });

    expect(page.items).toHaveLength(2);
    // CFG batch: chamado exactamente 1 vez (não N vezes)
    expect(mocks.cfgFindMany).toHaveBeenCalledTimes(1);
    expect(page.items[0].configuracaoFiscal).not.toBeNull();
    expect(page.items[1].configuracaoFiscal).toBeNull(); // tenant-2 sem CFG
  });

  it('pré-filtra por planoAssinatura usando 2 queries CFG', async () => {
    mocks.cfgFindMany
      .mockResolvedValueOnce([DEMO_CFG])   // pré-filtro
      .mockResolvedValueOnce([DEMO_CFG]);  // batch fetch
    mocks.tenantFindMany.mockResolvedValue([DEMO_TENANT]);

    const page = await tenantAdminService.listar({ planoAssinatura: 'PROFISSIONAL', take: 25 });
    expect(page.items).toHaveLength(1);
    expect(mocks.cfgFindMany).toHaveBeenCalledTimes(2);
  });
});

describe('tenantAdminService.criar', () => {
  it('cria tenant + CFG em transacção', async () => {
    mocks.mockTx.tenant.create.mockResolvedValue(DEMO_TENANT);
    mocks.mockTx.configuracaoFiscal.create.mockResolvedValue(DEMO_CFG);
    // 1ª chamada: check unicidade (null); 2ª: fetchTenantRow
    mocks.mockTenant.mockResolvedValueOnce(null).mockResolvedValueOnce(DEMO_TENANT);
    mocks.mockCfg.mockResolvedValue(DEMO_CFG);

    const row = await tenantAdminService.criar({
      nome: 'Demo',
      slug: 'demo',
      nuit: '400000000',
      planoAssinatura: 'BASICO',
      timezone: 'Africa/Maputo',
      moedaBase: 'MZN',
      regimeIva: 'NORMAL',
      taxaIvaDefault: 0.16,
    });
    expect(row.id).toBe('tenant-1');
    expect(mocks.$transaction).toHaveBeenCalledOnce();
  });

  it('lança BusinessRuleError em slug duplicado', async () => {
    mocks.mockTenant.mockResolvedValue(DEMO_TENANT);
    await expect(
      tenantAdminService.criar({
        nome: 'x',
        slug: 'demo',
        nuit: '400000001',
        planoAssinatura: 'BASICO',
        timezone: 'Africa/Maputo',
        moedaBase: 'MZN',
        regimeIva: 'NORMAL',
        taxaIvaDefault: 0.16,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('tenantAdminService.desactivar', () => {
  it('marca deletedAt + statusAtivo=false em transacção', async () => {
    mocks.mockTenant.mockResolvedValue({ ...DEMO_TENANT, deletedAt: null });
    mocks.mockTx.tenant.update.mockResolvedValue({});
    mocks.mockTx.configuracaoFiscal.updateMany.mockResolvedValue({ count: 1 });

    await tenantAdminService.desactivar('tenant-1');
    expect(mocks.$transaction).toHaveBeenCalledOnce();
  });

  it('lança BusinessRuleError se já inactivo', async () => {
    mocks.mockTenant.mockResolvedValue({ ...DEMO_TENANT, deletedAt: new Date() });
    await expect(tenantAdminService.desactivar('tenant-1')).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('tenantAdminService.actualizarConfiguracaoFiscal', () => {
  it('upsert com IVA como fracção', async () => {
    mocks.cfgUpsert.mockResolvedValue(DEMO_CFG);

    const row = await tenantAdminService.actualizarConfiguracaoFiscal(
      'tenant-1',
      { regimeIva: 'NORMAL', taxaIvaDefault: 0.16 },
      CTX,
    );
    expect(row.taxaIvaDefault).toBe('0.16');
    expect(prismaBase.configuracaoFiscal.upsert).toHaveBeenCalledOnce();
  });
});
