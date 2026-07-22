/**
 * Lista de Tickets — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard: filtros em searchParams, DataTable paginada, KPIs.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Ticket, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { FiltrarTicketsSchema } from '@/lib/validations/tickets';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { TicketsTable } from '../_components/tickets-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

// ─── Schema URL ───────────────────────────────────────────────────────────────

const FiltroTicketUrlSchema = FiltrarTicketsSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  // slaEmAtraso via URL: 'true'/'false'
  slaEmAtraso: z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
    z.boolean().optional()
  ),
});

type FiltroTicketUrl = z.infer<typeof FiltroTicketUrlSchema>;

const FILTROS_DEFAULT: FiltroTicketUrl = {
  take: 25,
  orderBy: 'createdAt',
  order: 'desc',
};

// ─── Skeletons inline ─────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

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

// ─── KPIs ─────────────────────────────────────────────────────────────────────

async function TicketsKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [todos, emAtraso, resolvidos] = await Promise.all([
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets({ take: 1, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets(
        { take: 1, slaEmAtraso: true, orderBy: 'createdAt', order: 'desc' },
        ctx
      )
    ),
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets(
        { take: 1, estado: 'RESOLVIDO', orderBy: 'createdAt', order: 'desc' },
        ctx
      )
    ),
  ]);

  // ponytail: counts estimated via cursor pagination — nextCursor absent = exact count
  const totalAbertos = todos.items.filter(
    (t) => t.estado !== 'FECHADO' && t.estado !== 'CANCELADO' && t.estado !== 'RESOLVIDO'
  ).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Tickets"
        value={String(todos.items.length)}
        icon={<Ticket className="h-5 w-5" />}
      />
      <KpiCard
        title="Em Progresso"
        value={String(totalAbertos)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="SLA em Atraso"
        value={String(emAtraso.items.filter((t) => t.slaEmAtraso).length)}
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      <KpiCard
        title="Resolvidos"
        value={String(resolvidos.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
    </div>
  );
}

// ─── Tabela ───────────────────────────────────────────────────────────────────

async function TicketsTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroTicketUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    ticketService.listarTickets(
      {
        estado: filtros.estado,
        tipo: filtros.tipo,
        prioridade: filtros.prioridade,
        slaEmAtraso: filtros.slaEmAtraso,
        cursor: filtros.cursor,
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

// ─── Configuração FilterBar ───────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'estado',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Aberto', value: 'ABERTO' },
      { label: 'Em Progresso', value: 'EM_PROGRESSO' },
      { label: 'A Aguardar Cliente', value: 'AGUARDANDO_CLIENTE' },
      { label: 'A Aguardar Terceiro', value: 'AGUARDANDO_TERCEIRO' },
      { label: 'Resolvido', value: 'RESOLVIDO' },
      { label: 'Fechado', value: 'FECHADO' },
      { label: 'Cancelado', value: 'CANCELADO' },
    ],
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    placeholder: 'Todas',
    options: [
      { label: 'Baixa', value: 'BAIXA' },
      { label: 'Normal', value: 'NORMAL' },
      { label: 'Alta', value: 'ALTA' },
      { label: 'Urgente', value: 'URGENTE' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Incidente', value: 'INCIDENTE' },
      { label: 'Requisição', value: 'REQUISICAO' },
      { label: 'Problema', value: 'PROBLEMA' },
      { label: 'Mudança', value: 'MUDANCA' },
      { label: 'Consulta', value: 'CONSULTA' },
    ],
  },
];

// ─── Página principal — Server Component ──────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ListaTicketsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroTicketUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Tickets de Suporte"
        description="Gestão de tickets de suporte e pedidos de serviço"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Lista' },
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

      <Suspense fallback={<KpiSkeleton />}>
        <TicketsKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por número ou título…"
        searchKey="pesquisa"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton />}
      >
        <TicketsTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
