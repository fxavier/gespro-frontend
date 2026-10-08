/**
 * Nova Categoria de Produto (#119) — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { CategoriaProdutoForm } from '../_components/categoria-produto-form';

export default async function NovaCategoriaProdutoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova categoria"
        description="Crie uma categoria para classificar os produtos"
        breadcrumbs={[
          { label: 'Produtos', href: '/produtos' },
          { label: 'Categorias', href: '/produtos/categorias' },
          { label: 'Nova categoria' },
        ]}
      />

      <CategoriaProdutoForm />
    </div>
  );
}
