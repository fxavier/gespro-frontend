import 'server-only';
import type { z } from 'zod';
import { revalidatePath, updateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  AcessoLeituraError,
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { runWithRequestContext, newRequestId } from '@/server/observability/context';
import { recordRequest } from '@/server/observability/metrics';
import { serializarDecimais, type Serializado } from '@/server/serializar';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export interface ActionCtx {
  tenantId: string;
  userId: string;
  permissions: Set<string>;
}

/**
 * Contexto de uma action de PLATAFORMA (#525): quem a chama e mais nada. Sem
 * `tenantId` de propósito — o administrador geral do sistema não actua dentro
 * de um tenant, e um `tenantId` aqui seria um convite a usá-lo.
 */
export interface PlataformaActionCtx {
  userId: string;
}

interface SafeActionOptions<S extends z.ZodType | undefined, T> {
  plataforma?: false;
  schema?: S;
  permission?: string;
  revalidate?: { paths?: string[]; tags?: string[] };
  /**
   * Deixa esta action correr com o tenant em **Leitura** (ADR-0032 §2).
   *
   * Por omissão nenhuma corre: em Leitura o tenant vê e exporta tudo, e não
   * grava nada. Declara-se aqui, ao lado da permissão, e não numa lista
   * central que alguém se esquece de actualizar (ticket #33).
   *
   * Quem a declara é de dois tipos, e só dois:
   *   - **leituras** — `listar*`, `obter*`, `procurar*`: as comboboxes
   *     remotas, os KPIs e os selectores. Sem isto, o ecrã em Leitura fica
   *     inútil e o cliente não consegue sequer ver o que é seu.
   *   - **as três de subscrição** — iniciar pagamento, abrir o portal e
   *     cancelar. São escritas, e passam de propósito: um estado de onde o
   *     cliente não pudesse sair seria uma armadilha, não uma cobrança.
   *
   * Não a ponha numa escrita de negócio para «desbloquear» um ecrã. O modo de
   * falha certo é o cliente dizer que não consegue ver alguma coisa; o modo de
   * falha errado é uma escrita que passa em silêncio.
   */
  permiteEmLeitura?: boolean;
  handler: (input: S extends z.ZodType ? z.infer<S> : undefined, ctx: ActionCtx) => Promise<T>;
}

/**
 * Action do administrador geral do sistema (ADR-0011 §5, #525). Só corre com o
 * papel `plataforma-admin` na sessão; NÃO estabelece contexto de tenant (nem
 * quando quem a chama também tem tenant); recusa um `tenantId` vindo do
 * cliente; e não é travada pelo modo de Leitura/pagamento de nenhum tenant —
 * não actua sobre o tenant de quem a chama. Sem o papel: `NAO_ENCONTRADO`,
 * como a guarda das páginas, para não revelar que a área existe.
 */
interface SafeActionPlataformaOptions<S extends z.ZodType | undefined, T> {
  plataforma: true;
  schema?: S;
  revalidate?: { paths?: string[]; tags?: string[] };
  handler: (
    input: S extends z.ZodType ? z.infer<S> : undefined,
    ctx: PlataformaActionCtx,
  ) => Promise<T>;
}

type SafeAction<S extends z.ZodType | undefined, T> = (
  raw: S extends z.ZodType ? z.input<S> : void,
) => Promise<ActionResult<Serializado<T>>>;

/**
 * Única porta para mutações a partir da UI. Autentica, verifica permissão,
 * valida input com Zod, corre o handler dentro do contexto de tenant e
 * devolve sempre `ActionResult<T>` — nunca lança para o cliente.
 *
 * O resultado passa por `serializarDecimais`: o retorno de uma action
 * atravessa a fronteira para um Client Component, e um `Prisma.Decimal` aí
 * rebenta a serialização — depois de a mutação já ter commitado.
 *
 * Instrumentação transversal (sem alterar contratos/assinaturas):
 *   - Gera `requestId` por invocação; propaga via AsyncLocalStorage.
 *   - Loga início/fim com tenantId, userId, duração e permissão.
 *   - Erros AppError conhecidos → log warn; outros → log error (stack server-side).
 *   - Erros inesperados → ActionResult.error.details inclui `traceId` (sem stack ao cliente).
 */
export function createSafeAction<S extends z.ZodType | undefined, T>(
  opts: SafeActionPlataformaOptions<S, T>,
): SafeAction<S, T>;
export function createSafeAction<S extends z.ZodType | undefined, T>(
  opts: SafeActionOptions<S, T>,
): SafeAction<S, T>;
export function createSafeAction<S extends z.ZodType | undefined, T>(
  opts: SafeActionOptions<S, T> | SafeActionPlataformaOptions<S, T>,
): SafeAction<S, T> {
  if (opts.plataforma === true) return criarAccaoPlataforma(opts);
  type Input = S extends z.ZodType ? z.input<S> : void;
  return async (raw: Input): Promise<ActionResult<Serializado<T>>> => {
    const requestId = newRequestId();
    const startTime = Date.now();

    try {
      const session = await auth();
      if (!session?.user) throw new UnauthorizedError();
      const { id: userId, tenantId, permissions } = session.user;
      const perms = new Set(permissions);

      // #525: a sessão do administrador de plataforma sem tenant não corre
      // actions de tenant — o papel não abre dados de tenant. Antes da
      // permissão, para valer também nas actions que não declaram nenhuma.
      if (!tenantId) throw new ForbiddenError();

      if (opts.permission && !perms.has(opts.permission)) throw new ForbiddenError();

      // Leitura: a sessão abre, a escrita não passa (ADR-0027 §6, ADR-0032 §2).
      // Depois da permissão de propósito — quem não tem permissão nenhuma
      // continua a receber 403, e não uma explicação sobre a subscrição.
      // `pagamento` (FECHADA comercial, issue #99) é a mesma fechadura.
      const soLeitura = session.user.acesso === 'leitura' || session.user.acesso === 'pagamento';
      if (soLeitura && !opts.permiteEmLeitura) {
        throw new AcessoLeituraError();
      }

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
          opts.handler(input as never, {
            tenantId,
            userId,
            permissions: perms,
          }),
        ),
      );

      opts.revalidate?.paths?.forEach((p) => revalidatePath(p));
      opts.revalidate?.tags?.forEach((t) => updateTag(t));

      const duration = Date.now() - startTime;
      log.info({ duration }, 'action end');
      recordRequest(duration, false);

      return { ok: true, data: serializarDecimais(data) };
    } catch (e) {
      return resultadoDeErro(e, requestId, startTime, opts.permission ?? 'action');
    }
  };
}

