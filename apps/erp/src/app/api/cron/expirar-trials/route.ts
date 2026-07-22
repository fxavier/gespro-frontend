import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/server/observability/logger';
import {
  expirarTrialsVencidos,
} from '@/server/services/plataforma/assinatura.service';
import { purgarTokensExpirados } from '@/server/services/plataforma/handoff.service';

/**
 * GET /api/cron/expirar-trials — fallback do ciclo de vida do trial (spec 19).
 *
 * O motor primário é o Stripe (`trial_period_days` + webhooks). Este cron é o
 * belt-and-suspenders para a falha de entrega de webhook: sem ele, um tenant
 * cujo `customer.subscription.updated` se perdeu ficaria em trial para sempre.
 *
 * Idempotente: só transita `TRIAL → EXPIRADO` para `trialFim < now()`; correr
 * duas vezes não faz nada na segunda.
 *
 * Protecção: `Authorization: Bearer <CRON_SECRET>` (mesmo padrão do cron de
 * transporte). NÃO está em `PUBLIC_PATHS` — é chamado com credencial própria.
 * Agendamento recomendado: diário, 03:00 UTC.
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
    const resultado = await expirarTrialsVencidos();
    const tokensPurgados = await purgarTokensExpirados();

    logger.info(
      { ...resultado, tokensPurgados },
      '[cron] expirar-trials-fallback concluído',
    );

    return NextResponse.json({
      data: { ...resultado, tokensPurgados, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    logger.error(
      { err: { message: (e as Error)?.message, stack: (e as Error)?.stack } },
      '[cron] expirar-trials-fallback falhou',
    );
    return NextResponse.json(
      { error: { code: 'ERRO_INTERNO', message: 'Erro no processamento do cron.' } },
      { status: 500 },
    );
  }
}
