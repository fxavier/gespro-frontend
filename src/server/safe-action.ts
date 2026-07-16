import 'server-only';
import type { z } from 'zod';
import { revalidatePath, updateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from '@/lib/errors';

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
 */
export function createSafeAction<S extends z.ZodType | undefined, T>(
  opts: SafeActionOptions<S, T>,
) {
  type Input = S extends z.ZodType ? z.input<S> : void;
  return async (raw: Input): Promise<ActionResult<T>> => {
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

      const data = await runWithTenantContext({ tenantId, userId }, () =>
        opts.handler(input as never, { tenantId, userId, permissions: perms }),
      );

      opts.revalidate?.paths?.forEach((p) => revalidatePath(p));
      opts.revalidate?.tags?.forEach((t) => updateTag(t));

      return { ok: true, data };
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('ERRO_INTERNO', 'Erro interno', 500);
      if (!(e instanceof AppError)) console.error('[safe-action]', e);
      return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
    }
  };
}
