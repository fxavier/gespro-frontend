/**
 * Listagem de Inventários Físicos — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { inventarioFisicoService } from '@/server/services/inventario/inventario-fisico.service';
import { InventarioFisicoFilterSchema } from '@/lib/validations/inventario-ativos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { FisicoTable } from './_components/fisico-table';
import { TableSkeleton } from '../ativos/_components/table-skeletons';

const FiltroFisicoUrlSchema = InventarioFisicoFilterSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroFisicoUrl = z.infer<typeof FiltroFisicoUrlSchema>;
const FILTROS_DEFAULT: FiltroFisicoUrl = { take: 25 };

async function FisicoTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroFisicoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    inventarioFisicoService.listarInventarios(
      { status: filtros.status, cursor: filtros.cursor, take: filtros.take },
      ctx
    )
  );
  return <FisicoTable data={result.items} nextCursor={result.nextCursor} />;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Planeado', value: 'PLANEJADO' },
      { label: 'Agendado', value: 'AGENDADO' },
      { label: 'Em Andamento', value: 'EM_ANDAMENTO' },
      { label: 'Pausado', value: 'PAUSADO' },
      { label: 'Concluído', value: 'CONCLUIDO' },
      { label: 'Cancelado', value: 'CANCELADO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InventarioFisicoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroFisicoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Inventário Físico"
        description="Contagens e reconciliação de ativos"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Inventário Físico' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/fisico/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Inventário
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por código ou título…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={8} cols={5} />}>
        <FisicoTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
