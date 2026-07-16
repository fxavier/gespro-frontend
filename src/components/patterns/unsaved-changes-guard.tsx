'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface UnsavedChangesGuardProps {
  isDirty: boolean;
  message?: string;
}

/**
 * Bloqueia a navegação quando o formulário tem alterações não guardadas.
 *
 * Funciona em dois cenários:
 * 1. Fechar/recarregar a aba (beforeunload)
 * 2. Navegação no browser (Next.js navigation) — aviso simples via confirm()
 *
 * Nota: O bloqueio de navegação Next.js é limitado em App Router.
 * A abordagem recomendada é envolver o submit para desactivar o guard antes de navegar.
 */
export function UnsavedChangesGuard({
  isDirty,
  message = 'Tem alterações não guardadas. Tem a certeza que pretende sair?',
}: UnsavedChangesGuardProps) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, message]);

  return null;
}
