/**
 * Editar Produto — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterProduto, listarCategorias } from '@/server/services/inventario/catalogo.service';
import { PageHeader } from '@/components/patterns';
import { EditarProdutoForm } from './_components/editar-produto-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarProdutoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let produto;
  let categoriasPage;
  try {
    [produto, categoriasPage] = await runWithTenantContext(ctx, () =>
      Promise.all([
        obterProduto(id, ctx),
        listarCategorias({ take: 100 }, ctx),
      ])
    );
  } catch {
    notFound();
  }

  if (!produto) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Produto"
        description={produto.nome}
        breadcrumbs={[
          { label: 'Produtos', href: '/produtos' },
          { label: produto.sku, href: `/produtos/${id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarProdutoForm
        id={id}
        categorias={categoriasPage.items}
        defaultValues={{
          nome: produto.nome,
          descricao: produto.descricao,
          categoriaId: produto.categoriaId,
          marca: produto.marca,
          unidadeMedida: produto.unidadeMedida,
          precoVenda: produto.precoVenda,
          precoCompra: produto.precoCompra,
          taxaIva: produto.taxaIva,
          stockMinimo: produto.stockMinimo,
          stockMaximo: produto.stockMaximo,
          ativo: produto.ativo,
        }}
      />
    </div>
  );
}
