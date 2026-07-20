import 'server-only';
import type { z } from 'zod';
import { revalidatePath, updateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { runWithRequestContext, newRequestId } from '@/server/observability/context';
import { recordRequest } from '@/server/observability/metrics';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export interface ActionCtx {
  tenantId: string;
  userId: string;
  permissions: Set<string>;
}

interface SafeActionOptions<S extends z.ZodType | undefined, T> {
  schema?: S;
  permission?: string;
  revalidate?: { paths?: string[]; tags?: string[] };
  handler: (input: S extends z.ZodType ? z.infer<S> : undefined, ctx: ActionCtx) => Promise<T>;
}

/**
 * Única porta para mutações a partir da UI. Autentica, verifica permissão,
 * valida input com Zod, corre o handler dentro do contexto de tenant e
 * devolve sempre `ActionResult<T>` — nunca lança para o cliente.
 *
 * Instrumentação transversal (sem alterar contratos/assinaturas):
 *   - Gera `requestId` por invocação; propaga via AsyncLocalStorage.
 *   - Loga início/fim com tenantId, userId, duração e permissão.
 *   - Erros AppError conhecidos → log warn; outros → log error (stack server-side).
 *   - Erros inesperados → ActionResult.error.details inclui `traceId` (sem stack ao cliente).
 */
export function createSafeAction<S extends z.ZodType | undefined, T>(
  opts: SafeActionOptions<S, T>,
) {
  type Input = S extends z.ZodType ? z.input<S> : void;
  return async (raw: Input): Promise<ActionResult<T>> => {
    const requestId = newRequestId();
    const startTime = Date.now();

    try {
      const session = await auth();
      if (!session?.user) throw new UnauthorizedError();
      const { id: userId, tenantId, permissions } = session.user;
      const perms = new Set(permissions);

      if (opts.permission && !perms.has(opts.permission)) throw new ForbiddenError();

      let input: unknown = undefined;
      if (opts.schema) {
        const parsed = opts.schema.safeParse(raw);
        if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
        input = parsed.data;
      }

      const log = logger.child({
        requestId,
        tenantId,
        userId,
        action: opts.permission ?? 'action',
      });
      log.info({}, 'action start');

      const data = await runWithRequestContext({ requestId, tenantId, userId }, () =>
        runWithTenantContext({ tenantId, userId }, () =>
          opts.handler(input as never, { tenantId, userId, permissions: perms }),
        ),
      );

      opts.revalidate?.paths?.forEach((p) => revalidatePath(p));
      opts.revalidate?.tags?.forEach((t) => updateTag(t));

      const duration = Date.now() - startTime;
      log.info({ duration }, 'action end');
      recordRequest(duration, false);

      return { ok: true, data };
    } catch (e) {
      const duration = Date.now() - startTime;
      const log = logger.child({ requestId, action: opts.permission ?? 'action' });

      if (e instanceof AppError) {
        // Erro de aplicação conhecido: log ao nível adequado, devolver código estável
        if (e.status >= 500) {
          log.error({ code: e.code, status: e.status, duration }, e.message);
        } else {
          log.warn({ code: e.code, status: e.status, duration }, e.message);
        }
        recordRequest(duration, e.status >= 500);
        return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
      }

      // Erro inesperado: logar no servidor com stack trace; ao cliente só traceId
      recordRequest(duration, true);
      log.error(
        {
          err: { message: (e as Error)?.message, stack: (e as Error)?.stack },
          duration,
        },
        '[safe-action] erro inesperado',
      );
      return {
        ok: false,
        error: {
          code: 'ERRO_INTERNO',
          message: 'Erro interno',
          details: { traceId: requestId },
        },
      };
    }
  };
}
