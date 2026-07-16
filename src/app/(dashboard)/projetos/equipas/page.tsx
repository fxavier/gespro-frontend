/**
 * Equipas — Server Component (NUNCA 'use client').
 * Lista equipas de projecto com DataTable.
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

interface EquipaRow {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  membros: number;
}

const columns: TableColumn<EquipaRow>[] = [
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'descricao',
    label: 'Descrição',
    render: (row) => <span className="text-muted-foreground">{row.descricao ?? '—'}</span>,
    mobileHidden: true,
  },

  {
    key: 'membros',
    label: 'Membros',
    render: (row) => <span className="tabular-nums">{row.membros}</span>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

async function EquipasTableSection({
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
    prisma.equipa.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
        ...(filtros.search
          ? { nome: { contains: filtros.search, mode: 'insensitive' } }
          : {}),
      },
      include: {
        _count: { select: { membros: true } },
      },
      orderBy: { nome: 'asc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: EquipaRow[] = rows.map((e) => ({
    id: e.id,
    nome: e.nome,
    descricao: e.descricao,
    status: e.status,
    membros: e._count.membros,
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
      { label: 'Ativa', value: 'ATIVA' },
      { label: 'Inativa', value: 'INATIVA' },
    ],
  },
];

export default async function EquipasPage({
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
        title="Equipas"
        description="Gerir equipas de projecto"
        breadcrumbs={[
          { label: 'Projetos', href: '/projetos/lista' },
          { label: 'Equipas' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/projetos/equipas/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Equipa
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={6} cols={4} />}
      >
        <EquipasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
