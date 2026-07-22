/**
 * Página de abertura de nova Contagem de Stock — Server Component (NUNCA 'use client').
 * Spec 05: formulário de criação de contagem cíclica de existências.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaContagemForm } from './_components/nova-contagem-form';

export default async function NovaContagemPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Contagem de Stock"
        description="Inicie uma contagem cíclica de existências"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Contagens de Stock', href: '/inventario/contagens' },
          { label: 'Nova' },
        ]}
      />

      <NovaContagemForm userId={userId} />
    </div>
  );
}
