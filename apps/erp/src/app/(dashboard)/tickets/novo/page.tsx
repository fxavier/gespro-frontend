/**
 * Novo Ticket — Server Component (NUNCA 'use client').
 * Carrega categorias no servidor e passa ao formulário cliente.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { categoriaTicketService } from '@/server/services/operacoes/ticket.service';
import { PageHeader } from '@/components/patterns';
import { NovoTicketForm } from './_components/novo-ticket-form';

export default async function NovoTicketPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const categorias = await runWithTenantContext(ctx, () =>
    categoriaTicketService.listarCategorias(ctx, true)
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Ticket"
        description="Preencha os campos abaixo para criar um novo pedido de suporte"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Lista', href: '/tickets/lista' },
          { label: 'Novo Ticket' },
        ]}
      />

      <NovoTicketForm categorias={categorias} />
    </div>
  );
}
