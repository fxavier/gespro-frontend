/**
 * Reposição de Stock — Server Component (NUNCA 'use client').
 * Lista produtos com alertas de stock mínimo.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { PageHeader, DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { SaldoStockDto } from '@/server/services/inventario/stock.interface';
import { TableSkeleton } from '../../inventario/ativos/_components/table-skeletons';

const columns: TableColumn<SaldoStockDto>[] = [
  {
    key: 'produtoId',
    label: 'Produto',
    render: (row) => <span className="font-medium tabular-nums text-primary">{row.produtoId.slice(0, 8)}…</span>,
  },
  {
    key: 'localizacaoId',
    label: 'Localização',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{row.localizacaoId.slice(0, 8)}…</span>,
  },
  {
    key: 'saldo',
    label: 'Saldo Actual',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium text-destructive">
        {Number(row.saldo).toLocaleString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'saldoReservado',
    label: 'Reservado',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {Number(row.saldoReservado).toLocaleString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'saldoDisponivel',
    label: 'Disponível',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        {Number(row.saldoDisponivel).toLocaleString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'estado',
    label: 'Alerta',
    render: () => (
      <StatusBadge status="CRITICO" variant="destructive" label="Stock Baixo" />
    ),
  },
];

async function ReposicaoTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const alertas = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.obterAlertasStockMinimo(ctx)
  );

  return (
    <DataTable
      data={alertas}
      columns={columns}
      emptyState={
        <EmptyState
          title="Sem alertas de stock"
          description="Todos os produtos estão acima do stock mínimo."
        />
      }
    />
  );
}

export default async function ReposicaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reposição de Stock"
        description="Produtos abaixo do stock mínimo que necessitam de reposição"
        breadcrumbs={[
          { label: 'Stock', href: '/stock' },
          { label: 'Reposição' },
        ]}
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span>Produtos com stock abaixo do mínimo</span>
          </div>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <ReposicaoTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
