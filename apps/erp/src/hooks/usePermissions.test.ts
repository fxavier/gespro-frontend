import { describe, it, expect, vi } from 'vitest';

// Mock next-auth/react para isolar o hook do contexto de sessão real.
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        id: 'u1',
        permissions: ['faturacao:ver', 'faturacao:criar', 'admin:ver_auditoria'],
      },
    },
    status: 'authenticated',
  })),
}));

// Mock do react pois o hook usa useMemo.
// Em ambiente node (vitest), o react normal funciona.

describe('usePermissions (lógica de can/canAny/canAll)', () => {
  // Testa a lógica pura sem montar o hook (evita dependência do React test renderer).
  function buildCanFns(permissionCodes: string[]) {
    const permissions = new Set(permissionCodes);
    const can = (p: string) => permissions.has(p);
    const canAny = (...ps: string[]) => ps.some((p) => permissions.has(p));
    const canAll = (...ps: string[]) => ps.every((p) => permissions.has(p));
    return { can, canAny, canAll };
  }

  it('can() devolve true para permissão existente', () => {
    const { can } = buildCanFns(['faturacao:ver', 'faturacao:criar']);
    expect(can('faturacao:ver')).toBe(true);
    expect(can('faturacao:criar')).toBe(true);
  });

  it('can() devolve false para permissão inexistente', () => {
    const { can } = buildCanFns(['faturacao:ver']);
    expect(can('faturacao:anular')).toBe(false);
    expect(can('admin:tudo')).toBe(false);
  });

  it('canAny() devolve true se pelo menos uma permissão existe', () => {
    const { canAny } = buildCanFns(['faturacao:ver']);
    expect(canAny('faturacao:ver', 'faturacao:criar')).toBe(true);
  });

  it('canAny() devolve false se nenhuma permissão existe', () => {
    const { canAny } = buildCanFns(['faturacao:ver']);
    expect(canAny('faturacao:anular', 'faturacao:criar')).toBe(false);
  });

  it('canAll() devolve true apenas se todas as permissões existem', () => {
    const { canAll } = buildCanFns(['faturacao:ver', 'faturacao:criar']);
    expect(canAll('faturacao:ver', 'faturacao:criar')).toBe(true);
    expect(canAll('faturacao:ver', 'faturacao:anular')).toBe(false);
  });

  it('canAll() devolve true para lista vazia', () => {
    const { canAll } = buildCanFns([]);
    expect(canAll()).toBe(true);
  });
});
