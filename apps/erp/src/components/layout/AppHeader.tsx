'use client';

import { useSession, signOut } from 'next-auth/react';
import { Search, Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Breadcrumbs } from './Breadcrumbs';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface AppHeaderProps {
  onCommandPaletteOpen?: () => void;
  /** Slot para o sino de notificações — Server Component pai injeta o contador real. */
  notificationSlot?: ReactNode;
}

function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function ThemeToggleMenu() {
  const { setTheme, theme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alterar tema" className="h-8 w-8">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Cabeçalho global do dashboard.
 * Inclui breadcrumbs, botão Cmd+K, sino de notificações e menu de utilizador.
 * O sino de notificações é injectado como slot pelo Server Component pai (layout.tsx)
 * para que o contador de não-lidas seja renderizado no servidor.
 */
export function AppHeader({ onCommandPaletteOpen, notificationSlot }: AppHeaderProps) {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Breadcrumbs — ocupam o espaço disponível */}
      <div className="flex-1 min-w-0">
        <Breadcrumbs />
      </div>

      {/* Acções do lado direito */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Botão Cmd+K */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'hidden md:flex items-center gap-2 h-8 px-3 text-muted-foreground',
            'hover:text-foreground transition-colors'
          )}
          onClick={onCommandPaletteOpen}
          aria-label="Abrir paleta de comandos"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Pesquisar</span>
          <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium sm:flex">
            <span>⌘</span>K
          </kbd>
        </Button>

        {/* Sino de notificações — slot injectado pelo Server Component pai */}
        {notificationSlot}

        {/* Alternar tema */}
        <ThemeToggleMenu />

        {/* Menu de utilizador */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 gap-2 px-2"
              aria-label="Menu do utilizador"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm font-medium max-w-[120px] truncate">
                {user?.name ?? 'Utilizador'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{user?.name ?? 'Utilizador'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/configuracoes">Configurações</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void signOut({ callbackUrl: '/auth/login' })}
            >
              Terminar sessão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
