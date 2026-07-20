/**
 * GET /api/health — Liveness probe.
 *
 * Responde 200 se o processo está de pé. Não verifica a DB (isso é /api/ready).
 * Público/controlado: sem autenticação; em produção proteger por IP/rede (spec 17).
 * Inclui `x-request-id` via envelope withApi.
 */
import { NextResponse } from 'next/server';
import { withApi } from '@/lib/api/with-api';

export const GET = withApi(
  async (_req, _ctx) => {
    return NextResponse.json(
      { status: 'ok', timestamp: new Date().toISOString() },
      { status: 200 },
    );
  },
  { public: true },
);
