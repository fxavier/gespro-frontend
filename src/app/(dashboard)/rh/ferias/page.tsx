/**
 * Férias — Server Component (NUNCA 'use client').
 * Lista solicitações de férias com DataTable + FilterBar.
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
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { FeriasTable } from './_components/ferias-table';
import type { SolicitacaoRow } from './_components/ferias-table';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function FeriasTableSection({
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
    prisma.solicitacaoFerias.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
      },
      select: {
        id: true,
        dataInicio: true,
        dataFim: true,
        diasSolicitados: true,
        tipo: true,
        status: true,
        ferias: {
          select: {
            colaborador: { select: { nome: true } },
          },
        },
      },
      orderBy: { dataSolicitacao: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: SolicitacaoRow[] = rows.map((s) => ({
    id: s.id,
    colaboradorNome: s.ferias?.colaborador?.nome ?? '—',
    dataInicio: s.dataInicio,
    dataFim: s.dataFim,
    diasSolicitados: s.diasSolicitados,
    tipo: s.tipo,
    status: s.status,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <FeriasTable data={data} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Aprovada', value: 'APROVADA' },
      { label: 'Rejeitada', value: 'REJEITADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

export default async function FeriasPage({
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
        title="Férias"
        description="Gerir solicitações de férias dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Férias' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/ferias/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Solicitação
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <FeriasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
