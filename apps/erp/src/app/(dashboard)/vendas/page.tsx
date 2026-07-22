/**
 * Listagem de Vendas — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ShoppingBag, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendaService } from '@/server/services/comercial/index';
import { FilterVendaSchema } from '@/lib/validations/vendas';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { VendasTable } from './_components/vendas-table';
import { TableSkeleton, KpiSkeleton } from './_components/table-skeletons';

// ─── Schema URL ───────────────────────────────────────────────────────────────

const FiltroVendaUrlSchema = FilterVendaSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  orderBy: z.enum(['dataVenda', 'total', 'createdAt']).default('dataVenda'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

type FiltroVendaUrl = z.infer<typeof FiltroVendaUrlSchema>;

const FILTROS_DEFAULT: FiltroVendaUrl = {
  take: 25,
  orderBy: 'dataVenda',
  order: 'desc',
};

// ─── KPIs ─────────────────────────────────────────────────────────────────────

async function VendasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const resultado = await runWithTenantContext({ tenantId, userId }, () =>
    vendaService.listar(
      { take: 100, orderBy: 'dataVenda', order: 'desc' },
      { tenantId, userId }
    )
  );

  const total = resultado.items.length;
  const pendentes = resultado.items.filter((v) => v.status === 'PENDENTE').length;
  const concluidas = resultado.items.filter((v) => v.status === 'CONCLUIDA').length;
  const valorTotal = resultado.items.reduce((acc, v) => acc + parseFloat(v.total), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Vendas"
        value={String(total)}
        icon={<ShoppingBag className="h-5 w-5" />}
      />
      <KpiCard
        title="Pendentes"
        value={String(pendentes)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Concluídas"
        value={String(concluidas)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Volume Total"
        value={`MT ${valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

// ─── Tabela ────────────────────────────────────────────────────────────────────

async function VendasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroVendaUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    vendaService.listar(
      {
        q: filtros.q,
        origem: filtros.origem,
        status: filtros.status,
        clienteId: filtros.clienteId,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      { tenantId, userId }
    )
  );

  return (
    <VendasTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Confirmada', value: 'CONFIRMADA' },
      { label: 'Em Preparação', value: 'EM_PREPARACAO' },
      { label: 'Faturada', value: 'FATURADA' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
      { label: 'Devolvida', value: 'DEVOLVIDA' },
    ],
  },
  {
    key: 'origem',
    label: 'Origem',
    placeholder: 'Todas',
    options: [
      { label: 'POS', value: 'POS' },
      { label: 'Encomenda', value: 'ENCOMENDA' },
      { label: 'E-Commerce', value: 'ECOMMERCE' },
      { label: 'Manual', value: 'MANUAL' },
    ],
  },
];

// ─── Página ───────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VendasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroVendaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Vendas"
        description="Consulte e gira todas as vendas da empresa"
        breadcrumbs={[{ label: 'Vendas' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/pos">
              <Plus className="h-4 w-4 mr-2" />
              Nova Venda POS
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <VendasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por número ou nome do cliente…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <VendasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
