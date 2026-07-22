/**
 * Listagem de Entregas — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Package, Truck, CheckCircle, AlertTriangle } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { entregaService } from '@/server/services/operacoes/entrega.service';
import { FiltrarEntregasSchema } from '@/lib/validations/transporte';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { EntregasTable } from './_components/entregas-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

const FiltroEntregaUrlSchema = FiltrarEntregasSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroEntregaUrl = z.infer<typeof FiltroEntregaUrlSchema>;

const FILTROS_DEFAULT: FiltroEntregaUrl = {
  take: 25,
  orderBy: 'dataAgendada',
  order: 'desc',
};

async function EntregasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    entregaService.listarEntregas({ take: 200, orderBy: 'dataAgendada', order: 'desc' }, ctx)
  );
  const items = result.items;
  const total = items.length;
  const emTransito = items.filter((e) => e.estado === 'EM_TRANSITO').length;
  const entregues = items.filter((e) => e.estado === 'ENTREGUE').length;
  const falhadas = items.filter((e) => e.estado === 'FALHADA').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total de Entregas" value={String(total)} icon={<Package className="h-5 w-5" />} />
      <KpiCard title="Em Trânsito" value={String(emTransito)} icon={<Truck className="h-5 w-5" />} />
      <KpiCard title="Entregues" value={String(entregues)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard title="Falhadas" value={String(falhadas)} icon={<AlertTriangle className="h-5 w-5" />} />
    </div>
  );
}

async function EntregasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroEntregaUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    entregaService.listarEntregas(
      {
        estado: filtros.estado,
        prioridade: filtros.prioridade,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );

  return (
    <EntregasTable
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
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Agendada', value: 'AGENDADA' },
      { label: 'Em Trânsito', value: 'EM_TRANSITO' },
      { label: 'Entregue', value: 'ENTREGUE' },
      { label: 'Falhada', value: 'FALHADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
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
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EntregasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroEntregaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Entregas"
        description="Gestão de entregas e logística de distribuição"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Entregas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/transporte/entregas/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Entrega
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <EntregasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por número ou cliente…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <EntregasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
