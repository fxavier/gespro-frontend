import { NextResponse } from 'next/server';

/**
 * GET /api/health — liveness probe (spec 14 / spec 16).
 * Responde 200 se o processo está a correr. Não verifica a DB (isso é readiness).
 * Público, sem autenticação — usado pelo HEALTHCHECK do Docker e pelo App Runner.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      version: process.env.APP_VERSION ?? 'dev',
      ts: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
