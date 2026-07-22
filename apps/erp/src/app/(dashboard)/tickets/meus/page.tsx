/**
 * Os Meus Tickets — Server Component.
 * Filtra por atribuidoParaId = userId da sessão.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { TicketsTable } from '../_components/tickets-table';
import { Skeleton } from '@/components/ui/skeleton';

const UrlSchema = z.object({
  estado: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  orderBy: z.enum(['createdAt', 'prioridade', 'slaDataLimiteResolucao']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

type FiltrosNormalizados = z.infer<typeof UrlSchema>;

const FILTROS_DEFAULT: FiltrosNormalizados = { take: 25, orderBy: 'createdAt', order: 'desc' };

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

async function MeusTicketsTable({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltrosNormalizados;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    ticketService.listarTickets(
      {
        atribuidoParaId: userId,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );
  return (
    <TicketsTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'estado',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Aberto', value: 'ABERTO' },
      { label: 'Em Progresso', value: 'EM_PROGRESSO' },
      { label: 'A Aguardar Cliente', value: 'AGUARDANDO_CLIENTE' },
      { label: 'Resolvido', value: 'RESOLVIDO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MeusTicketsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = UrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Os Meus Tickets"
        description="Tickets atribuídos a mim"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Os Meus' },
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

      <FilterBar
        searchPlaceholder="Pesquisar…"
        searchKey="pesquisa"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <MeusTicketsTable filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
