/**
 * Riscos de Projectos — Server Component.
 * Funcionalidade em desenvolvimento.
 */

import { ShieldAlert } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function RiscosProjetosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Riscos"
        description="Identificação e monitorização de riscos nos projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Riscos' },
        ]}
      />
      <EmptyState
        icon={<ShieldAlert className="h-8 w-8" />}
        title="Gestão de riscos em breve"
        description="O registo e monitorização de riscos de projecto estará disponível brevemente."
      />
    </div>
  );
}
