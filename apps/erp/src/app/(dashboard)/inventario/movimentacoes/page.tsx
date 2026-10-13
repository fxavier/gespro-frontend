/**
 * Movimentações de Stock — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import type { TipoMovimentoStock } from '@prisma/client';
import { MovimentoStockFilterSchema, type MovimentoStockFilter } from '@/lib/validations/stock';
import { opcoesDeEnum } from '@/lib/opcoes-enum';
import { TableSkeleton } from '../ativos/_components/table-skeletons';
import { MovimentosStockTable } from './_components/movimentos-stock-table';

const FILTROS_DEFAULT: MovimentoStockFilter = { take: 25 };

async function MovimentacoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: MovimentoStockFilter;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.listarMovimentos({ ...filtros }, ctx)
  );

  return <MovimentosStockTable data={result.items} nextCursor={result.nextCursor} />;
}

const ROTULOS_TIPO: Record<TipoMovimentoStock, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA_ENTRADA: 'Transferência (entrada)',
  TRANSFERENCIA_SAIDA: 'Transferência (saída)',
};

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: opcoesDeEnum(ROTULOS_TIPO),
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

  const parseResult = MovimentoStockFilterSchema.safeParse(flatParams);
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
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/movimentacoes/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Movimentação
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar movimentações…"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={10} cols={5} />}>
        <MovimentacoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
