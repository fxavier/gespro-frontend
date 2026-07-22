import 'server-only';
import { prismaBase } from '@/server/db/client';
import { NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import type { FilterAuditLogInput } from '@/lib/validations/plataforma';
import type { IAuditService, AuditLogRow, AuditFiltrosDisponiveis } from './audit.interface';

// ---------------------------------------------------------------------------
// Mapeamento
// ---------------------------------------------------------------------------

type PrismaLog = {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  createdAt: Date;
};

async function enrichWithUserNome(
  logs: PrismaLog[],
): Promise<AuditLogRow[]> {
  const userIds = [...new Set(logs.filter((l) => l.userId).map((l) => l.userId!))];

  const users =
    userIds.length > 0
      ? await prismaBase.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nome: true },
        })
      : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.nome]));

  return logs.map((l) => ({
    id: l.id,
    tenantId: l.tenantId,
    userId: l.userId,
    userNome: l.userId ? (userMap[l.userId] ?? null) : null,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    data: l.data as Record<string, unknown> | null,
    createdAt: l.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export const auditService: IAuditService = {
  async listar(filter: FilterAuditLogInput, ctx: Ctx) {
    const { entity, entityId, action, userId, dateFrom, dateTo, cursor, take = 25 } = filter;

    const where = {
      tenantId: ctx.tenantId,
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
      ...((dateFrom || dateTo)
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    return paginate(
      async ({ take: t, cursor: c, skip }) => {
        const logs = await prismaBase.auditLog.findMany({
          take: t,
          ...(c ? { cursor: c, skip } : {}),
          where,
          orderBy: { createdAt: 'desc' },
        });
        return enrichWithUserNome(logs as unknown as PrismaLog[]);
      },
      { cursor, take },
    );
  },

  async obter(auditLogId: string, ctx: Ctx): Promise<AuditLogRow> {
    const log = await prismaBase.auditLog.findFirst({
      where: { id: auditLogId, tenantId: ctx.tenantId },
    });
    if (!log) throw new NotFoundError('Registo de auditoria não encontrado');
    const [enriched] = await enrichWithUserNome([log as unknown as PrismaLog]);
    return enriched;
  },

  async filtrosDisponiveis(ctx: Ctx): Promise<AuditFiltrosDisponiveis> {
    // Duas queries agregadas paralelas para popular os dropdowns
    const [entities, actions] = await Promise.all([
      prismaBase.auditLog.findMany({
        where: { tenantId: ctx.tenantId },
        select: { entity: true },
        distinct: ['entity'],
        orderBy: { entity: 'asc' },
      }),
      prismaBase.auditLog.findMany({
        where: { tenantId: ctx.tenantId },
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      }),
    ]);

    return {
      entidades: entities.map((e) => e.entity),
      accoes: actions.map((a) => a.action),
    };
  },
};
