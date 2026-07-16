import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AppError, ForbiddenError, UnauthorizedError } from '@/lib/errors';

interface ApiCtx {
  tenantId: string;
  userId: string;
  permissions: Set<string>;
  params: Record<string, string | string[]>;
}

type Handler = (req: NextRequest, ctx: ApiCtx) => Promise<Response>;

/**
 * Wrapper para Route Handlers (exportações/webhooks/integrações). Autentica,
 * verifica permissão, corre dentro do contexto de tenant e devolve o envelope
 * `{ error: { code, message, details? } }` em falha.
 */
export function withApi(handler: Handler, opts?: { permission?: string }) {
  return async (
    req: NextRequest,
    segment?: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    try {
      const session = await auth();
      if (!session?.user) throw new UnauthorizedError();
      const { id: userId, tenantId, permissions } = session.user;
      const perms = new Set(permissions);
      if (opts?.permission && !perms.has(opts.permission)) throw new ForbiddenError();

      const params = segment?.params ? await segment.params : {};
      return await runWithTenantContext({ tenantId, userId }, () =>
        handler(req, { tenantId, userId, permissions: perms, params }),
      );
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('ERRO_INTERNO', 'Erro interno', 500);
      if (!(e instanceof AppError)) console.error('[with-api]', e);
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      );
    }
  };
}
