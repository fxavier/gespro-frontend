/**
 * Movimentações de Stock — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { TableSkeleton } from '../ativos/_components/table-skeletons';
import { MovimentosStockTable } from './_components/movimentos-stock-table';

const MovimentacaoFilterUrlSchema = z.object({
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type MovimentacaoFilterUrl = z.infer<typeof MovimentacaoFilterUrlSchema>;
const FILTROS_DEFAULT: MovimentacaoFilterUrl = { take: 25 };

async function MovimentacoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: MovimentacaoFilterUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.listarMovimentos(
      { cursor: filtros.cursor, take: filtros.take },
      ctx
    )
  );

  return <MovimentosStockTable data={result.items} nextCursor={result.nextCursor} />;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Entrada', value: 'ENTRADA' },
      { label: 'Saída', value: 'SAIDA' },
      { label: 'Transferência', value: 'TRANSFERENCIA' },
      { label: 'Baixa', value: 'BAIXA' },
      { label: 'Ajuste', value: 'AJUSTE' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MovimentacoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = MovimentacaoFilterUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Movimentações de Stock"
        description="Histórico de entradas, saídas e transferências de stock"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Movimentações' },
        ]}
      />

      <FilterBar
        searchPlaceholder="Pesquisar movimentações…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={10} cols={5} />}>
        <MovimentacoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
