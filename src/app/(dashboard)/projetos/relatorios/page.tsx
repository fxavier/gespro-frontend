/**
 * Relatórios de Projectos — Server Component.
 * Funcionalidade em desenvolvimento.
 */

import { BarChart3 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function RelatoriosProjetosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios"
        description="Análise de desempenho e relatórios de projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Relatórios' },
        ]}
      />
      <EmptyState
        icon={<BarChart3 className="h-8 w-8" />}
        title="Relatórios em breve"
        description="Os relatórios analíticos de desempenho dos projectos estarão disponíveis brevemente."
      />
    </div>
  );
}
