import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/server/observability/logger';
import { processarCicloDeVida } from '@/server/services/plataforma/assinatura.service';

/**
 * GET /api/cron/expirar-trials — ciclo de vida das subscrições (ADR-0032).
 *
 * Faz as três pernas numa só corrida: fim do Trial → Leitura, aviso a sete dias
 * do fecho, e fim da Leitura → Fechada. Nada se apaga em nenhuma delas.
 *
 * Para o Trial, o motor primário continua a ser o Stripe (`trial_period_days` +
 * webhooks) e isto é o belt-and-suspenders da falha de entrega: sem ele, um
 * tenant cujo `customer.subscription.updated` se perdeu ficava em trial para
 * sempre. Para o fecho da Leitura **não há motor primário nenhum** — o prazo é
 * nosso e o Stripe não sabe dele. Aqui isto não é rede de segurança, é o
 * mecanismo.
 *
 * Idempotente: quem decide é o compare-and-set dentro das transições, não o
 * `findMany`. Correr duas vezes tem o mesmo efeito que correr uma.
 *
 * Protecção: `Authorization: Bearer <CRON_SECRET>` (mesmo padrão do cron de
 * transporte). NÃO está em `PUBLIC_PATHS` — é chamado com credencial própria.
 * Agendamento: diário, 03:00 UTC — ver `infra/local/cron/` e o runbook.
 *
 * O nome da rota mantém-se por ser contrato com o agendador: mudá-lo obrigaria
 * a mexer no agendador de cada ambiente para não ganhar nada.
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
    const resultado = await processarCicloDeVida();

    logger.info({ ...resultado }, '[cron] ciclo de vida das subscrições concluído');

    return NextResponse.json({
      data: { ...resultado, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    logger.error(
      { err: { message: (e as Error)?.message, stack: (e as Error)?.stack } },
      '[cron] ciclo de vida das subscrições falhou',
    );
    return NextResponse.json(
      { error: { code: 'ERRO_INTERNO', message: 'Erro no processamento do cron.' } },
      { status: 500 },
    );
  }
}
