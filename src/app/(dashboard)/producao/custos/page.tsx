/**
 * Custos de Produção — Server Component (NUNCA 'use client').
 * Lista ordens de produção com análise de custos.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import {
  PageHeader,
  FilterBar,
  StatusBadge,
  DataTable,
  TableSkeleton,
  KpiCard,
} from '@/components/patterns';
import type { FilterConfig, TableColumn } from '@/components/patterns';

const FiltroUrlSchema = z.object({
  status: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface CustoOrdemRow {
  id: string;
  numero: string;
  nomeProduto: string;
  quantidade: number;
  unidadeMedida: string;
  custoEstimado: string;
  status: string;
  dataPrevisaoFim: Date;
}

const columns: TableColumn<CustoOrdemRow>[] = [
  {
    key: 'numero',
    label: 'Nº Ordem',
    render: (row) => <span className="tabular-nums font-mono text-xs">{row.numero}</span>,
  },
  {
    key: 'nomeProduto',
    label: 'Produto',
    render: (row) => <span className="font-medium">{row.nomeProduto}</span>,
  },
  {
    key: 'quantidade',
    label: 'Qtd.',
    render: (row) => (
      <span className="tabular-nums">{row.quantidade} {row.unidadeMedida}</span>
    ),
    mobileHidden: true,
  },
  {
    key: 'custoEstimado',
    label: 'Custo Estimado',
    render: (row) => <span className="tabular-nums font-medium">MT {row.custoEstimado}</span>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'dataPrevisaoFim',
    label: 'Prazo',
    render: (row) => (
      <span className="tabular-nums text-sm">
        {new Date(row.dataPrevisaoFim).toLocaleDateString('pt-PT')}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'accoes',
    label: '',
    render: (row) => (
      <Link
        href={`/producao/ordens/${row.id}`}
        className="text-xs text-primary hover:underline"
      >
        Ver detalhes
      </Link>
    ),
  },
];

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

  return <DataTable data={data} columns={columns} nextCursor={nextCursor} />;
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
