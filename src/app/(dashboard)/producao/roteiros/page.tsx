/**
 * Roteiros de Produção — Server Component (NUNCA 'use client').
 * Lista roteiros com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { RoteiroService } from '@/server/services/pessoas-projetos/producao.service';
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

interface RoteiroRow {
  id: string;
  codigo: string;
  nome: string;
  versao: string;
  status: string;
  categoria: string | null;
}

const columns: TableColumn<RoteiroRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'versao',
    label: 'Versão',
    render: (row) => row.versao,
    mobileHidden: true,
  },
  {
    key: 'categoria',
    label: 'Categoria',
    render: (row) => <span className="text-muted-foreground">{row.categoria ?? '—'}</span>,
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

async function RoteirosTableSection({
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
    RoteiroService.listar(
      {
        search: filtros.search,
        status: filtros.status as never,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    )
  );

  const data: RoteiroRow[] = result.items.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    nome: r.nome,
    versao: r.versao,
    status: r.status,
    categoria: r.categoria,
  }));

  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/producao/roteiros/${row.id}`}
      nextCursor={result.nextCursor ?? undefined}
    />
  );
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Activo', value: 'ACTIVO' },
      { label: 'Inactivo', value: 'INACTIVO' },
      { label: 'Substituído', value: 'SUBSTITUIDO' },
      { label: 'Em Revisão', value: 'EM_REVISAO' },
    ],
  },
];

export default async function RoteirosPage({
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
        title="Roteiros de Produção"
        description="Definição de processos e operações produtivas"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Roteiros' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/producao/roteiros/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Novo Roteiro
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={5} />}
      >
        <RoteirosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
