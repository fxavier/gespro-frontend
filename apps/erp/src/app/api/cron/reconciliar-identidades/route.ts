import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/server/observability/logger';
import { reconciliarIdentidades } from '@/server/auth/reconciliacao';

/**
 * GET /api/cron/reconciliar-identidades — rede de segurança do provisionamento
 * (ADR-0013 §3). Compara os utilizadores do realm `gespro` com os `User`
 * locais e REPORTA divergências nas duas direcções — nunca repara.
 *
 * Protecção: `Authorization: Bearer <CRON_SECRET>` (mesmo padrão dos outros
 * crons). Agendamento recomendado: diário, 03:15 UTC (depois do
 * expirar-trials).
 */
export const runtime = 'nodejs';

function autorizado(request: NextRequest): boolean {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  return token === esperado;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!autorizado(request)) {
    return NextResponse.json(
      { error: { code: 'NAO_AUTENTICADO', message: 'Token inválido.' } },
      { status: 401 },
    );
  }

  try {
    const relatorio = await reconciliarIdentidades();
    return NextResponse.json({ data: { ...relatorio, timestamp: new Date().toISOString() } });
  } catch (e) {
    logger.error(
      { err: { message: (e as Error)?.message } },
      '[cron] reconciliar-identidades falhou',
    );
    return NextResponse.json(
      { error: { code: 'ERRO_INTERNO', message: 'Erro na reconciliação.' } },
      { status: 500 },
    );
  }
}
