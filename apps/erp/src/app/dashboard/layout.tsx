import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { COOKIE_BARRA_LATERAL, VALOR_RECOLHIDA } from '@/lib/barra-lateral';
import { AppHeader } from '@/components/layout/AppHeader';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { FaixaLeitura } from '@/components/layout/FaixaLeitura';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { assinaturaService } from '@/server/services/plataforma/assinatura.service';

/**
 * Layout do dashboard inicial — Server Component.
 * Usa os mesmos componentes modernos que (dashboard)/layout.tsx.
 * Substituiu o antigo layout com cores hardcoded (#1877F2).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const barraRecolhida =
    (await cookies()).get(COOKIE_BARRA_LATERAL)?.value === VALOR_RECOLHIDA;

  // Ver `(dashboard)/layout.tsx`: só se consulta a assinatura quando a sessão
  // já diz que o tenant está em Leitura.
  let diasDeLeitura = 0;
  if (session.user.acesso === 'leitura') {
    const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
    const assinatura = await runWithTenantContext(ctx, () =>
      assinaturaService.obterOuNulo(ctx),
    );
    diasDeLeitura = assinatura?.diasRestantesLeitura ?? 0;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar
        userPermissions={session.user.permissions ?? []}
        defaultCollapsed={barraRecolhida}
      />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <AppHeader />
        {session.user.acesso === 'leitura' && <FaixaLeitura diasRestantes={diasDeLeitura} />}
        <main className="flex-1 overflow-auto" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
