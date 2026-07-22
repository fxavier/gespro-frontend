/**
 * Editar Ticket — Server Component.
 * Carrega o ticket e delega a edição ao EditarTicketForm (Client Component).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { PageHeader } from '@/components/patterns';
import { StatusBadge } from '@/components/patterns';
import { EditarTicketForm } from '../../_components/editar-ticket-form';
import type { TicketDetalhe } from '@/server/services/operacoes/ticket.interface';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarTicketPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ctx = { tenantId, userId };

  let ticket: TicketDetalhe;
  try {
    ticket = await runWithTenantContext(ctx, () => ticketService.obterTicket(id, ctx));
  } catch {
    notFound();
  }

  if (ticket.estado === 'FECHADO' || ticket.estado === 'CANCELADO') {
    redirect(`/tickets/${id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${ticket.numero}`}
        description={ticket.titulo}
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Lista', href: '/tickets/lista' },
          { label: ticket.numero, href: `/tickets/${ticket.id}` },
          { label: 'Editar' },
        ]}
        badge={<StatusBadge status={ticket.estado} />}
      />

      <EditarTicketForm ticket={ticket} />
    </div>
  );
}
