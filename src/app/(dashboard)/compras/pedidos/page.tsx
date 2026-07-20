/**
 * Listagem de Pedidos de Compra — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard (replica requisicoes):
 * - Schema de filtros via FilterPedidoCompraSchema (lib/validations)
 * - safeParse com defaults
 * - Dados carregados directamente do serviço
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, FileCheck, Truck, CheckCircle, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { FilterPedidoCompraSchema } from '@/lib/validations/compras';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { PedidosTable } from './_components/pedidos-table';
import { TableSkeleton, KpiSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroPedidoUrlSchema = FilterPedidoCompraSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroPedidoUrl = z.infer<typeof FiltroPedidoUrlSchema>;

const FILTROS_DEFAULT: FiltroPedidoUrl = {
  take: 25,
  orderBy: 'createdAt',
  orderDir: 'desc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos
// ─────────────────────────────────────────────────────────────────────────────

async function PedidosKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [todos, emAndamento, recebidos] = await Promise.all([
    runWithTenantContext({ tenantId, userId }, () =>
      comprasService.listarPedidos({ take: 1000, orderBy: 'createdAt', orderDir: 'desc' }, { tenantId, userId })
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      comprasService.listarPedidos(
        { status: 'ENVIADO', take: 1000, orderBy: 'createdAt', orderDir: 'desc' },
        { tenantId, userId }
      )
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      comprasService.listarPedidos(
        { status: 'RECEBIDO_TOTAL', take: 1000, orderBy: 'createdAt', orderDir: 'desc' },
        { tenantId, userId }
      )
    ),
  ]);

  const valorTotal = todos.items.reduce((sum, p) => sum + p.valorTotal, 0);
  const emAndamentoCount = todos.items.filter(
    (p) => ['ENVIADO', 'CONFIRMADO', 'EM_TRANSITO', 'RECEBIDO_PARCIAL'].includes(p.status)
  ).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Pedidos"
        value={String(todos.items.length)}
        icon={<FileCheck className="h-5 w-5" />}
      />
      <KpiCard
        title="Em Andamento"
        value={String(emAndamentoCount)}
        icon={<Truck className="h-5 w-5" />}
      />
      <KpiCard
        title="Recebidos"
        value={String(recebidos.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Valor Total"
        value={`MT ${valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function PedidosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroPedidoUrl;
  tenantId: string;
  userId: string;
}) {
  const { status, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext({ tenantId, userId }, () =>
    comprasService.listarPedidos(
      { status, cursor, take, orderBy, orderDir },
      { tenantId, userId }
    )
  );

  return (
    <PedidosTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={orderBy}
      currentOrderDir={orderDir}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuração da FilterBar
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Enviado', value: 'ENVIADO' },
      { label: 'Confirmado', value: 'CONFIRMADO' },
      { label: 'Em Trânsito', value: 'EM_TRANSITO' },
      { label: 'Recebido Parcial', value: 'RECEBIDO_PARCIAL' },
      { label: 'Recebido Total', value: 'RECEBIDO_TOTAL' },
      { label: 'Cancelado', value: 'CANCELADO' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ComprasPedidosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroPedidoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Pedidos de Compra"
        description="Acompanhe e gira os pedidos de compra e as entregas"
        breadcrumbs={[
          { label: 'Compras', href: '/compras/requisicoes' },
          { label: 'Pedidos' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/compras/pedidos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Pedido
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <Suspense fallback={<KpiSkeleton />}>
        <PedidosKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* FilterBar */}
      <FilterBar
        searchPlaceholder="Pesquisar por número ou fornecedor…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      {/* Tabela */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <PedidosTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
