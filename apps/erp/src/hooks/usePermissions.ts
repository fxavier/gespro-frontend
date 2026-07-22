'use client';

import { useSession } from 'next-auth/react';
import { useMemo } from 'react';

/**
 * Hook cliente que expõe permissões do utilizador autenticado
 * directamente da sessão JWT (sem round-trip ao servidor).
 *
 * Uso:
 *   const { can, permissions, isLoading } = usePermissions()
 *   if (can('faturacao:criar')) { ... }
 */
export function usePermissions() {
  const { data: session, status } = useSession();

  const permissions = useMemo<Set<string>>(
    () => new Set(session?.user?.permissions ?? []),
    [session],
  );

  function can(permission: string): boolean {
    return permissions.has(permission);
  }

  function canAny(...perms: string[]): boolean {
    return perms.some((p) => permissions.has(p));
  }

  function canAll(...perms: string[]): boolean {
    return perms.every((p) => permissions.has(p));
  }

  return {
    permissions,
    can,
    canAny,
    canAll,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}
