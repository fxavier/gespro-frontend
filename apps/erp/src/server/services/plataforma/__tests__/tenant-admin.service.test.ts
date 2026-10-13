import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockTenant = vi.fn();
  const mockCfg = vi.fn();
  const mockTx = {
    tenant: { create: vi.fn(), update: vi.fn() },
    configuracaoFiscal: { create: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    assinatura: {
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    plano: { findUnique: vi.fn(), findFirst: vi.fn() },
  };
  return {
    mockTenant,
    mockCfg,
    mockTx,
    tenantFindMany: vi.fn(),
    cfgFindMany: vi.fn(),
    // O plano vem da Assinatura (ADR-0027 §5, ADR-0049 §1, issue #524).
    assinaturaFindMany: vi.fn(),
    assinaturaFindUnique: vi.fn(),
    assinaturaFindFirst: vi.fn(),
    cfgUpsert: vi.fn(),
    // Catálogo global (ADR-0049 §1): o `exigirPlanoDisponivel` lê-o pelo prismaBase.
    planoFindUnique: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  };
});

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    plano: { findUnique: mocks.planoFindUnique },
    assinatura: {
      findMany: mocks.assinaturaFindMany,
      findUnique: mocks.assinaturaFindUnique,
      findFirst: mocks.assinaturaFindFirst,
    },
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
import { TRIAL_DIAS } from '@/lib/planos';

const PLANO_BASICO = {
  codigo: 'BASICO',
  nome: 'Básico',
  arquivadoEm: null as Date | null,
};

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
  mocks.assinaturaFindMany.mockResolvedValue([]);
  mocks.assinaturaFindUnique.mockResolvedValue(null);
  mocks.assinaturaFindFirst.mockResolvedValue(null);
  mocks.mockTx.assinatura.findFirst.mockResolvedValue(null);
  mocks.planoFindUnique.mockImplementation(async ({ where }: { where: { codigo: string } }) =>
    where.codigo === 'BASICO' ? PLANO_BASICO : null,
  );
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

  it('pré-filtra por planoAssinatura pela Assinatura (nunca pela ConfiguracaoFiscal)', async () => {
    mocks.assinaturaFindMany.mockResolvedValue([{ tenantId: 'tenant-1' }]);
    mocks.cfgFindMany.mockResolvedValue([DEMO_CFG]); // batch fetch
    mocks.tenantFindMany.mockResolvedValue([DEMO_TENANT]);

    const page = await tenantAdminService.listar({ planoAssinatura: 'PROFISSIONAL', take: 25 });
    expect(page.items).toHaveLength(1);

    // O pré-filtro é UMA leitura da Assinatura pelo plano…
    expect(mocks.assinaturaFindMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.assinaturaFindMany.mock.calls[0][0].where)).toContain('PROFISSIONAL');
    // …que restringe os tenants aos ids que ela devolveu…
    expect(JSON.stringify(mocks.tenantFindMany.mock.calls[0][0].where)).toContain('tenant-1');
    // …e a ConfiguracaoFiscal já não é consultada pelo plano.
    for (const [args] of mocks.cfgFindMany.mock.calls) {
      expect(JSON.stringify(args ?? {})).not.toContain('planoAssinatura');
    }
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

const NOVO_TENANT = {
  nome: 'Demo',
  slug: 'demo',
  nuit: '400000000',
  timezone: 'Africa/Maputo',
  moedaBase: 'MZN',
  regimeIva: 'NORMAL' as const,
  taxaIvaDefault: 0.16,
};

function semEscritaNaTx() {
  expect(mocks.$transaction).not.toHaveBeenCalled();
  expect(mocks.mockTx.tenant.create).not.toHaveBeenCalled();
  expect(mocks.mockTx.tenant.update).not.toHaveBeenCalled();
  expect(mocks.mockTx.configuracaoFiscal.create).not.toHaveBeenCalled();
  expect(mocks.mockTx.configuracaoFiscal.upsert).not.toHaveBeenCalled();
  expect(mocks.mockTx.assinatura.create).not.toHaveBeenCalled();
  expect(mocks.mockTx.assinatura.update).not.toHaveBeenCalled();
  expect(mocks.mockTx.assinatura.updateMany).not.toHaveBeenCalled();
  expect(mocks.mockTx.assinatura.upsert).not.toHaveBeenCalled();
}

async function esperarPlanoIndisponivel(p: Promise<unknown>) {
  const erro = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(BusinessRuleError);
  expect((erro as BusinessRuleError).code).toBe('PLANO_INDISPONIVEL');
}

describe('tenantAdminService.criar — plano do catálogo (ADR-0049 §3, #524)', () => {
  it('cria a Assinatura em TRIAL com o plano escolhido', async () => {
    mocks.mockTx.tenant.create.mockResolvedValue(DEMO_TENANT);
    mocks.mockTenant.mockResolvedValueOnce(null).mockResolvedValueOnce(DEMO_TENANT);

    await tenantAdminService.criar({ ...NOVO_TENANT, planoAssinatura: 'BASICO' });

    expect(mocks.planoFindUnique).toHaveBeenCalledWith({ where: { codigo: 'BASICO' } });
    expect(mocks.mockTx.assinatura.create).toHaveBeenCalledOnce();
    const data = mocks.mockTx.assinatura.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 'tenant-1', planoAssinatura: 'BASICO', estado: 'TRIAL' });
  });

  it('plano inexistente → PLANO_INDISPONIVEL e nada escrito', async () => {
    mocks.mockTenant.mockResolvedValueOnce(null);
    await esperarPlanoIndisponivel(
      tenantAdminService.criar({ ...NOVO_TENANT, planoAssinatura: 'NAO_EXISTE' }),
    );
    expect(mocks.planoFindUnique).toHaveBeenCalledWith({ where: { codigo: 'NAO_EXISTE' } });
    semEscritaNaTx();
  });

  it('plano arquivado → PLANO_INDISPONIVEL e nada escrito', async () => {
    mocks.mockTenant.mockResolvedValueOnce(null);
    mocks.planoFindUnique.mockResolvedValue({ ...PLANO_BASICO, arquivadoEm: new Date('2026-01-01') });
    await esperarPlanoIndisponivel(
      tenantAdminService.criar({ ...NOVO_TENANT, planoAssinatura: 'BASICO' }),
    );
    semEscritaNaTx();
  });
});

