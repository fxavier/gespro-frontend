import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
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
 * Diferente dos outros crons: passa pelo `withApi` (`public: true`) para ganhar
 * a observabilidade transversal (requestId, logging, métricas RED). Isto
 * corrige um dos seis achados da revisão da spec 19 — as tarefas agendadas
 * existentes executam fora do pipeline e não aparecem no Grafana.
 *
 * Protecção: `Authorization: Bearer <CRON_SECRET>` verificado dentro do handler.
 * O endpoint está em `/api/cron/` que o middleware.ts não intercepta (PUBLIC_PATHS).
 * Agendamento recomendado: diário, 03:30 UTC (depois do reconciliar-identidades).
 */
export const runtime = 'nodejs';

export const GET = withApi(
  async (req: NextRequest) => {
    // Autenticação com CRON_SECRET — mesmo padrão dos outros crons.
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    const esperado = process.env.CRON_SECRET;
    if (!esperado || token !== esperado) {
      return NextResponse.json(
        { error: { code: 'NAO_AUTENTICADO', message: 'Token inválido.' } },
        { status: 401 },
      );
    }

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
  { public: true },
);
