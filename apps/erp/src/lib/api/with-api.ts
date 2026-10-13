import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  AcessoLeituraError,
  AppError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { runWithRequestContext, newRequestId } from '@/server/observability/context';
import { recordRequest } from '@/server/observability/metrics';
import { recordHttpRequest } from '@/server/observability/prom-registry';
import { exportLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';
import { normalizeRoute } from './route-utils';

export { normalizeRoute } from './route-utils';

type ParamsBrutos = Record<string, string | string[]>;

interface ApiCtx<Q, P> {
  tenantId: string;
  userId: string;
  permissions: Set<string>;
  /** Parâmetros de rota — já validados/transformados quando há `opts.params` (#188). */
  params: P;
  /** Query validada/transformada por `opts.query` (#188); `undefined` sem schema. */
  query: Q;
}

type Handler<Q, P> = (req: NextRequest, ctx: ApiCtx<Q, P>) => Promise<Response>;

/** Métodos que escrevem. Um `GET` nunca é uma mutação; o resto é, por omissão. */
const METODOS_DE_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface WithApiOptions<Q, P> {
  permission?: string;
  /**
   * Se `true`, ignora autenticação — para endpoints públicos controlados
   * (health, ready). Não usar para dados de negócio.
   */
  public?: boolean;
  /**
   * Deixa esta rota escrever com o tenant em **Leitura** (ADR-0032 §2).
   *
   * Só é preciso em rotas de método de escrita: as exportações e os PDF são
   * `GET`, logo passam sem declarar nada — «as exportações são leituras,
   * portanto não precisam de excepção» (ticket #33). E uma rota `public` não
   * tem sessão, logo não há estado de acesso a verificar: o webhook do Stripe
   * e os crons continuam a poder escrever, que é como o cliente sai da Leitura.
   */
  permiteEmLeitura?: boolean;
  /**
   * Exportação, PDF ou mapa (issue #196): passa pelo `exportLimiter` (ADR-0014,
   * 10 pedidos/minuto) com a chave **utilizador + rota normalizada** — esgotar a
   * exportação da DRE não trava a do balanço. Excedido ⇒ 429 com `Retry-After`,
   * antes de o handler gerar o que quer que seja.
   */
  limitarExportacao?: boolean;
  /**
   * Schema Zod da query string (issue #188). Validado depois da sessão e da
   * permissão; falha ⇒ 422 `VALIDACAO` com `details = flatten()` e o handler
   * não corre. O resultado chega em `ctx.query`.
   */
  query?: z.ZodType<Q, z.ZodTypeDef, unknown>;
  /** Schema Zod dos parâmetros de rota (issue #188); resultado em `ctx.params`. */
  params?: z.ZodType<P, z.ZodTypeDef, unknown>;
}

/** Valida com Zod; falha ⇒ `ValidationError` (422) com `flatten()` em `details`. */
function validar<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  valor: unknown,
  rotulo: string,
): T {
  const r = schema.safeParse(valor);
  if (!r.success) throw new ValidationError(`${rotulo} inválidos`, r.error.flatten());
  return r.data;
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
 * `{ error: { code, message, details? } }` em falha — e, num 5xx, também
 * `traceId` (= `x-request-id`, o `requestId` dos logs; issue #187).
 * `opts.query`/`opts.params` validam a query e os parâmetros com Zod (#188).
 *
 * Instrumentação transversal (sem alterar contratos):
 *   - Gera `requestId` (UUIDv4) por pedido; propaga via AsyncLocalStorage.
 *   - Inclui `x-request-id` no header de resposta.
 *   - Loga início/fim/erro com tenantId, userId, método, rota, duração.
 *   - Erros inesperados → log server-side com stack; cliente recebe envelope sem stack.
 *   - Route normalizada: /api/faturacao/[id]/pdf (não o ID concreto) — B2 fix.
 *   - tenantId registado mesmo no caminho de erro (M4 fix).
 */
export function withApi<Q = undefined, P = ParamsBrutos>(
  handler: Handler<Q, P>,
  opts?: WithApiOptions<Q, P>,
) {
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
        // Import tardio: uma rota `public` (crons, probes, webhooks) nunca carrega o
        // next-auth — nem precisa de sessão, nem o arrasta para fora do runtime Next.
        const { auth } = await import('@/lib/auth');
        const session = await auth();
        if (!session?.user) throw new UnauthorizedError();
        const { id: uid, tenantId: tid, permissions } = session.user;
        tenantId = tid;
        userId = uid;
        perms = new Set(permissions);
        if (opts?.permission && !perms.has(opts.permission)) throw new ForbiddenError();

        // Leitura: vê e exporta tudo, não grava nada (ADR-0027 §6). O
        // `pagamento` (FECHADA comercial, issue #99) é a mesma fechadura.
        if (
          (session.user.acesso === 'leitura' || session.user.acesso === 'pagamento') &&
          !opts?.permiteEmLeitura &&
          METODOS_DE_ESCRITA.has(method)
        ) {
          throw new AcessoLeituraError();
        }
      }

      // Validação (#188) depois da sessão e da permissão: 401/403 mantêm-se.
      const query = (
        opts?.query
          ? validar(
              opts.query,
              Object.fromEntries(new URL(req.url).searchParams),
              'Parâmetros de pesquisa',
            )
          : undefined
      ) as Q;
      const ctxParams = (
        opts?.params ? validar(opts.params, params, 'Parâmetros de rota') : params
      ) as P;
      const ctxBase = { tenantId, userId, permissions: perms, params: ctxParams, query };

      const log = logger.child({ requestId, method, url: route, tenantId, userId });
      log.info({}, 'request start');

      const response = await runWithRequestContext({ requestId, tenantId, userId }, () => {
        if (opts?.public) {
          // Endpoint público: sem contexto de tenant
          return handler(req, ctxBase);
        }
        return runWithTenantContext({ tenantId, userId }, async () => {
          if (opts?.limitarExportacao) {
            const rl = await exportLimiter.consume(`${userId}::export::${route}`);
            if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);
          }
          return handler(req, ctxBase);
        });
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
          {
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
              // #187: o 500 leva o traceId para o utilizador o citar ao suporte.
              ...(err.status >= 500 ? { traceId: requestId } : {}),
            },
          },
          { status: err.status },
        ),
      );
    }
  };
}
