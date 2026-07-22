/**
 * Editar Fornecedor — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { PageHeader } from '@/components/patterns';
import { EditarFornecedorForm } from './_components/editar-fornecedor-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarFornecedorPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let fornecedor;
  try {
    fornecedor = await runWithTenantContext({ tenantId, userId }, () =>
      fornecedorService.obter(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!fornecedor) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar: ${fornecedor.nome}`}
        description="Actualize os dados do fornecedor"
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: fornecedor.nome, href: `/fornecedores/${fornecedor.id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarFornecedorForm fornecedor={fornecedor} />
    </div>
  );
}
