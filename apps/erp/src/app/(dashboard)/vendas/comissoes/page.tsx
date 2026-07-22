/**
 * Comissões de Vendas — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { DollarSign, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comissaoService } from '@/server/services/comercial/index';
import { FilterComissaoSchema } from '@/lib/validations/vendas';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import { ComissoesTable } from './_components/comissoes-table';

// ─── Schema URL ───────────────────────────────────────────────────────────────

const FiltroComissaoUrlSchema = FilterComissaoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
});

type FiltroComissaoUrl = z.infer<typeof FiltroComissaoUrlSchema>;

const FILTROS_DEFAULT: FiltroComissaoUrl = {
  take: 25,
  orderBy: 'createdAt',
  order: 'desc',
};

// ─── KPIs ─────────────────────────────────────────────────────────────────────

async function ComissoesKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const resultado = await runWithTenantContext({ tenantId, userId }, () =>
    comissaoService.listar({ take: 100, orderBy: 'createdAt', order: 'desc' }, { tenantId, userId })
  );

  const total = resultado.items.length;
  const pendentes = resultado.items.filter((c) => c.status === 'PENDENTE').length;
  const pagas = resultado.items.filter((c) => c.status === 'PAGA').length;
  const valorTotal = resultado.items.reduce((acc, c) => acc + parseFloat(c.valorComissao), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total Comissões" value={String(total)} icon={<DollarSign className="h-5 w-5" />} />
      <KpiCard title="Pendentes" value={String(pendentes)} icon={<Clock className="h-5 w-5" />} />
      <KpiCard title="Pagas" value={String(pagas)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard
        title="Valor Total"
        value={`MT ${valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

async function ComissoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroComissaoUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    comissaoService.listar(
      {
        cursor: filtros.cursor,
        take: filtros.take,
        status: filtros.status,
        vendedorId: filtros.vendedorId,
        dataInicio: filtros.dataInicio,
        dataFim: filtros.dataFim,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      { tenantId, userId }
    )
  );

  return (
    <ComissoesTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Aprovada', value: 'APROVADA' },
      { label: 'Paga', value: 'PAGA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex h-10 px-4 gap-4 border-b bg-muted/30 items-center">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-3 flex-1 max-w-24" />)}
      </div>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="flex h-11 px-4 gap-4 border-b last:border-0 items-center">
          {[1, 2, 3, 4, 5].map((j) => <Skeleton key={j} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ComissoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroComissaoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Comissões"
        description="Consulte as comissões de venda dos vendedores"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Comissões' },
        ]}
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ComissoesKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar comissões…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <ComissoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
