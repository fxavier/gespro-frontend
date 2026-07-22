/**
 * Nova Devolução — Server Component.
 * Formulário interactivo em NovaDevolucaoForm (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaDevolucaoForm } from '../_components/nova-devolucao-form';

export default async function NovaDevolucaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Devolução"
        description="Registe uma devolução de produtos"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Devoluções', href: '/vendas/devolucoes' },
          { label: 'Nova Devolução' },
        ]}
      />

      <NovaDevolucaoForm />
    </div>
  );
}
