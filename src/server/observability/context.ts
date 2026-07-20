import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Contexto de correlação por pedido — complementa o TenantContext do
 * tenant-extension (também em AsyncLocalStorage). O requestId é gerado
 * nos envelopes (withApi / createSafeAction) e propagado via este ALS;
 * NÃO vem do cliente, NÃO passa pelo middleware (spec 17).
 */
export interface RequestContext {
  readonly requestId: string;
  readonly tenantId?: string;
  readonly userId?: string;
}

const requestStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Corre `fn` com o contexto de request activo. Compõe com runWithTenantContext
 * — o requestId é tipicamente o wrapper externo.
 */
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return requestStorage.run(ctx, async () => fn());
}

export function getRequestContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

/** Gera um novo requestId (UUIDv4). */
export function newRequestId(): string {
  return randomUUID();
}
