import 'server-only';
import { prismaBase } from '@/server/db/client';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import type { Page } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import type {
  CreateTenantInput,
  UpdateTenantInput,
  FilterTenantInput,
  ConfiguracaoFiscalInput,
} from '@/lib/validations/plataforma';
import type {
  ITenantAdminService,
  TenantRow,
  ConfiguracaoFiscalRow,
} from './tenant-admin.interface';

// ---------------------------------------------------------------------------
// Mapeamento
// ---------------------------------------------------------------------------

type PrismaCfg = Awaited<ReturnType<typeof prismaBase.configuracaoFiscal.findUniqueOrThrow>>;

function mapCfg(cfg: PrismaCfg): ConfiguracaoFiscalRow {
  return {
    id: cfg.id,
    tenantId: cfg.tenantId,
    planoAssinatura: cfg.planoAssinatura as ConfiguracaoFiscalRow['planoAssinatura'],
    statusAtivo: cfg.statusAtivo,
    email: cfg.email,
    telefone: cfg.telefone,
    endereco: cfg.endereco,
    cidade: cfg.cidade,
    provincia: cfg.provincia,
    codigoPostal: cfg.codigoPostal,
    timezone: cfg.timezone,
    moedaBase: cfg.moedaBase,
    regimeIva: cfg.regimeIva as ConfiguracaoFiscalRow['regimeIva'],
    taxaIvaDefault: cfg.taxaIvaDefault.toString(),
    logoEmpresa: cfg.logoEmpresa,
    assinaturaDigital: cfg.assinaturaDigital,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  };
}

type PrismaTenant = Awaited<ReturnType<typeof prismaBase.tenant.findFirstOrThrow>>;

function buildRow(tenant: PrismaTenant, cfg: PrismaCfg | null): TenantRow {
  return {
    id: tenant.id,
    nome: tenant.nome,
    slug: tenant.slug,
    nuit: tenant.nuit,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    deletedAt: tenant.deletedAt ?? null,
    configuracaoFiscal: cfg ? mapCfg(cfg) : null,
  };
}

