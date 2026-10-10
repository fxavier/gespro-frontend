import { NextResponse } from 'next/server';
import { withCron } from '@/lib/api/with-cron';
import { logger } from '@/server/observability/logger';
import { expurgarRegistosNaoVerificados } from '@/server/services/plataforma/expurgo.service';

/**
 * GET /api/cron/expirar-registos-nao-verificados — expurgo de tenants fantasma.
 *
 * Elimina tenants criados há mais de 7 dias cujo administrador nunca verificou
 * o e-mail (ADR-0016 Camada 4). Um registo não verificado é inofensivo
 * funcionalmente (sem `primeiroAcessoEm` não há sessão possível) mas ocupa
 * espaço em DB e Keycloak — ao fim de 7 dias é elimináveis.
 *
 * Passa pelo `withApi` (`public: true`, via `withCron`) para ganhar
 * a observabilidade transversal (requestId, logging, métricas RED). Isto
 * corrige um dos seis achados da revisão da spec 19 — as tarefas agendadas
 * existentes executam fora do pipeline e não aparecem no Grafana.
 *
 * Protecção: `Authorization: Bearer <CRON_SECRET>`, verificado pelo `withCron`.
 * O endpoint está em `/api/cron/` que o middleware.ts não intercepta (PUBLIC_PATHS).
 * Agendamento: diário, 03:10 UTC (depois do expirar-trials) — ver infra/local/cron/crontab e o runbook.
 */
export const runtime = 'nodejs';

export const GET = withCron(
  async () => {
    try {
      const resultado = await expurgarRegistosNaoVerificados();
      logger.info({ ...resultado }, '[cron] expirar-registos-nao-verificados concluído');
      return NextResponse.json({ data: resultado });
    } catch (e) {
      logger.error(
        { err: { message: (e as Error)?.message, stack: (e as Error)?.stack } },
        '[cron] expirar-registos-nao-verificados falhou',
      );
      return NextResponse.json(
        { error: { code: 'ERRO_INTERNO', message: 'Erro no processamento do cron.' } },
        { status: 500 },
      );
    }
  },
);
