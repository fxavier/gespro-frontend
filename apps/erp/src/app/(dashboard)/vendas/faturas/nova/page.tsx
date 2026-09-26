/**
 * Nova Fatura — Server Component.
 * Pré-carrega os clientes para o formulário CC (sem Dialog). A série não se
 * escolhe (#93): é a activa de FATURA no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { NovaFaturaForm } from './_components/nova-fatura-form';

export default async function NovaFaturaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const paginaClientes = await runWithTenantContext(ctx, () =>
    // Só a primeira página: a partir daí a combobox pesquisa no servidor
    // (`procurarClientes`) — o molde de /servicos/agendamentos/novo.
    clienteService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx)
  );

  const clientes = paginaClientes.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Fatura"
        description="Emitir nova fatura fiscal"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Faturas', href: '/vendas/faturas' },
          { label: 'Nova Fatura' },
        ]}
      />
      <NovaFaturaForm clientes={clientes} />
    </div>
  );
}
