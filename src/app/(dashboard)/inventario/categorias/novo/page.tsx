/**
 * Nova Categoria de Ativo — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaCategoriaForm } from '../_components/nova-categoria-form';

export default async function NovaCategoriaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Categoria"
        description="Crie uma nova categoria para classificar os ativos"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Categorias', href: '/inventario/categorias' },
          { label: 'Nova Categoria' },
        ]}
      />

      <NovaCategoriaForm />
    </div>
  );
}
