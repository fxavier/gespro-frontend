/**
 * Listagem de Categorias de Produto (#119) — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { catalogoProdutoService } from '@/server/services/inventario/catalogo.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { CategoriasProdutoTable } from './_components/categorias-produto-table';

const FiltroCategoriaUrlSchema = z.object({
  search: z.string().optional(),
  ativo: z.enum(['true', 'false']).optional(),
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
    catalogoProdutoService.listarCategorias(
      {
        search: filtros.search,
        ativo: filtros.ativo === undefined ? undefined : filtros.ativo === 'true',
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx
    )
  );
  return <CategoriasProdutoTable data={result.items} nextCursor={result.nextCursor} />;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'ativo',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Activa', value: 'true' },
      { label: 'Inactiva', value: 'false' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CategoriasProdutoPage({ searchParams }: PageProps) {
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
        title="Categorias de Produto"
        description="Organize o catálogo — cada produto pertence a uma categoria"
        breadcrumbs={[
          { label: 'Produtos', href: '/produtos' },
          { label: 'Categorias' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/produtos/categorias/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova categoria
            </Link>
          </Button>
        }
      />

      <FilterBar searchPlaceholder="Pesquisar por nome…" searchKey="search" filters={FILTER_CONFIGS} />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={8} cols={4} />}>
        <CategoriasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
