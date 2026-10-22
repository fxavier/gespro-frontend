import 'server-only';
import { Prisma, type AcaoAuditoriaPlataforma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import { TRIAL_DIAS } from '@/lib/planos';
import type { Page } from '@/server/db/paginate';
import { exigirPlanoDisponivel } from './plano.service';
import type { PlataformaCtx } from './plano-admin.service';
import { getRequestContext } from '@/server/observability/context';
import type { Ctx } from '@/server/services/types';
import type {
  CreateTenantInput,
  UpdateTenantInput,
  FilterTenantInput,
  ConfiguracaoFiscalInput,
  DadosEmpresaInput,
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
  if (!tenant) throw new NotFoundError('Empresa não encontrada');
  return buildRow(tenant, cfg);
}

/**
 * Trilho global da plataforma (#41, como o `plano-admin.service`): na MESMA tx da escrita, para
 * que uma escrita recusada não deixe linha. `codigo` é o slug (imutável). Desactivar/reactivar
 * registam-se como ARQUIVAR/DESARQUIVAR — o tenant não se apaga, retira-se.
 * Sem `autor` (chamadas internas e testes unitários do serviço) não há linha: as actions passam-no sempre.
 */
async function registarTrilho(
  tx: Prisma.TransactionClient,
  autor: PlataformaCtx | undefined,
  acao: AcaoAuditoriaPlataforma,
  slug: string,
  dados: { antes?: Prisma.InputJsonValue; depois?: Prisma.InputJsonValue },
): Promise<void> {
  if (!autor) return;
  await tx.auditoriaPlataforma.create({
    data: {
      keycloakSub: autor.keycloakSub,
      acao,
      entidade: 'Tenant',
      codigo: slug,
      ...dados,
      requestId: autor.requestId ?? getRequestContext()?.requestId ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export const tenantAdminService: ITenantAdminService = {
  async listar(filter: FilterTenantInput): Promise<Page<TenantRow>> {
    const { search, planoAssinatura, statusAtivo, cursor, take = 25 } = filter;

    // Pré-filtros: o plano é da Assinatura (ADR-0027 §5, ADR-0049 §1); o estado, da configuração.
    let idsFiltro: string[] | undefined;
    const restringir = (ids: string[]) => {
      idsFiltro = idsFiltro === undefined ? ids : idsFiltro.filter((id) => ids.includes(id));
    };
    if (planoAssinatura !== undefined) {
      const assinaturas = await prismaBase.assinatura.findMany({
        where: { planoAssinatura },
        select: { tenantId: true },
      });
      restringir(assinaturas.map((a) => a.tenantId));
    }
    if (statusAtivo !== undefined) {
      const cfgs = await prismaBase.configuracaoFiscal.findMany({
        where: { statusAtivo },
        select: { tenantId: true },
      });
      restringir(cfgs.map((c) => c.tenantId));
    }

    const tenants = await prismaBase.tenant.findMany({
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: {
        deletedAt: null,
        ...(search ? { nome: { contains: search, mode: 'insensitive' } } : {}),
        ...(idsFiltro !== undefined ? { id: { in: idsFiltro } } : {}),
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

  async criar(input: CreateTenantInput, autor?: PlataformaCtx): Promise<TenantRow> {
    const existing = await prismaBase.tenant.findFirst({
      where: { OR: [{ slug: input.slug }, { nuit: input.nuit }] },
    });
    if (existing) {
      throw new BusinessRuleError(
        'TENANT_DUPLICADO',
        existing.slug === input.slug ? 'Slug já existe' : 'NUIT já registado',
      );
    }
    // Código validado contra o catálogo antes de escrever (ADR-0049 §3): inexistente ou
    // arquivado → PLANO_INDISPONIVEL (409), não um P2003 da FK que sairia como «Erro interno».
    await exigirPlanoDisponivel(input.planoAssinatura);

    const tenant = await prismaBase.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: { nome: input.nome, slug: input.slug, nuit: input.nuit },
      });
      await tx.configuracaoFiscal.create({
        data: {
          tenantId: t.id,
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
      // O plano é da Assinatura (ADR-0027 §5): nasce em TRIAL, como no registo público. A FK
      // para `Plano.codigo` recusa um código inexistente.
      const agora = new Date();
      await tx.assinatura.create({
        data: {
          tenantId: t.id,
          planoAssinatura: input.planoAssinatura,
          estado: 'TRIAL',
          trialInicio: agora,
          trialFim: new Date(agora.getTime() + TRIAL_DIAS * 24 * 60 * 60 * 1000),
        },
      });
      await registarTrilho(tx, autor, 'CRIAR', t.slug, { depois: { id: t.id, ...input } });
      return t;
    });

    return fetchTenantRow(tenant.id);
  },

  async actualizar(
    tenantId: string,
    input: UpdateTenantInput,
    autor?: PlataformaCtx,
  ): Promise<TenantRow> {
    const tenant = await prismaBase.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundError('Empresa não encontrada');
    // Só se entra num plano disponível; um plano arquivado não se volta a escolher (ADR-0049 §3).
    if (input.planoAssinatura !== undefined) await exigirPlanoDisponivel(input.planoAssinatura);

    await prismaBase.$transaction(async (tx) => {
      if (input.nome) {
        await tx.tenant.update({ where: { id: tenantId }, data: { nome: input.nome } });
      }

      const cfgFields: Record<string, unknown> = {};
      const fieldMap: (keyof typeof input)[] = [
        'regimeIva', 'taxaIvaDefault', 'moedaBase',
        'timezone', 'email', 'telefone', 'endereco', 'cidade', 'provincia', 'codigoPostal',
      ];
      for (const f of fieldMap) {
        if (input[f] !== undefined) cfgFields[f] = input[f];
      }

      if (input.planoAssinatura !== undefined) {
        // Escrita singular e nunca silenciosa: um tenant sem
        // Assinatura ganha uma, em TRIAL, como no registo — não um updateMany de 0 linhas.
        const assinatura = await tx.assinatura.findFirst({ where: { tenantId } });
        if (assinatura) {
          await tx.assinatura.update({
            where: { id: assinatura.id },
            data: { planoAssinatura: input.planoAssinatura },
          });
        } else {
          const agora = new Date();
          await tx.assinatura.create({
            data: {
              tenantId,
              planoAssinatura: input.planoAssinatura,
              estado: 'TRIAL',
              trialInicio: agora,
              trialFim: new Date(agora.getTime() + TRIAL_DIAS * 24 * 60 * 60 * 1000),
            },
          });
        }
      }

      if (Object.keys(cfgFields).length > 0) {
        await tx.configuracaoFiscal.upsert({
          where: { tenantId },
          update: cfgFields,
          create: { tenantId, ...cfgFields },
        });
      }
      await registarTrilho(tx, autor, 'ACTUALIZAR', tenant.slug, {
        antes: { id: tenantId, nome: tenant.nome },
        depois: { id: tenantId, ...input },
      });
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

  async actualizarDadosEmpresa(input: DadosEmpresaInput, ctx: Ctx): Promise<TenantRow> {
    const tenantId = ctx.tenantId;
    const tenant = await prismaBase.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundError('Empresa não encontrada');

    // Antes de qualquer escrita: a auditoria sai fora da tx, e um pedido recusado não deixa trilho.
    const nuitDuplicado = () =>
      new BusinessRuleError('NUIT_DUPLICADO', 'Este NUIT já está registado noutra empresa');
    const outro = await prismaBase.tenant.findFirst({
      where: { nuit: input.nuit, id: { not: tenantId } },
      select: { id: true },
    });
    if (outro) throw nuitDuplicado();

    // O formulário envia todos os campos: vazio apaga.
    const cfgDados = {
      regimeIva: input.regimeIva,
      endereco: input.endereco || null,
      cidade: input.cidade || null,
      provincia: input.provincia || null,
      codigoPostal: input.codigoPostal || null,
      email: input.email || null,
      telefone: input.telefone || null,
    };

    try {
      // Escritas singulares pelo cliente estendido: a audit-extension deixa UPDATE/CREATE no trilho
      // (um `upsert` passaria sem AuditLog).
      await runWithTenantContext(ctx, () =>
        prisma.$transaction(async (tx) => {
          await tx.tenant.update({
            where: { id: tenantId },
            data: { nome: input.nome, nuit: input.nuit },
          });
          const cfg = await tx.configuracaoFiscal.findFirst({ where: { tenantId }, select: { id: true } });
          if (cfg) {
            await tx.configuracaoFiscal.update({ where: { tenantId }, data: cfgDados });
          } else {
            await tx.configuracaoFiscal.create({ data: { tenantId, ...cfgDados } });
          }
        }),
      );
    } catch (e) {
      // Corrida com outro tenant a gravar o mesmo NUIT entre a verificação e a escrita.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw nuitDuplicado();
      throw e;
    }

    return fetchTenantRow(tenantId);
  },

  async desactivar(tenantId: string, autor?: PlataformaCtx): Promise<void> {
    const tenant = await prismaBase.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Empresa não encontrada');
    if (tenant.deletedAt) throw new BusinessRuleError('TENANT_JA_INATIVO', 'A empresa já está inactiva');

    await prismaBase.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { deletedAt: new Date() } });
      await tx.configuracaoFiscal.updateMany({
        where: { tenantId },
        data: { statusAtivo: false },
      });
      await registarTrilho(tx, autor, 'ARQUIVAR', tenant.slug, { depois: { id: tenantId } });
    });
  },

  async reactivar(tenantId: string, autor?: PlataformaCtx): Promise<void> {
    const tenant = await prismaBase.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Empresa não encontrada');
    if (!tenant.deletedAt) throw new BusinessRuleError('TENANT_JA_ATIVO', 'A empresa já está activa');

    await prismaBase.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { deletedAt: null } });
      await tx.configuracaoFiscal.updateMany({
        where: { tenantId },
        data: { statusAtivo: true },
      });
      await registarTrilho(tx, autor, 'DESARQUIVAR', tenant.slug, { depois: { id: tenantId } });
    });
  },
};
