/**
 * Listagem de Rotas — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Route, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { rotaService } from '@/server/services/operacoes/rota.service';
import { FiltrarRotasSchema } from '@/lib/validations/transporte';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { RotasTable } from './_components/rotas-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

const FiltroRotaUrlSchema = FiltrarRotasSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroRotaUrl = z.infer<typeof FiltroRotaUrlSchema>;

const FILTROS_DEFAULT: FiltroRotaUrl = {
  take: 25,
  orderBy: 'dataInicio',
  order: 'desc',
};

async function RotasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    rotaService.listarRotas({ take: 200, orderBy: 'dataInicio', order: 'desc' }, ctx)
  );
  const items = result.items;
  const total = items.length;
  const ativas = items.filter((r) => r.estado === 'ATIVA').length;
  const concluidas = items.filter((r) => r.estado === 'CONCLUIDA').length;
  const canceladas = items.filter((r) => r.estado === 'CANCELADA').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total de Rotas" value={String(total)} icon={<Route className="h-5 w-5" />} />
      <KpiCard title="Ativas" value={String(ativas)} icon={<MapPin className="h-5 w-5" />} />
      <KpiCard title="Concluídas" value={String(concluidas)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard title="Canceladas" value={String(canceladas)} icon={<XCircle className="h-5 w-5" />} />
    </div>
  );
}

async function RotasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroRotaUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    rotaService.listarRotas(
      {
        estado: filtros.estado,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );

  return (
    <RotasTable
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
      { label: 'Planeada', value: 'PLANEADA' },
      { label: 'Ativa', value: 'ATIVA' },
      { label: 'Pausada', value: 'PAUSADA' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RotasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroRotaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Rotas"
        description="Gestão de rotas de transporte e logística"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Rotas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/transporte/rotas/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Rota
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <RotasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por nome ou código…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={6} />}
      >
        <RotasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
