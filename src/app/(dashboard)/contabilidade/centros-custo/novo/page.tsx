/**
 * Novo Centro de Custo — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoCentroCustoForm } from './_components/novo-centro-custo-form';

export default async function NovoCentroCustoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Novo Centro de Custo"
        description="Criar uma nova dimensão analítica para controlo de custos"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Centros de Custo', href: '/contabilidade/centros-custo' },
          { label: 'Novo' },
        ]}
      />

      <NovoCentroCustoForm />
    </div>
  );
}
