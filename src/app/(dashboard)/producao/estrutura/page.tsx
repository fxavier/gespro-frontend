/**
 * Estrutura de Produto (BOM) — Server Component (NUNCA 'use client').
 * Lista estruturas de produto com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { EstruturaProdutoService } from '@/server/services/pessoas-projetos/producao.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { EstruturaTable } from './_components/estrutura-table';
import type { EstruturaRow } from './_components/estrutura-table';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function EstruturaTableSection({
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
    EstruturaProdutoService.listar(
      {
        search: filtros.search,
        status: filtros.status as never,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    )
  );

  const data: EstruturaRow[] = result.items.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    nome: e.nome,
    versao: e.versao,
    status: e.status,
    nivelComplexidade: e.nivelComplexidade,
  }));

  return <EstruturaTable data={data} nextCursor={result.nextCursor ?? undefined} />;
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
    ],
  },
];

export default async function EstruturaPage({
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
        title="Estrutura de Produto (BOM)"
        description="Gestão de listas de materiais e estruturas hierárquicas"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Estrutura de Produto' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/producao/estrutura/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Estrutura
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={5} />}
      >
        <EstruturaTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
