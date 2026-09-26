/**
 * Nova Nota de Débito — Server Component.
 * Pré-carrega os clientes para o formulário (sem Dialog). A série não se
 * escolhe (#93): é a activa de NOTA_DEBITO no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { NovaNotaDebitoForm } from './_components/nova-nota-debito-form';

export default async function NovaNotaDebitoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const paginaClientes = await runWithTenantContext(ctx, () =>
    clienteService.listar({ status: 'ATIVO', take: 200, orderBy: 'nome', order: 'asc' }, ctx)
  );

  const clientes = paginaClientes.items.map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Nota de Débito"
        description="Registar valores adicionais a cobrar ao cliente"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Notas de Débito', href: '/vendas/notas-debito' },
          { label: 'Nova Nota de Débito' },
        ]}
      />
      <NovaNotaDebitoForm clientes={clientes} />
    </div>
  );
}
