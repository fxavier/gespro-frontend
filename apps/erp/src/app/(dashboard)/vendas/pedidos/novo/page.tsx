/**
 * Nova Encomenda de Venda — Server Component.
 * Formulário interactivo em NovaEncomendaForm (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaEncomendaForm } from '../_components/nova-encomenda-form';

export default async function NovaEncomendaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Encomenda de Venda"
        description="Preencha os campos abaixo para criar uma encomenda"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Encomendas', href: '/vendas/pedidos' },
          { label: 'Nova Encomenda' },
        ]}
      />

      <NovaEncomendaForm />
    </div>
  );
}
