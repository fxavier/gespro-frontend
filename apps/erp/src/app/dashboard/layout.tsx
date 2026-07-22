import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { CommandPalette } from '@/components/layout/CommandPalette';

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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar userPermissions={session.user.permissions ?? []} />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-auto" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
