/**
 * Capacidade Produtiva — Server Component (NUNCA 'use client').
 * Lista centros de trabalho com capacidade e utilização.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Factory, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
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
  tipo: z.string().optional(),
  ativo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface CentroRow {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  capacidadeHorasDia: string | null;
  custoHora: string;
  ativo: boolean;
  operacoesActivas: number;
}

const columns: TableColumn<CentroRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => <span className="tabular-nums font-mono text-xs">{row.codigo}</span>,
  },
  {
    key: 'nome',
    label: 'Centro de Trabalho',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
    mobileHidden: true,
  },
  {
    key: 'capacidadeHorasDia',
    label: 'Cap. (h/dia)',
    render: (row) => (
      <span className="tabular-nums">
        {row.capacidadeHorasDia ? `${row.capacidadeHorasDia}h` : '—'}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'custoHora',
    label: 'Custo/Hora',
    render: (row) => <span className="tabular-nums">MT {row.custoHora}</span>,
    mobileHidden: true,
  },
  {
    key: 'operacoesActivas',
    label: 'Operações Activas',
    render: (row) => <span className="tabular-nums">{row.operacoesActivas}</span>,
    mobileHidden: true,
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />,
  },
];

async function CapacidadeKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [totalCentros, centrosAtivos, operacoesEmCurso] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.centroTrabalho.count({ where: { tenantId } }),
      prisma.centroTrabalho.count({ where: { tenantId, ativo: true } }),
      prisma.operacaoOrdem.count({
        where: {
          tenantId,
          status: 'EM_ANDAMENTO',
        },
      }),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard title="Total Centros" value={String(totalCentros)} icon={<Factory className="h-4 w-4" />} />
      <KpiCard title="Centros Activos" value={String(centrosAtivos)} icon={<Factory className="h-4 w-4" />} />
      <KpiCard title="Operações em Curso" value={String(operacoesEmCurso)} icon={<Clock className="h-4 w-4" />} />
    </div>
  );
}

async function CapacidadeTableSection({
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
    prisma.centroTrabalho.findMany({
      where: {
        tenantId,
        ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
        ...(filtros.ativo !== undefined ? { ativo: filtros.ativo === 'true' } : {}),
      },
      select: {
        id: true,
        codigo: true,
        nome: true,
        tipo: true,
        capacidadeHorasDia: true,
        custoHora: true,
        ativo: true,
      },
      orderBy: { nome: 'asc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: CentroRow[] = rows.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    tipo: c.tipo,
    capacidadeHorasDia: c.capacidadeHorasDia ? Number(c.capacidadeHorasDia).toFixed(1) : null,
    custoHora: Number(c.custoHora).toLocaleString('pt-PT', { minimumFractionDigits: 2 }),
    ativo: c.ativo,
    operacoesActivas: 0, // ponytail: contagem separada se necessário
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <DataTable data={data} columns={columns} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { label: 'Produção', value: 'PRODUCAO' },
      { label: 'Montagem', value: 'MONTAGEM' },
      { label: 'Qualidade', value: 'QUALIDADE' },
      { label: 'Armazém', value: 'ARMAZEM' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
  {
    key: 'ativo',
    label: 'Estado',
    options: [
      { label: 'Activo', value: 'true' },
      { label: 'Inactivo', value: 'false' },
    ],
  },
];

export default async function CapacidadePage({
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
        title="Capacidade Produtiva"
        description="Centros de trabalho e sua capacidade disponível"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Capacidade' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/producao/ordens/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Ordem
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>}>
        <CapacidadeKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={7} />}
      >
        <CapacidadeTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
