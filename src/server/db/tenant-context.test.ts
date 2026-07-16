import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { getTenantContext, requireTenantContext, runWithTenantContext } from './tenant-extension';

describe('tenant context', () => {
  it('requireTenantContext lança (500) fora de um contexto', () => {
    expect(() => requireTenantContext()).toThrow(AppError);
    try {
      requireTenantContext();
    } catch (e) {
      expect((e as AppError).status).toBe(500);
      expect((e as AppError).code).toBe('SEM_CONTEXTO_TENANT');
    }
  });

  it('runWithTenantContext isola o contexto', () => {
    expect(getTenantContext()).toBeUndefined();
    const out = runWithTenantContext({ tenantId: 't1', userId: 'u1' }, () => {
      const ctx = requireTenantContext();
      return ctx.tenantId;
    });
    expect(out).toBe('t1');
    // não há fuga para fora do run
    expect(getTenantContext()).toBeUndefined();
  });
});
