/**
 * Custos de Produção — Server Component (NUNCA 'use client').
 * Lista ordens de produção com análise de custos.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import {
  PageHeader,
  FilterBar,
  TableSkeleton,
  KpiCard,
} from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { CustosTable } from './_components/custos-table';
import type { CustoOrdemRow } from './_components/custos-table';

const FiltroUrlSchema = z.object({
  status: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function CustosKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [totalOrdens, custosAgregados] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.ordemProducao.count({ where: { tenantId, status: { notIn: ['CANCELADA'] } } }),
      prisma.ordemProducao.aggregate({
        where: { tenantId, status: { notIn: ['CANCELADA'] } },
        _sum: { custoEstimado: true },
      }),
    ])
  );

  const custoTotal = Number(custosAgregados._sum.custoEstimado ?? 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <KpiCard
        title="Total Ordens Activas"
        value={String(totalOrdens)}
      />
      <KpiCard
        title="Custo Total Estimado"
        value={`MT ${custoTotal.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`}
      />
    </div>
  );
}

async function CustosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const rows = await runWithTenantContext(ctx, () =>
    prisma.ordemProducao.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
      },
      select: {
        id: true,
        numero: true,
        nomeProduto: true,
        quantidade: true,
        unidadeMedida: true,
        custoEstimado: true,
        status: true,
        dataPrevisaoFim: true,
      },
      orderBy: { dataPrevisaoFim: 'asc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: CustoOrdemRow[] = rows.map((o) => ({
    id: o.id,
    numero: o.numero,
    nomeProduto: o.nomeProduto,
    quantidade: Number(o.quantidade),
    unidadeMedida: o.unidadeMedida,
    custoEstimado: Number(o.custoEstimado).toLocaleString('pt-PT', { minimumFractionDigits: 2 }),
    status: o.status,
    dataPrevisaoFim: o.dataPrevisaoFim,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <CustosTable data={data} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Planeada', value: 'PLANEADA' },
      { label: 'Em Produção', value: 'EM_PRODUCAO' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

export default async function CustosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === 'string') flatParams[k] = v;
    else if (Array.isArray(v)) flatParams[k] = v[0] ?? '';
  }

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Custos de Produção"
        description="Análise de custos estimados por ordem de produção"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Custos' },
        ]}
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>}>
        <CustosKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <CustosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
