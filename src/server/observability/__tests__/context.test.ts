/**
 * Testes do contexto de request (AsyncLocalStorage).
 */
import { describe, expect, it } from 'vitest';
import { runWithRequestContext, getRequestContext, newRequestId } from '../context';

describe('request context', () => {
  it('getRequestContext() retorna undefined fora de um contexto', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('runWithRequestContext propaga requestId via ALS', async () => {
    const requestId = newRequestId();
    const result = await runWithRequestContext({ requestId }, () => {
      const ctx = getRequestContext();
      return ctx?.requestId;
    });
    expect(result).toBe(requestId);
  });

  it('contexto não vaza para fora do run', async () => {
    const requestId = newRequestId();
    await runWithRequestContext({ requestId }, () => Promise.resolve());
    expect(getRequestContext()).toBeUndefined();
  });

  it('contextos aninhados são isolados', async () => {
    const outer = newRequestId();
    const inner = newRequestId();
    expect(outer).not.toBe(inner);

    await runWithRequestContext({ requestId: outer }, async () => {
      const outerCtx = getRequestContext();
      expect(outerCtx?.requestId).toBe(outer);

      await runWithRequestContext({ requestId: inner }, () => {
        const innerCtx = getRequestContext();
        expect(innerCtx?.requestId).toBe(inner);
        return Promise.resolve();
      });

      // após o inner, volta ao outer
      const outerCtxAfter = getRequestContext();
      expect(outerCtxAfter?.requestId).toBe(outer);
    });
  });

  it('newRequestId gera UUIDs únicos', () => {
    const ids = Array.from({ length: 50 }, () => newRequestId());
    const unique = new Set(ids);
    expect(unique.size).toBe(50);
    // UUIDv4 format
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it('runWithRequestContext inclui tenantId e userId opcionais', async () => {
    const ctx = { requestId: newRequestId(), tenantId: 'tenant-abc', userId: 'user-xyz' };
    const result = await runWithRequestContext(ctx, () => getRequestContext());
    expect(result?.tenantId).toBe('tenant-abc');
    expect(result?.userId).toBe('user-xyz');
  });
});
