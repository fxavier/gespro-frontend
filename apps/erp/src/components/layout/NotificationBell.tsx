'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  count: number;
}

/**
 * Sino de notificações — Client Component folha.
 * Recebe o contador de não-lidas do Server Component pai.
 * Navega para /notificacoes ao clicar (sem modal — regra UI).
 */
export function NotificationBell({ count }: NotificationBellProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 relative"
      aria-label={count > 0 ? `${count} notificações por ler` : 'Notificações'}
      asChild
    >
      <Link href="/notificacoes">
        <Bell className="h-4 w-4" aria-hidden="true" />
        {count > 0 && (
          <span
            className={cn(
              'absolute right-1 top-1 min-w-[16px] h-4 rounded-full',
              'bg-destructive text-destructive-foreground',
              'text-[10px] font-bold leading-none',
              'flex items-center justify-center px-1',
              'ring-2 ring-background',
            )}
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
        {count === 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-muted ring-2 ring-background" aria-hidden="true" />
        )}
      </Link>
    </Button>
  );
}
