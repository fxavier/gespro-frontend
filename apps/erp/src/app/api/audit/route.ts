import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';

/**
 * GET /api/audit?cursor=<id>&take=<n>&entity=<entidade>
 *
 * Trilho de auditoria paginado. Requer permissão `admin:ver_auditoria`.
 * Reservado a Route Handler (leitura administrativa) — não há Server Action
 * equivalente porque este endpoint pode ser consumido por ferramentas externas.
 */
export const GET = withApi(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const take = Math.min(Number(url.searchParams.get('take') ?? '20'), 100);
    const entity = url.searchParams.get('entity') ?? undefined;
    const userId = url.searchParams.get('userId') ?? undefined;

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
  { permission: 'admin:ver_auditoria' },
);
