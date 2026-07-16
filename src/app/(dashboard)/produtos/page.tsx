/**
 * Listagem de Produtos — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { catalogoProdutoService } from '@/server/services/inventario/catalogo.service';
import { ProdutoFilterSchema } from '@/lib/validations/produtos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ProdutosTable } from './_components/produtos-table';
import { TableSkeleton } from '../inventario/ativos/_components/table-skeletons';

const FiltroProdutoUrlSchema = ProdutoFilterSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroProdutoUrl = z.infer<typeof FiltroProdutoUrlSchema>;
const FILTROS_DEFAULT: FiltroProdutoUrl = { take: 25, orderBy: 'createdAt', orderDir: 'desc' };

async function ProdutosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroProdutoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    catalogoProdutoService.listarProdutos(
      {
        search: filtros.search,
        categoriaId: filtros.categoriaId,
        ativo: filtros.ativo,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        orderDir: filtros.orderDir,
      },
      ctx
    )
  );

  return (
    <ProdutosTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.orderDir}
    />
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'ativo',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Activo', value: 'true' },
      { label: 'Inactivo', value: 'false' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProdutosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroProdutoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Catálogo de Produtos"
        description="Gerencie os produtos e serviços da empresa"
        breadcrumbs={[{ label: 'Produtos' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/produtos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por SKU, nome ou marca…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={6} />}
      >
        <ProdutosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
