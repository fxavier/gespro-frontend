/**
 * Listagem de Abastecimentos — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Fuel, Droplets, DollarSign, TrendingDown } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { abastecimentoService } from '@/server/services/operacoes/abastecimento.service';
import { FiltrarAbastecimentosSchema } from '@/lib/validations/transporte';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { CombustivelTable } from './_components/combustivel-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

const FiltroCombustivelUrlSchema = FiltrarAbastecimentosSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroCombustivelUrl = z.infer<typeof FiltroCombustivelUrlSchema>;

const FILTROS_DEFAULT: FiltroCombustivelUrl = {
  take: 25,
  orderBy: 'data',
  order: 'desc',
};

async function CombustivelKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    abastecimentoService.listarAbastecimentos(
      { take: 200, orderBy: 'data', order: 'desc' },
      ctx
    )
  );
  const items = result.items;
  const total = items.length;
  const totalLitros = items.reduce((sum, a) => sum + parseFloat(a.litros), 0);
  const totalValor = items.reduce((sum, a) => sum + parseFloat(a.valorTotal), 0);
  const mediaConsumo = items
    .filter((a) => a.consumoMedio !== null)
    .reduce((sum, a) => sum + parseFloat(a.consumoMedio!), 0) /
    (items.filter((a) => a.consumoMedio !== null).length || 1);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Abastecimentos"
        value={String(total)}
        icon={<Fuel className="h-5 w-5" />}
      />
      <KpiCard
        title="Litros Consumidos"
        value={`${totalLitros.toLocaleString('pt-MZ', { maximumFractionDigits: 0 })} L`}
        icon={<Droplets className="h-5 w-5" />}
      />
      <KpiCard
        title="Custo Total"
        value={`MZN ${totalValor.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
        icon={<DollarSign className="h-5 w-5" />}
      />
      <KpiCard
        title="Consumo Médio"
        value={`${mediaConsumo.toFixed(1)} km/L`}
        icon={<TrendingDown className="h-5 w-5" />}
      />
    </div>
  );
}

async function CombustivelTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroCombustivelUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    abastecimentoService.listarAbastecimentos(
      {
        tipoCombustivel: filtros.tipoCombustivel,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );

  return (
    <CombustivelTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipoCombustivel',
    label: 'Combustível',
    placeholder: 'Todos',
    options: [
      { label: 'Gasolina', value: 'GASOLINA' },
      { label: 'Gasóleo', value: 'GASOLEO' },
      { label: 'GPL', value: 'GPL' },
      { label: 'Eléctrico', value: 'ELECTRICO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CombustivelPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroCombustivelUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Combustível"
        description="Registo e controlo de abastecimentos de combustível"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Combustível' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/transporte/combustivel/novo">
              <Plus className="h-4 w-4 mr-2" />
              Registar Abastecimento
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <CombustivelKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por viatura ou posto…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <CombustivelTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
