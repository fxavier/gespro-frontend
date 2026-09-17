import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { COOKIE_BARRA_LATERAL, VALOR_RECOLHIDA } from '@/lib/barra-lateral';
import { AppHeader } from '@/components/layout/AppHeader';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { FaixaLeitura } from '@/components/layout/FaixaLeitura';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { notificacaoService } from '@/server/services/plataforma/notificacao.service';
import { assinaturaService } from '@/server/services/plataforma/assinatura.service';

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
  // Estado da barra lateral, escrito pelo próprio componente ao recolher/expandir.
  const barraRecolhida =
    (await cookies()).get(COOKIE_BARRA_LATERAL)?.value === VALOR_RECOLHIDA;

  // Dias que faltam para o acesso fechar. Só se lê a assinatura quando a sessão
  // já diz que o tenant está em Leitura — nos outros 99,9% dos pedidos não há
  // consulta nenhuma, e o estado de acesso vem do JWT (ADR-0011).
  let diasDeLeitura = 0;
  if (session.user.acesso === 'leitura') {
    const assinatura = await runWithTenantContext({ tenantId, userId }, () =>
      assinaturaService.obterOuNulo({ tenantId, userId }),
    );
    diasDeLeitura = assinatura?.diasRestantesLeitura ?? 0;
  }

  const notificationSlot = (
    <Suspense fallback={<NotificationBell count={0} />}>
      <NotificationBellServer tenantId={tenantId} userId={userId} />
    </Suspense>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar esquerda — filtrada pelas permissões da sessão */}
      <AppSidebar
        userPermissions={session.user.permissions ?? []}
        defaultCollapsed={barraRecolhida}
      />

      {/* Área de conteúdo principal */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Cabeçalho com breadcrumbs, notificações e menu de utilizador */}
        <AppHeader notificationSlot={notificationSlot} />

        {/* Modo de leitura: em todas as páginas, porque o bloqueio é em todas */}
        {session.user.acesso === 'leitura' && <FaixaLeitura diasRestantes={diasDeLeitura} />}

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
