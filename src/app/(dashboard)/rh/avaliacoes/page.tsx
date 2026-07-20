/**
 * Avaliações — Server Component (NUNCA 'use client').
 * Lista avaliações de desempenho com DataTable + FilterBar.
 * Leitura via AvaliacaoService (sem prisma cru).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AvaliacaoService } from '@/server/services/pessoas-projetos/rh.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { AvaliacoesTable } from './_components/avaliacoes-table';
import type { AvaliacaoRow } from './_components/avaliacoes-table';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

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

  const result = await runWithTenantContext(ctx, () =>
    AvaliacaoService.listar(
      {
        status: filtros.status,
        tipo: filtros.tipo,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    )
  );

  const data: AvaliacaoRow[] = result.items.map((a) => ({
    id: a.id,
    colaboradorNome: a.colaborador?.nome ?? '—',
    avaliadorNome: a.avaliador?.nome ?? '—',
    tipo: a.tipo,
    periodo: a.periodo,
    notaFinal: a.notaFinal !== null ? Number(a.notaFinal) : null,
    status: a.status,
    dataInicio: a.dataInicio,
  }));

  return <AvaliacoesTable data={data} nextCursor={result.nextCursor ?? undefined} />;
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