function criarAccaoPlataforma<S extends z.ZodType | undefined, T>(
  opts: SafeActionPlataformaOptions<S, T>,
): SafeAction<S, T> {
  return async (raw) => {
    const requestId = newRequestId();
    const startTime = Date.now();

    try {
      const session = await auth();
      if (!session?.user) throw new UnauthorizedError();
      // #549: o papel só vale na sessão SEM tenant (ADR-0049 §5).
      if (session.user.plataformaAdmin !== true || session.user.tenantId) throw new NotFoundError();
      const userId = session.user.id;

      // O `tenantId` nunca vem do cliente — e aqui nem do contexto: uma action
      // de plataforma não actua dentro de um tenant. Recusa-se em vez de se
      // ignorar, para que quem o mande saiba que não teve efeito.
      if (raw && typeof raw === 'object' && 'tenantId' in raw) {
        throw new ValidationError('Dados inválidos', {
          tenantId: ['Não aceite numa acção de plataforma'],
        });
      }

      let input: unknown = undefined;
      if (opts.schema) {
        const parsed = opts.schema.safeParse(raw);
        if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
        input = parsed.data;
      }

      const log = logger.child({
        requestId,
        userId,
        plataforma: true,
        action: 'plataforma',
      });
      log.info({}, 'action start');

      // Sem `runWithTenantContext`, de propósito (#525).
      const data = await runWithRequestContext({ requestId, userId }, () =>
        opts.handler(input as never, { userId }),
      );

      opts.revalidate?.paths?.forEach((p) => revalidatePath(p));
      opts.revalidate?.tags?.forEach((t) => updateTag(t));

      const duration = Date.now() - startTime;
      log.info({ duration }, 'action end');
      recordRequest(duration, false);

      return { ok: true, data: serializarDecimais(data) };
    } catch (e) {
      return resultadoDeErro(e, requestId, startTime, 'plataforma');
    }
  };
}

function resultadoDeErro(
  e: unknown,
  requestId: string,
  startTime: number,
  action: string,
): { ok: false; error: { code: string; message: string; details?: unknown } } {
  const duration = Date.now() - startTime;
  const log = logger.child({ requestId, action });

  if (e instanceof AppError) {
    // Erro de aplicação conhecido: log ao nível adequado, devolver código estável
    if (e.status >= 500) {
      log.error({ code: e.code, status: e.status, duration }, e.message);
    } else {
      log.warn({ code: e.code, status: e.status, duration }, e.message);
    }
    recordRequest(duration, e.status >= 500);
    return {
      ok: false,
      error: { code: e.code, message: e.message, details: e.details },
    };
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
