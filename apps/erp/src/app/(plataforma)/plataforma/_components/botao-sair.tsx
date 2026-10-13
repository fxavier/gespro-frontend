'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Terminar sessão na área de plataforma. Como no cabeçalho do tenant: o
 * `signOut` limpa o cookie e o `events.signOut` revoga o token de renovação.
 */
export function BotaoSair() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void signOut({ callbackUrl: '/auth/login' })}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      Sair
    </Button>
  );
}
