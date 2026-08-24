import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AppError, ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { runWithRequestContext, newRequestId } from '@/server/observability/context';
import { recordRequest } from '@/server/observability/metrics';
import { recordHttpRequest } from '@/server/observability/prom-registry';
import { normalizeRoute } from './route-utils';

export { normalizeRoute } from './route-utils';

interface ApiCtx {
  tenantId: string;
  userId: string;
  permissions: Set<string>;
  params: Record<string, string | string[]>;
}

type Handler = (req: NextRequest, ctx: ApiCtx) => Promise<Response>;

interface WithApiOptions {
  permission?: string;
  /**
   * Se `true`, ignora autenticação — para endpoints públicos controlados
   * (health, ready). Não usar para dados de negócio.
   */
  public?: boolean;
}

/** Adiciona o header `x-request-id` a qualquer Response sem alterar o body. */
function withRequestIdHeader(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Wrapper para Route Handlers (exportações/webhooks/integrações). Autentica,
 * verifica permissão, corre dentro do contexto de tenant e devolve o envelope
 * `{ error: { code, message, details? } }` em falha.
 *
 * Instrumentação transversal (sem alterar contratos):
 *   - Gera `requestId` (UUIDv4) por pedido; propaga via AsyncLocalStorage.
 *   - Inclui `x-request-id` no header de resposta.
 *   - Loga início/fim/erro com tenantId, userId, método, rota, duração.
 *   - Erros inesperados → log server-side com stack; cliente recebe envelope sem stack.
 *   - Route normalizada: /api/faturacao/[id]/pdf (não o ID concreto) — B2 fix.
 *   - tenantId registado mesmo no caminho de erro (M4 fix).
 */
export function withApi(handler: Handler, opts?: WithApiOptions) {
  return async (
    req: NextRequest,
    segment?: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    const requestId = newRequestId();
    const startTime = Date.now();
    const rawUrl = req.nextUrl?.pathname ?? req.url;
    const method = req.method;

    // tenantId, userId e route içados para fora do try — disponíveis no caminho de erro (M4/B-N1 fix)
    let tenantId = '';
    let userId = '';
    // route começa com rawUrl; é normalizada depois de params resolvidos (B-N1 fix).
    // No catch, se o erro ocorreu ANTES de normalizeRoute, rawUrl é usado (sem params, sem risco de
    // cardinalidade). Se ocorreu DEPOIS, route já tem os placeholders e não o valor concreto.
    let route = rawUrl;

    const addId = (r: Response) => withRequestIdHeader(r, requestId);

    try {
      const params = segment?.params ? await segment.params : {};

      // Rota normalizada: substitui valores concretos de params pelos placeholders (B2/B-N1 fix)
      route = normalizeRoute(rawUrl, params);

      let perms = new Set<string>();

      if (!opts?.public) {
        const session = await auth();
        if (!session?.user) throw new UnauthorizedError();
        const { id: uid, tenantId: tid, permissions } = session.user;
        tenantId = tid;
        userId = uid;
        perms = new Set(permissions);
        if (opts?.permission && !perms.has(opts.permission)) throw new ForbiddenError();
      }

      const log = logger.child({ requestId, method, url: route, tenantId, userId });
      log.info({}, 'request start');

      const response = await runWithRequestContext({ requestId, tenantId, userId }, () => {
        if (opts?.public) {
          // Endpoint público: sem contexto de tenant
          return handler(req, { tenantId, userId, permissions: perms, params });
        }
        return runWithTenantContext({ tenantId, userId }, () =>
          handler(req, { tenantId, userId, permissions: perms, params }),
        );
      });

      const duration = Date.now() - startTime;
      log.info({ status: response.status, duration }, 'request end');
      recordRequest(duration, response.status >= 500);
      recordHttpRequest({ method, route, statusCode: response.status, durationMs: duration, tenantId });

      return addId(response);
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('ERRO_INTERNO', 'Erro interno', 500);
      const duration = Date.now() - startTime;
      // route: içada — já normalizada se o erro ocorreu depois de normalizeRoute (B-N1 fix).
      // Garante que métricas de erro em rotas dinâmicas usam [param] e não o valor concreto.
      const log = logger.child({ requestId, method, url: route, tenantId });

      if (!(e instanceof AppError)) {
        // Erro inesperado: logar no servidor com stack (nunca ao cliente)
        log.error(
          { err: { message: (e as Error)?.message, stack: (e as Error)?.stack }, duration },
          '[with-api] erro inesperado',
        );
      } else {
        log.warn({ code: err.code, status: err.status, duration }, err.message);
      }
      recordRequest(duration, true);
      // tenantId içado: já tem o valor correcto se a sessão foi estabelecida (M4 fix)
      recordHttpRequest({ method, route, statusCode: err.status, durationMs: duration, tenantId });

      return addId(
        NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        ),
      );
    }
  };
}
