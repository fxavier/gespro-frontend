/**
 * Timesheet — Server Component (NUNCA 'use client').
 * Lista registos de tempo com DataTable + FilterBar.
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
import { Badge } from '@/components/ui/badge';
import {
  PageHeader,
  FilterBar,
  StatusBadge,
  DataTable,
  TableSkeleton,
} from '@/components/patterns';
import type { FilterConfig, TableColumn } from '@/components/patterns';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface TimesheetRow {
  id: string;
  projetoNome: string;
  colaboradorNome: string;
  data: Date;
  duracaoHoras: string;
  tipo: string;
  faturavel: boolean;
  aprovado: boolean;
}

const columns: TableColumn<TimesheetRow>[] = [
  {
    key: 'data',
    label: 'Data',
    render: (row) => (
      <span className="tabular-nums">
        {new Date(row.data).toLocaleDateString('pt-PT')}
      </span>
    ),
  },
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'projetoNome',
    label: 'Projecto',
    render: (row) => row.projetoNome,
    mobileHidden: true,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => (
      <span className="capitalize text-sm">
        {row.tipo.toLowerCase().replace(/_/g, ' ')}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'duracaoHoras',
    label: 'Duração',
    render: (row) => <span className="tabular-nums">{row.duracaoHoras}h</span>,
  },
  {
    key: 'faturavel',
    label: 'Facturável',
    render: (row) => (
      <Badge variant={row.faturavel ? 'default' : 'secondary'}>
        {row.faturavel ? 'Sim' : 'Não'}
      </Badge>
    ),
    mobileHidden: true,
  },
  {
    key: 'aprovado',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.aprovado ? 'APROVADO' : 'PENDENTE'} />,
  },
];

async function TimesheetTableSection({
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
    prisma.timesheet.findMany({
      where: {
        tenantId,
        ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
      },
      select: {
        id: true,
        data: true,
        duracaoHoras: true,
        tipo: true,
        faturavel: true,
        aprovado: true,
        projeto: { select: { nome: true } },
        colaborador: { select: { nome: true } },
      },
      orderBy: { data: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: TimesheetRow[] = rows.map((t) => ({
    id: t.id,
    projetoNome: t.projeto.nome,
    colaboradorNome: t.colaborador.nome,
    data: t.data,
    duracaoHoras: Number(t.duracaoHoras).toFixed(2),
    tipo: t.tipo,
    faturavel: t.faturavel,
    aprovado: t.aprovado,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <DataTable data={data} columns={columns} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { label: 'Desenvolvimento', value: 'DESENVOLVIMENTO' },
      { label: 'Reunião', value: 'REUNIAO' },
      { label: 'Documentação', value: 'DOCUMENTACAO' },
      { label: 'Teste', value: 'TESTE' },
      { label: 'Suporte', value: 'SUPORTE' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

export default async function TimesheetPage({
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
        title="Timesheet"
        description="Registar e consultar horas trabalhadas por projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Timesheet' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/projetos/timesheet/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Registar Tempo
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={7} />}
      >
        <TimesheetTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
