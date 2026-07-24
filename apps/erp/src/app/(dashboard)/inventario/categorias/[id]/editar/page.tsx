/**
 * Editar Categoria de Ativo — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { PageHeader } from '@/components/patterns';
import { EditarCategoriaForm } from '../../_components/editar-categoria-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarCategoriaPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let categoria;
  try {
    categoria = await runWithTenantContext({ tenantId, userId }, () =>
      ativosService.obterCategoria(id, ctx)
    );
  } catch {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Categoria"
        description={`Actualize os dados da categoria ${categoria.codigo}`}
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Categorias', href: '/inventario/categorias' },
          { label: categoria.nome },
        ]}
      />

      <EditarCategoriaForm categoria={categoria} />
    </div>
  );
}
