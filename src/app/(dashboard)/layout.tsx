import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { notificacaoService } from '@/server/services/plataforma/notificacao.service';

/**
 * Componente servidor para o sino de notificações.
 * Renderiza o badge com o contador real de não-lidas.
 * Envolto em Suspense para não bloquear o layout em caso de lentidão da DB.
 */
async function NotificationBellServer({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  const count = await runWithTenantContext({ tenantId, userId }, () =>
    notificacaoService.naoLidasCount({ tenantId, userId }),
  );
  return <NotificationBell count={count} />;
}

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

  const { tenantId, id: userId } = session.user;

  const notificationSlot = (
    <Suspense fallback={<NotificationBell count={0} />}>
      <NotificationBellServer tenantId={tenantId} userId={userId} />
    </Suspense>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar esquerda — filtrada pelas permissões da sessão */}
      <AppSidebar userPermissions={session.user.permissions ?? []} />

      {/* Área de conteúdo principal */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Cabeçalho com breadcrumbs, notificações e menu de utilizador */}
        <AppHeader notificationSlot={notificationSlot} />

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
