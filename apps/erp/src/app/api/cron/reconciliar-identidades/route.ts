import { NextResponse } from 'next/server';
import { withCron } from '@/lib/api/with-cron';
import { logger } from '@/server/observability/logger';
import { reconciliarIdentidades } from '@/server/auth/reconciliacao';

/**
 * GET /api/cron/reconciliar-identidades — rede de segurança do provisionamento
 * (ADR-0013 §3). Compara os utilizadores do realm `gespro` com os `User`
 * locais e REPORTA divergências nas duas direcções — nunca repara.
 *
 * Protecção: `Authorization: Bearer <CRON_SECRET>`, verificada pelo `withCron`
 * (dentro do `withApi`, issue #186). Agendamento recomendado: diário, 03:15 UTC
 * (depois do expirar-trials).
 */
export const runtime = 'nodejs';

export const GET = withCron(async () => {
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
});
