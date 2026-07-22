/**
 * Listagem de Vendedores — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendedorService } from '@/server/services/comercial/index';
import { FilterVendedorSchema } from '@/lib/validations/vendas';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { VendedoresTable } from './_components/vendedores-table';

const FiltroUrlSchema = FilterVendedorSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;

const FILTROS_DEFAULT: FiltroUrl = { take: 25, orderBy: 'nome', order: 'asc' };

async function VendedoresTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    vendedorService.listar(filtros, { tenantId, userId })
  );
  return <VendedoresTable data={result.items} nextCursor={result.nextCursor} />;
}

function TableSkeleton() {
  return (
    <div className="rounded-md border animate-pulse">
      <div className="h-12 bg-muted" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 border-t bg-muted/30" />
      ))}
    </div>
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Activo', value: 'ATIVO' },
      { label: 'Inactivo', value: 'INATIVO' },
      { label: 'Suspenso', value: 'SUSPENSO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VendedoresPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Vendedores"
        description="Gestão de vendedores e desempenho"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Vendedores' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/vendedores/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Vendedor
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por nome ou email…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <VendedoresTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
