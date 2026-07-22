/**
 * Tickets Urgentes — Server Component.
 * Filtra por prioridade URGENTE e SLA em atraso ou ALTA prioridade.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { TicketsTable } from '../_components/tickets-table';
import { Skeleton } from '@/components/ui/skeleton';

function TableSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

async function TicketsUrgentesTable({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    ticketService.listarTickets(
      {
        prioridade: 'URGENTE',
        take: 50,
        orderBy: 'slaDataLimiteResolucao',
        order: 'asc',
      },
      ctx
    )
  );
  return (
    <TicketsTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy="slaDataLimiteResolucao"
      currentOrderDir="asc"
    />
  );
}

export default async function TicketsUrgentesPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Tickets Urgentes"
        description="Tickets com prioridade urgente ordenados por SLA"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Urgentes' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/tickets/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Ticket
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton />}>
        <TicketsUrgentesTable tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
