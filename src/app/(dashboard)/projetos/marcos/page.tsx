/**
 * Marcos de Projectos — Server Component (NUNCA 'use client').
 * Lista todos os marcos com estado e progresso.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Flag } from 'lucide-react';
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
  search: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface MarcoRow {
  id: string;
  nome: string;
  projetoNome: string;
  dataPrevista: string;
  dataReal: string | null;
  status: string;
  progresso: number;
}

const columns: TableColumn<MarcoRow>[] = [
  {
    key: 'nome',
    label: 'Marco',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'projetoNome',
    label: 'Projecto',
    render: (row) => <span className="text-muted-foreground">{row.projetoNome}</span>,
    mobileHidden: true,
  },
  {
    key: 'dataPrevista',
    label: 'Data Prevista',
    render: (row) => <span className="tabular-nums">{row.dataPrevista}</span>,
    mobileHidden: true,
  },
  {
    key: 'dataReal',
    label: 'Data Real',
    render: (row) => (
      <span className="tabular-nums">
        {row.dataReal ?? <span className="text-muted-foreground">—</span>}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'progresso',
    label: 'Progresso',
    render: (row) => (
      <div className="flex items-center gap-2 min-w-[80px]">
        <div className="h-1.5 bg-muted rounded-full flex-1">
          <div
            className="h-1.5 bg-primary rounded-full"
            style={{ width: `${row.progresso}%` }}
          />
        </div>
        <span className="tabular-nums text-xs text-muted-foreground">{row.progresso}%</span>
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

async function MarcosKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const [total, concluidos, emAndamento, atrasados] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.marco.count({ where: { tenantId } }),
      prisma.marco.count({ where: { tenantId, status: 'CONCLUIDO' } }),
      prisma.marco.count({ where: { tenantId, status: 'EM_ANDAMENTO' } }),
      prisma.marco.count({ where: { tenantId, status: 'ATRASADO' } }),
    ])
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard title="Total" value={String(total)} icon={<Flag className="h-4 w-4" />} />
      <KpiCard title="Concluídos" value={String(concluidos)} icon={<Flag className="h-4 w-4" />} />
      <KpiCard title="Em Andamento" value={String(emAndamento)} icon={<Flag className="h-4 w-4" />} />
      <KpiCard title="Atrasados" value={String(atrasados)} icon={<Flag className="h-4 w-4" />} />
    </div>
  );
}

async function MarcosTableSection({
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
    prisma.marco.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
        ...(filtros.search
          ? { nome: { contains: filtros.search, mode: 'insensitive' as const } }
          : {}),
      },
      select: {
        id: true,
        nome: true,
        dataPrevista: true,
        dataReal: true,
        status: true,
        progresso: true,
        projeto: { select: { nome: true } },
      },
      orderBy: { dataPrevista: 'asc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const fmt = (d: Date) => d.toLocaleDateString('pt-PT');

  const data: MarcoRow[] = rows.map((m) => ({
    id: m.id,
    nome: m.nome,
    projetoNome: m.projeto.nome,
    dataPrevista: fmt(m.dataPrevista),
    dataReal: m.dataReal ? fmt(m.dataReal) : null,
    status: m.status,
    progresso: m.progresso,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <DataTable data={data} columns={columns} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Em Andamento', value: 'EM_ANDAMENTO' },
      { label: 'Concluído', value: 'CONCLUIDO' },
      { label: 'Atrasado', value: 'ATRASADO' },
    ],
  },
];

export default async function MarcosPage({
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
        title="Marcos"
        description="Milestones e marcos dos projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Marcos' },
        ]}
      />

      <Suspense fallback={<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">{Array.from({length:4}).map((_,i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>}>
        <MarcosKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={6} cols={6} />}
      >
        <MarcosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
