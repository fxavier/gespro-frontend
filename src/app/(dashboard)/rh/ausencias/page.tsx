/**
 * Ausências — Server Component (NUNCA 'use client').
 * Lista ausências dos colaboradores com DataTable + FilterBar.
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
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface AusenciaRow {
  id: string;
  colaboradorNome: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  diasAusencia: number;
  justificada: boolean;
  status: string;
}

const TIPO_LABEL: Record<string, string> = {
  FALTA: 'Falta',
  ATESTADO_MEDICO: 'Atestado Médico',
  LICENCA_MATERNIDADE: 'Licença Maternidade',
  LICENCA_PATERNIDADE: 'Licença Paternidade',
  LICENCA_SEM_VENCIMENTO: 'Licença s/ Vencimento',
  LICENCA_NOJO: 'Licença Nojo',
  LICENCA_CASAMENTO: 'Licença Casamento',
  OUTRO: 'Outro',
};

const columns: TableColumn<AusenciaRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => TIPO_LABEL[row.tipo] ?? row.tipo,
  },
  {
    key: 'dataInicio',
    label: 'Início',
    render: (row) => new Date(row.dataInicio).toLocaleDateString('pt-PT'),
  },
  {
    key: 'diasAusencia',
    label: 'Dias',
    render: (row) => <span className="tabular-nums">{row.diasAusencia}</span>,
    mobileHidden: true,
  },
  {
    key: 'justificada',
    label: 'Justificada',
    render: (row) => (row.justificada ? 'Sim' : 'Não'),
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

async function AusenciasTableSection({
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
    prisma.ausencia.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
      },
      include: {
        colaborador: { select: { nome: true } },
      },
      orderBy: { dataInicio: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: AusenciaRow[] = rows.map((a) => ({
    id: a.id,
    colaboradorNome: a.colaborador?.nome ?? '—',
    tipo: a.tipo,
    dataInicio: a.dataInicio,
    dataFim: a.dataFim,
    diasAusencia: a.diasAusencia,
    justificada: a.justificada,
    status: a.status,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return (
    <DataTable
      data={data}
      columns={columns}
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
      { label: 'Aprovada', value: 'APROVADA' },
      { label: 'Rejeitada', value: 'REJEITADA' },
    ],
  },
];

export default async function AusenciasPage({
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
        title="Ausências"
        description="Registar e gerir ausências dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Ausências' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/ausencias/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Registar Ausência
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <AusenciasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
