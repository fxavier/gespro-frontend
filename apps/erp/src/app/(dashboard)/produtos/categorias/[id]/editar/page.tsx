/**
 * Editar Categoria de Produto (#119) — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { catalogoProdutoService } from '@/server/services/inventario/catalogo.service';
import { PageHeader } from '@/components/patterns';
import { NotFoundError } from '@/lib/errors';
import { CategoriaProdutoForm } from '../../_components/categoria-produto-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarCategoriaProdutoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let categoria;
  try {
    categoria = await runWithTenantContext({ tenantId, userId }, () =>
      catalogoProdutoService.obterCategoria(id, ctx)
    );
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar categoria"
        description={`Actualize os dados da categoria ${categoria.nome}`}
        breadcrumbs={[
          { label: 'Produtos', href: '/produtos' },
          { label: 'Categorias', href: '/produtos/categorias' },
          { label: categoria.nome },
        ]}
      />

      <CategoriaProdutoForm
        categoria={{
          id: categoria.id,
          nome: categoria.nome,
          descricao: categoria.descricao,
          cor: categoria.cor,
          ativo: categoria.ativo,
        }}
      />
    </div>
  );
}
