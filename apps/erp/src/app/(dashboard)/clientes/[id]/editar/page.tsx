/**
 * Editar Cliente — Server Component.
 */

import { notFound } from 'next/navigation';
import { exigirSessaoDeTenant } from '@/server/auth/sessao-tenant';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { EditarClienteForm } from '../../_components/editar-cliente-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;

  const { session } = await exigirSessaoDeTenant();

  const { tenantId, id: userId } = session.user;

  let cliente;
  try {
    cliente = await runWithTenantContext({ tenantId, userId }, () =>
      clienteService.buscarPorId(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!cliente) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Cliente"
        description={`A editar ${cliente.nome}`}
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: cliente.nome, href: `/clientes/${id}` },
          { label: 'Editar' },
        ]}
      />
      <EditarClienteForm cliente={cliente} />
    </div>
  );
}
