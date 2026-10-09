/**
 * Desactivar Cliente — Server Component (#136). O motivo é um campo de texto, logo
 * formulário em rota própria (regra «sem modais»).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { DesactivarClienteForm } from '../../_components/desactivar-cliente-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DesactivarClientePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

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
  if (cliente.status !== 'ATIVO' && cliente.status !== 'SUSPENSO') redirect(`/clientes/${id}`);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Desactivar Cliente"
        description={`A desactivar ${cliente.nome}`}
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: cliente.nome, href: `/clientes/${id}` },
          { label: 'Desactivar' },
        ]}
      />
      <DesactivarClienteForm id={id} />
    </div>
  );
}
