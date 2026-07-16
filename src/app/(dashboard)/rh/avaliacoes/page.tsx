/**
 * Avaliações — Server Component (NUNCA 'use client').
 * Lista avaliações de desempenho com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, StatusBadge, DataTable, TableSkeleton } from '@/components/patterns';
import type { FilterConfig, TableColumn } from '@/components/patterns';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface AvaliacaoRow {
  id: string;
  colaboradorNome: string;
  avaliadorNome: string;
  tipo: string;
  periodo: string;
  notaFinal: number | null;
  status: string;
  dataInicio: Date;
}

const TIPO_LABEL: Record<string, string> = {
  DESEMPENHO: 'Desempenho',
  COMPETENCIAS: 'Competências',
  GRAU_360: 'Avaliação 360°',
  PROBATORIO: 'Período Probatório',
};

const columns: TableColumn<AvaliacaoRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'avaliadorNome',
    label: 'Avaliador',
    render: (row) => row.avaliadorNome,
    mobileHidden: true,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => TIPO_LABEL[row.tipo] ?? row.tipo,
    mobileHidden: true,
  },
  {
    key: 'periodo',
    label: 'Período',
    render: (row) => row.periodo,
  },
  {
    key: 'notaFinal',
    label: 'Nota Final',
    render: (row) =>
      row.notaFinal !== null ? (
        <span className="tabular-nums font-medium">{Number(row.notaFinal).toFixed(1)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

async function AvaliacoesTableSection({
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
    prisma.avaliacao.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
        ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
      },
      include: {
        colaborador: { select: { nome: true } },
        avaliador: { select: { nome: true } },
      },
      orderBy: { dataInicio: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: AvaliacaoRow[] = rows.map((a) => ({
    id: a.id,
    colaboradorNome: a.colaborador?.nome ?? '—',
    avaliadorNome: a.avaliador?.nome ?? '—',
    tipo: a.tipo,
    periodo: a.periodo,
    notaFinal: a.notaFinal !== null ? Number(a.notaFinal) : null,
    status: a.status,
    dataInicio: a.dataInicio,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/rh/avaliacoes/${row.id}`}
      nextCursor={nextCursor}
    />
  );
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Em Andamento', value: 'EM_ANDAMENTO' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { label: 'Desempenho', value: 'DESEMPENHO' },
      { label: 'Competências', value: 'COMPETENCIAS' },
      { label: '360°', value: 'GRAU_360' },
      { label: 'Probatório', value: 'PROBATORIO' },
    ],
  },
];

export default async function AvaliacoesPage({
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
        title="Avaliações de Desempenho"
        description="Gerir avaliações e desenvolvimento dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Avaliações' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/avaliacoes/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Avaliação
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <AvaliacoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
