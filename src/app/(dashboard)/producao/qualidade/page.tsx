/**
 * Qualidade — Server Component (NUNCA 'use client').
 * Vista de qualidade baseada nas ordens de produção concluídas.
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

interface QualidadeRow {
  id: string;
  numero: string;
  nomeProduto: string;
  quantidade: number;
  progresso: number;
  qualidadeAprovada: boolean;
  status: string;
  dataFimReal: Date | null;
}

const columns: TableColumn<QualidadeRow>[] = [
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
    label: 'Qtd. Prevista',
    render: (row) => <span className="tabular-nums">{row.quantidade}</span>,
    mobileHidden: true,
  },
  {
    key: 'progresso',
    label: 'Progresso',
    render: (row) => <span className="tabular-nums font-medium">{row.progresso}%</span>,
  },
  {
    key: 'qualidadeAprovada',
    label: 'Qualidade',
    render: (row) => <StatusBadge status={row.qualidadeAprovada ? 'APROVADA' : 'PENDENTE'} />,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'dataFimReal',
    label: 'Conclusão',
    render: (row) =>
      row.dataFimReal
        ? <span className="tabular-nums text-sm">{new Date(row.dataFimReal).toLocaleDateString('pt-PT')}</span>
        : <span className="text-muted-foreground">—</span>,
    mobileHidden: true,
  },
];

async function QualidadeKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [concluidas, emProducao, totalOrdens] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.ordemProducao.count({ where: { tenantId, status: 'CONCLUIDA' } }),
      prisma.ordemProducao.count({ where: { tenantId, status: 'EM_PRODUCAO' } }),
      prisma.ordemProducao.count({ where: { tenantId, status: { notIn: ['CANCELADA'] } } }),
    ])
  );

  const taxaConclusao = totalOrdens > 0 ? Math.round((concluidas / totalOrdens) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard title="Concluídas" value={String(concluidas)} />
      <KpiCard title="Em Produção" value={String(emProducao)} />
      <KpiCard title="Taxa de Conclusão" value={`${taxaConclusao}%`} />
    </div>
  );
}

async function QualidadeTableSection({
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
        ...(filtros.status ? { status: filtros.status as never } : { status: { in: ['CONCLUIDA', 'EM_PRODUCAO', 'PAUSADA'] } }),
      },
      select: {
        id: true,
        numero: true,
        nomeProduto: true,
        quantidade: true,
        progresso: true,
        qualidadeAprovada: true,
        status: true,
        dataFimReal: true,
      },
      orderBy: { dataFimReal: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: QualidadeRow[] = rows.map((o) => ({
    id: o.id,
    numero: o.numero,
    nomeProduto: o.nomeProduto,
    quantidade: Number(o.quantidade),
    progresso: o.progresso,
    qualidadeAprovada: o.qualidadeAprovada,
    status: o.status,
    dataFimReal: o.dataFimReal,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <DataTable data={data} columns={columns} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Em Produção', value: 'EM_PRODUCAO' },
      { label: 'Pausada', value: 'PAUSADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

export default async function QualidadePage({
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
        title="Controlo de Qualidade"
        description="Conformidade e taxas de produção das ordens"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Qualidade' },
        ]}
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>}>
        <QualidadeKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={7} />}
      >
        <QualidadeTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
