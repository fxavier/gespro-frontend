import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from './with-api';

/**
 * Wrapper único das rotas `/api/cron/*` (issue #186).
 *
 * Passa pelo `withApi` (`public: true`) — `x-request-id`, logger estruturado
 * correlacionado e métricas RED — e verifica o contrato de autenticação do
 * agendador (docs/runbooks/agendador.md): `Authorization: Bearer <CRON_SECRET>`.
 * Sem segredo configurado, sem header ou com token errado ⇒ 401
 * `NAO_AUTENTICADO` e o handler não corre.
 */
export function withCron(handler: (req: NextRequest) => Promise<Response>) {
  return withApi(
    async (req: NextRequest) => {
      const token = req.headers.get('authorization')?.replace('Bearer ', '');
      const esperado = process.env.CRON_SECRET;
      if (!esperado || token !== esperado) {
        return NextResponse.json(
          { error: { code: 'NAO_AUTENTICADO', message: 'Token inválido.' } },
          { status: 401 },
        );
      }
      return handler(req);
    },
    { public: true },
  );
}
