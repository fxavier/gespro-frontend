import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';

/**
 * Query validada pelo `withApi` (issue #188): um `take` que não seja inteiro
 * positivo é 422 antes de tocar na base; acima de 100 mantém o tecto de 100.
 */
const AuditQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  take: z.coerce
    .number()
    .int()
    .positive()
    .default(20)
    .transform((n) => Math.min(n, 100)),
  entity: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});

/**
 * GET /api/audit?cursor=<id>&take=<n>&entity=<entidade>
 *
 * Trilho de auditoria paginado. Requer permissão `admin:ver_auditoria`.
 * Reservado a Route Handler (leitura administrativa) — não há Server Action
 * equivalente porque este endpoint pode ser consumido por ferramentas externas.
 */
export const GET = withApi(
  async (_req, ctx) => {
    const { cursor, take, entity, userId } = ctx.query;

    const page = await paginate(
      (args) =>
        prismaBase.auditLog.findMany({
          ...args,
          where: {
            tenantId: ctx.tenantId,
            ...(entity ? { entity } : {}),
            ...(userId ? { userId } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            entity: true,
            entityId: true,
            action: true,
            data: true,
            ip: true,
            createdAt: true,
            userId: true,
            user: { select: { id: true, nome: true, email: true } },
          },
        }),
      { cursor, take },
    );

    return NextResponse.json({ data: page });
  },
  { permission: 'admin:ver_auditoria', query: AuditQuerySchema },
);
