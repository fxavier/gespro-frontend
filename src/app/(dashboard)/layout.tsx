import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { CommandPalette } from '@/components/layout/CommandPalette';

/**
 * Layout global do dashboard — Server Component.
 * Verifica autenticação com next-auth antes de renderizar.
 * Todos os filhos são Server Components por defeito.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/login');
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar esquerda — filtrada pelas permissões da sessão */}
      <AppSidebar userPermissions={session.user.permissions ?? []} />

      {/* Área de conteúdo principal */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Cabeçalho com breadcrumbs, notificações e menu de utilizador */}
        <AppHeader />

        {/* Conteúdo da página */}
        <main
          className="flex-1 overflow-auto"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      {/* Paleta de comandos global (Cmd+K) */}
      <CommandPalette />
    </div>
  );
}