async function fetchTenantRow(tenantId: string): Promise<TenantRow> {
  const [tenant, cfg] = await Promise.all([
    prismaBase.tenant.findFirst({ where: { id: tenantId } }),
    prismaBase.configuracaoFiscal.findUnique({ where: { tenantId } }),
  ]);
  if (!tenant) throw new NotFoundError('Tenant não encontrado');
  return buildRow(tenant, cfg);
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export const tenantAdminService: ITenantAdminService = {
  async listar(filter: FilterTenantInput): Promise<Page<TenantRow>> {
    const { search, planoAssinatura, statusAtivo, cursor, take = 25 } = filter;

    // Pré-filtro por ConfiguracaoFiscal se necessário
    let cfgFilter: string[] | undefined;
    if (planoAssinatura !== undefined || statusAtivo !== undefined) {
      const cfgs = await prismaBase.configuracaoFiscal.findMany({
        where: {
          ...(planoAssinatura !== undefined ? { planoAssinatura } : {}),
          ...(statusAtivo !== undefined ? { statusAtivo } : {}),
        },
        select: { tenantId: true },
      });
      cfgFilter = cfgs.map((c) => c.tenantId);
    }

    const tenants = await prismaBase.tenant.findMany({
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: {
        deletedAt: null,
        ...(search ? { nome: { contains: search, mode: 'insensitive' } } : {}),
        ...(cfgFilter !== undefined ? { id: { in: cfgFilter } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = tenants.length > take;
    const page = tenants.slice(0, take);

    // Batch fetch das configurações para evitar N+1
    const cfgs =
      page.length > 0
        ? await prismaBase.configuracaoFiscal.findMany({
            where: { tenantId: { in: page.map((t) => t.id) } },
          })
        : [];
    const cfgMap = Object.fromEntries(cfgs.map((c) => [c.tenantId, c]));

    const items: TenantRow[] = page.map((t) => buildRow(t, cfgMap[t.id] ?? null));

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  async obter(tenantId: string): Promise<TenantRow> {
    return fetchTenantRow(tenantId);
  },

  async criar(input: CreateTenantInput): Promise<TenantRow> {
    const existing = await prismaBase.tenant.findFirst({
      where: { OR: [{ slug: input.slug }, { nuit: input.nuit }] },
    });
    if (existing) {
      throw new BusinessRuleError(
        'TENANT_DUPLICADO',
        existing.slug === input.slug ? 'Slug já existe' : 'NUIT já registado',
      );
    }

    const tenant = await prismaBase.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: { nome: input.nome, slug: input.slug, nuit: input.nuit },
      });
      await tx.configuracaoFiscal.create({
        data: {
          tenantId: t.id,
          planoAssinatura: input.planoAssinatura ?? 'BASICO',
          regimeIva: input.regimeIva ?? 'NORMAL',
          taxaIvaDefault: input.taxaIvaDefault ?? 0.16,
          moedaBase: input.moedaBase ?? 'MZN',
          timezone: input.timezone ?? 'Africa/Maputo',
          email: input.email ?? null,
          telefone: input.telefone ?? null,
          endereco: input.endereco ?? null,
          cidade: input.cidade ?? null,
          provincia: input.provincia ?? null,
          codigoPostal: input.codigoPostal ?? null,
        },
      });
      return t;
    });

    return fetchTenantRow(tenant.id);
  },

  async actualizar(tenantId: string, input: UpdateTenantInput): Promise<TenantRow> {
    const tenant = await prismaBase.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundError('Tenant não encontrado');

    await prismaBase.$transaction(async (tx) => {
      if (input.nome) {
        await tx.tenant.update({ where: { id: tenantId }, data: { nome: input.nome } });
      }

      const cfgFields: Record<string, unknown> = {};
      const fieldMap: (keyof typeof input)[] = [
        'planoAssinatura', 'regimeIva', 'taxaIvaDefault', 'moedaBase',
        'timezone', 'email', 'telefone', 'endereco', 'cidade', 'provincia', 'codigoPostal',
      ];
      for (const f of fieldMap) {
        if (input[f] !== undefined) cfgFields[f] = input[f];
      }

      if (Object.keys(cfgFields).length > 0) {
        await tx.configuracaoFiscal.upsert({
          where: { tenantId },
          update: cfgFields,
          create: { tenantId, ...cfgFields },
        });
      }
    });

    return fetchTenantRow(tenantId);
  },

  async actualizarConfiguracaoFiscal(
    tenantId: string,
    input: ConfiguracaoFiscalInput,
    _ctx: Ctx,
  ): Promise<ConfiguracaoFiscalRow> {
    const cfg = await prismaBase.configuracaoFiscal.upsert({
      where: { tenantId },
      update: input,
      create: { tenantId, ...input },
    });
    return mapCfg(cfg);
  },

  async desactivar(tenantId: string): Promise<void> {
    const tenant = await prismaBase.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant não encontrado');
    if (tenant.deletedAt) throw new BusinessRuleError('TENANT_JA_INATIVO', 'Tenant já está inactivo');

    await prismaBase.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { deletedAt: new Date() } });
      await tx.configuracaoFiscal.updateMany({
        where: { tenantId },
        data: { statusAtivo: false },
      });
    });
  },

  async reactivar(tenantId: string): Promise<void> {
    const tenant = await prismaBase.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant não encontrado');
    if (!tenant.deletedAt) throw new BusinessRuleError('TENANT_JA_ATIVO', 'Tenant já está activo');

    await prismaBase.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { deletedAt: null } });
      await tx.configuracaoFiscal.updateMany({
        where: { tenantId },
        data: { statusAtivo: true },
      });
    });
  },
};
