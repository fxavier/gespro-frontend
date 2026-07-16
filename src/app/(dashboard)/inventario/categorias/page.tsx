/**
 * Listagem de Categorias de Ativos — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { CategoriaAtivoFilterSchema } from '@/lib/validations/inventario-ativos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import { CategoriasTable } from './_components/categorias-table';
import { TableSkeleton } from '../ativos/_components/table-skeletons';

const FiltroCategoriaUrlSchema = CategoriaAtivoFilterSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroCategoriaUrl = z.infer<typeof FiltroCategoriaUrlSchema>;
const FILTROS_DEFAULT: FiltroCategoriaUrl = { take: 25 };

async function CategoriasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroCategoriaUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    ativosService.listarCategorias(
      { search: filtros.search, cursor: filtros.cursor, take: filtros.take },
      ctx
    )
  );
  return <CategoriasTable data={result.items} nextCursor={result.nextCursor} />;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CategoriasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroCategoriaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Categorias de Ativos"
        description="Gerencie as categorias para classificar os ativos da empresa"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Categorias' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/categorias/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Link>
          </Button>
        }
      />

      <FilterBar searchPlaceholder="Pesquisar por código ou nome…" searchKey="search" />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={8} cols={5} />}>
        <CategoriasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
