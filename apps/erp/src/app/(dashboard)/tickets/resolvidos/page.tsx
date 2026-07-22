/**
 * Tickets Resolvidos — Server Component.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { TicketsTable } from '../_components/tickets-table';
import { Skeleton } from '@/components/ui/skeleton';

const UrlSchema = z.object({
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

async function ResolvidosTable({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltrosNormalizados;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const [resolvidos, fechados] = await Promise.all([
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets(
        { estado: 'RESOLVIDO', take: filtros.take, orderBy: filtros.orderBy, order: filtros.order },
        ctx
      )
    ),
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets(
        { estado: 'FECHADO', take: filtros.take, orderBy: filtros.orderBy, order: filtros.order },
        ctx
      )
    ),
  ]);

  const items = [...resolvidos.items, ...fechados.items];
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <TicketsTable
      data={items.slice(0, filtros.take)}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'orderBy',
    label: 'Ordenar por',
    placeholder: 'Data de criação',
    options: [
      { label: 'Data de criação', value: 'createdAt' },
      { label: 'Prioridade', value: 'prioridade' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TicketsResolvidosPage({ searchParams }: PageProps) {
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
        title="Tickets Resolvidos"
        description="Tickets com estado Resolvido ou Fechado"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Resolvidos' },
        ]}
      />

      <FilterBar
        searchPlaceholder="Pesquisar…"
        searchKey="pesquisa"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <ResolvidosTable filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
