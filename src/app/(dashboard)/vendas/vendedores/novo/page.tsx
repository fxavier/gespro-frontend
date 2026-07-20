/**
 * Novo Vendedor — Server Component.
 * Formulário interactivo em NovoVendedorForm (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoVendedorForm } from '../_components/novo-vendedor-form';

export default async function NovoVendedorPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Vendedor"
        description="Registe um novo vendedor"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Vendedores', href: '/vendas/vendedores' },
          { label: 'Novo Vendedor' },
        ]}
      />

      <NovoVendedorForm />
    </div>
  );
}
