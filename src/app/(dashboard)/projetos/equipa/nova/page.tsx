/**
 * Nova Equipa — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaEquipaForm } from './_components/nova-equipa-form';

export default async function NovaEquipaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="space-y-6">
      <div className="p-6 pb-0">
        <PageHeader
          title="Nova Equipa"
          description="Criar uma equipa para organizar membros de projectos"
          breadcrumbs={[
            { label: 'Projectos', href: '/projetos/lista' },
            { label: 'Equipas', href: '/projetos/equipa' },
            { label: 'Nova' },
          ]}
        />
      </div>

      <NovaEquipaForm />
    </div>
  );
}
