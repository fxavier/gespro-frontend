/**
 * Assiduidade — Server Component (NUNCA 'use client').
 * Lista registos de assiduidade com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Clock } from 'lucide-react';
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
  colaboradorId: z.string().optional(),
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface AssiduidadeRow {
  id: string;
  colaboradorNome: string;
  data: string;
  entrada: string;
  saida: string;
  horasTrabalhadas: string;
  horasExtras: string;
  tipo: string;
}

const columns: TableColumn<AssiduidadeRow>[] = [
  {
    key: 'data',
    label: 'Data',
    render: (row) => <span className="tabular-nums">{row.data}</span>,
  },
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'entrada',
    label: 'Entrada',
    render: (row) => <span className="tabular-nums">{row.entrada}</span>,
    mobileHidden: true,
  },
  {
    key: 'saida',
    label: 'Saída',
    render: (row) => <span className="tabular-nums">{row.saida}</span>,
    mobileHidden: true,
  },
  {
    key: 'horasTrabalhadas',
    label: 'Horas Trabalhadas',
    render: (row) => <span className="tabular-nums">{row.horasTrabalhadas}h</span>,
    mobileHidden: true,
  },
  {
    key: 'horasExtras',
    label: 'Horas Extra',
    render: (row) => (
      <span className={`tabular-nums ${Number(row.horasExtras) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
        {Number(row.horasExtras) > 0 ? `+${row.horasExtras}h` : '—'}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
  },
];

async function AssiduidadeKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const hoje = new Date();
  const inicioPeriodo = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [totalMes, normais, ausencias] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.registoAssiduidade.count({
        where: { tenantId, data: { gte: inicioPeriodo } },
      }),
      prisma.registoAssiduidade.count({
        where: { tenantId, tipo: 'NORMAL', data: { gte: inicioPeriodo } },
      }),
      prisma.registoAssiduidade.count({
        where: { tenantId, tipo: 'AUSENCIA', data: { gte: inicioPeriodo } },
      }),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard title="Registos este mês" value={String(totalMes)} icon={<Clock className="h-4 w-4" />} />
      <KpiCard title="Presenças" value={String(normais)} icon={<Clock className="h-4 w-4" />} />
      <KpiCard title="Ausências" value={String(ausencias)} icon={<Clock className="h-4 w-4" />} />
    </div>
  );
}

async function AssiduidadeTableSection({
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
    prisma.registoAssiduidade.findMany({
      where: {
        tenantId,
        ...(filtros.colaboradorId ? { colaboradorId: filtros.colaboradorId } : {}),
        ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
      },
      select: {
        id: true,
        data: true,
        entrada: true,
        saida: true,
        horasTrabalhadas: true,
        horasExtras: true,
        tipo: true,
        colaborador: { select: { nome: true } },
      },
      orderBy: { data: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const fmt = (d: Date) => d.toLocaleDateString('pt-PT');
  const fmtTime = (d: Date) => d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  const data: AssiduidadeRow[] = rows.map((r) => ({
    id: r.id,
    colaboradorNome: r.colaborador.nome,
    data: fmt(r.data),
    entrada: fmtTime(r.entrada),
    saida: fmtTime(r.saida),
    horasTrabalhadas: Number(r.horasTrabalhadas).toFixed(1),
    horasExtras: Number(r.horasExtras).toFixed(1),
    tipo: r.tipo,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <DataTable data={data} columns={columns} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { label: 'Normal', value: 'NORMAL' },
      { label: 'Feriado', value: 'FERIADO' },
      { label: 'Fim de Semana', value: 'FIM_SEMANA' },
      { label: 'Férias', value: 'FERIAS' },
      { label: 'Ausência', value: 'AUSENCIA' },
    ],
  },
];

export default async function AssiduidadePage({
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
        title="Assiduidade"
        description="Controlo de presenças e horários dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Assiduidade' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/assiduidade/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Registar
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">{Array.from({length:3}).map((_,i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>}>
        <AssiduidadeKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={7} />}
      >
        <AssiduidadeTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
