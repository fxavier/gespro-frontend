/**
 * Novo Produto — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { catalogoProdutoService } from '@/server/services/inventario/catalogo.service';
import { PageHeader } from '@/components/patterns';
import { NovoProdutoForm } from '../_components/novo-produto-form';

export default async function NovoProdutoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const categoriasResult = await runWithTenantContext({ tenantId, userId }, () =>
    catalogoProdutoService.listarCategorias({ take: 100 }, ctx)
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Produto"
        description="Adicione um novo produto ao catálogo da empresa"
        breadcrumbs={[
          { label: 'Produtos', href: '/produtos' },
          { label: 'Novo Produto' },
        ]}
      />

      <NovoProdutoForm categorias={categoriasResult.items} />
    </div>
  );
}
