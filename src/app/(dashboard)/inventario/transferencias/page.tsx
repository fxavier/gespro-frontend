/**
 * Transferências de Stock — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { Button } from '@/components/ui/button';
import { PageHeader, DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { MovimentoStockDto } from '@/server/services/inventario/stock.interface';
import { TableSkeleton } from '../ativos/_components/table-skeletons';

const columns: TableColumn<MovimentoStockDto>[] = [
  {
    key: 'produtoId',
    label: 'Produto',
    render: (row) => (
      <span className="text-sm font-medium tabular-nums">{row.produtoId.slice(0, 8)}…</span>
    ),
  },
  {
    key: 'quantidade',
    label: 'Qtd',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">{Number(row.quantidade).toLocaleString('pt-MZ')}</span>
    ),
  },
  {
    key: 'localizacaoOrigemId',
    label: 'Origem',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.localizacaoOrigemId ?? '—'}</span>
    ),
  },
  {
    key: 'localizacaoDestinoId',
    label: 'Destino',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.localizacaoDestinoId ?? '—'}</span>
    ),
  },
  {
    key: 'createdAt',
    label: 'Data',
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.createdAt).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
];

async function TransferenciasTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.listarMovimentos({ take: 25 }, ctx)
  );

  const transferencias = result.items.filter((m) => m.tipo === 'TRANSFERENCIA');

  return (
    <DataTable
      data={transferencias}
      columns={columns}
      emptyState={
        <EmptyState
          title="Sem transferências registadas"
          description="As transferências de stock entre localizações aparecerão aqui."
        />
      }
    />
  );
}

export default async function TransferenciasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Transferências de Stock"
        description="Movimentos de stock entre localizações"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Transferências' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/movimentacoes">
              Ver Todas as Movimentações
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <TransferenciasTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
