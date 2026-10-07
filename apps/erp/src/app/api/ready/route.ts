/**
 * GET /api/ready — Readiness probe.
 *
 * Verifica se a base de dados está acessível via `SELECT 1`. Retorna 200
 * quando pronto, 503 quando a DB não responde.
 * Público/controlado: sem autenticação; em produção proteger por IP/rede (spec 17).
 * Inclui `x-request-id` via envelope withApi.
 * Em falha, o corpo só diz `not_ready`: o detalhe do erro vai para o logger
 * estruturado, na linha do `requestId` (issue #190) — nunca para o cliente.
 */
import { NextResponse } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { prismaBase } from '@/server/db/client';
import { logger } from '@/server/observability/logger';

export const GET = withApi(
  async (_req, _ctx) => {
    try {
      await prismaBase.$queryRaw`SELECT 1`;
      return NextResponse.json(
        { status: 'ready', db: 'ok', timestamp: new Date().toISOString() },
        { status: 200 },
      );
    } catch (e) {
      logger.error(
        { err: { message: (e as Error)?.message, stack: (e as Error)?.stack } },
        '[ready] base de dados inacessível',
      );
      return NextResponse.json(
        {
          status: 'not_ready',
          db: 'error',
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
  },
  { public: true },
);