describe('tenantAdminService.actualizar — plano do catálogo (ADR-0049 §3, #524)', () => {
  it('plano inexistente → PLANO_INDISPONIVEL e nada escrito', async () => {
    await esperarPlanoIndisponivel(
      tenantAdminService.actualizar('tenant-1', { nome: 'Novo', planoAssinatura: 'NAO_EXISTE' }),
    );
    semEscritaNaTx();
  });

  it('plano arquivado → PLANO_INDISPONIVEL e nada escrito', async () => {
    mocks.planoFindUnique.mockResolvedValue({ ...PLANO_BASICO, arquivadoEm: new Date('2026-01-01') });
    await esperarPlanoIndisponivel(
      tenantAdminService.actualizar('tenant-1', { nome: 'Novo', planoAssinatura: 'BASICO' }),
    );
    semEscritaNaTx();
  });

  it('plano válido → update singular da Assinatura do tenant (nunca updateMany)', async () => {
    mocks.mockTx.assinatura.findFirst.mockResolvedValue({
      id: 'ass-1',
      tenantId: 'tenant-1',
      planoAssinatura: 'PROFISSIONAL',
      estado: 'ATIVA',
    });

    await tenantAdminService.actualizar('tenant-1', { planoAssinatura: 'BASICO' });

    expect(mocks.mockTx.assinatura.findFirst).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.mockTx.assinatura.findFirst.mock.calls[0][0].where)).toContain(
      'tenant-1',
    );
    expect(mocks.mockTx.assinatura.update).toHaveBeenCalledOnce();
    expect(mocks.mockTx.assinatura.update).toHaveBeenCalledWith({
      where: { id: 'ass-1' },
      data: { planoAssinatura: 'BASICO' },
    });
    expect(mocks.mockTx.assinatura.updateMany).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.upsert).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.create).not.toHaveBeenCalled();
  });

  it('tenant sem Assinatura → cria uma em TRIAL com esse plano', async () => {
    mocks.mockTx.assinatura.findFirst.mockResolvedValue(null);
    const antes = Date.now();

    await tenantAdminService.actualizar('tenant-1', { planoAssinatura: 'BASICO' });

    expect(mocks.mockTx.assinatura.create).toHaveBeenCalledOnce();
    const data = mocks.mockTx.assinatura.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 'tenant-1', planoAssinatura: 'BASICO', estado: 'TRIAL' });
    expect(data.trialInicio).toBeInstanceOf(Date);
    expect(data.trialFim.getTime() - data.trialInicio.getTime()).toBe(TRIAL_DIAS * 24 * 60 * 60 * 1000);
    expect(data.trialInicio.getTime()).toBeGreaterThanOrEqual(antes);
    expect(mocks.mockTx.assinatura.update).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.updateMany).not.toHaveBeenCalled();
  });

  it('sem planoAssinatura → não lê o catálogo nem toca na Assinatura', async () => {
    await tenantAdminService.actualizar('tenant-1', { nome: 'Novo', cidade: 'Maputo' });

    expect(mocks.planoFindUnique).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.findFirst).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.create).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.update).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.updateMany).not.toHaveBeenCalled();
    expect(mocks.mockTx.assinatura.upsert).not.toHaveBeenCalled();
    // …mas o resto da actualização acontece.
    expect(mocks.mockTx.tenant.update).toHaveBeenCalledOnce();
    expect(mocks.mockTx.configuracaoFiscal.upsert).toHaveBeenCalledOnce();
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
