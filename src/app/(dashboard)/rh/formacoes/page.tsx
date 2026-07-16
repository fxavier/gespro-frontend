/**
 * Formações — Server Component (NUNCA 'use client').
 * Lista formações com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { FormacaoService } from '@/server/services/pessoas-projetos/rh.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, StatusBadge, DataTable, TableSkeleton } from '@/components/patterns';
import type { FilterConfig, TableColumn } from '@/components/patterns';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface FormacaoRow {
  id: string;
  titulo: string;
  status: string;
  dataInicio: Date;
  dataFim: Date;
  vagasDisponiveis: number;
  participantes: number;
}

const columns: TableColumn<FormacaoRow>[] = [
  {
    key: 'titulo',
    label: 'Título',
    render: (row) => <span className="font-medium">{row.titulo}</span>,
  },
  {
    key: 'dataInicio',
    label: 'Início',
    render: (row) => new Date(row.dataInicio).toLocaleDateString('pt-PT'),
  },
  {
    key: 'dataFim',
    label: 'Fim',
    render: (row) => new Date(row.dataFim).toLocaleDateString('pt-PT'),
    mobileHidden: true,
  },
  {
    key: 'participantes',
    label: 'Participantes',
    render: (row) => (
      <span className="tabular-nums">
        {row.participantes}/{row.vagasDisponiveis}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

async function FormacoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const result = await runWithTenantContext(ctx, () =>
    FormacaoService.listar(
      { search: filtros.search, status: filtros.status, cursor: filtros.cursor, take: filtros.take },
      ctx,
    )
  );

  const data: FormacaoRow[] = result.items.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    status: f.status,
    dataInicio: f.dataInicio,
    dataFim: f.dataFim,
    vagasDisponiveis: f.vagasDisponiveis,
    participantes: f._count.participantes,
  }));

  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/rh/formacoes/${row.id}`}
      nextCursor={result.nextCursor ?? undefined}
    />
  );
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Planeada', value: 'PLANEADA' },
      { label: 'Em Andamento', value: 'EM_ANDAMENTO' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

export default async function FormacoesPage({
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
        title="Formações"
        description="Planeamento e acompanhamento de formações"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Formações' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/formacoes/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Formação
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={5} />}
      >
        <FormacoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
