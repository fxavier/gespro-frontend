/**
 * Caixa de Entrada — Server Component.
 * Tickets não atribuídos ou ABERTOS pendentes de ação.
 * Usa @panel (parallel route) para inspecção rápida sem abandonar a lista.
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
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

async function CaixaEntradaTable({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  // Caixa de entrada: tickets abertos sem atribuição
  const result = await runWithTenantContext(ctx, () =>
    ticketService.listarTickets(
      {
        estado: 'ABERTO',
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

export default async function CaixaEntradaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Caixa de Entrada"
        description="Tickets abertos pendentes de atribuição e resposta"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Caixa de Entrada' },
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
        <CaixaEntradaTable tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
