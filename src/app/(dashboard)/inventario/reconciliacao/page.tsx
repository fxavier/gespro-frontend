/**
 * Reconciliação de Inventário — Server Component (NUNCA 'use client').
 * Lista inventários físicos concluídos para reconciliação.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { inventarioFisicoService } from '@/server/services/inventario/inventario-fisico.service';
import { Button } from '@/components/ui/button';
import { PageHeader, DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { InventarioFisicoDto } from '@/server/services/inventario/inventario-fisico.interface';
import { TableSkeleton } from '../ativos/_components/table-skeletons';

const STATUS_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  PLANEJADO: 'outline',
  AGENDADO: 'info',
  EM_ANDAMENTO: 'warning',
  PAUSADO: 'secondary',
  CONCLUIDO: 'success',
  CANCELADO: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  PLANEJADO: 'Planeado',
  AGENDADO: 'Agendado',
  EM_ANDAMENTO: 'Em Andamento',
  PAUSADO: 'Pausado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const columns: TableColumn<InventarioFisicoDto>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => <span className="font-medium tabular-nums text-primary">{row.codigo}</span>,
  },
  {
    key: 'titulo',
    label: 'Inventário',
    render: (row) => <div className="font-medium">{row.titulo}</div>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.status}
        variant={STATUS_VARIANTES[row.status] ?? 'default'}
        label={STATUS_LABELS[row.status] ?? row.status}
      />
    ),
  },
  {
    key: 'discrepancias',
    label: 'Discrepâncias',
    mobileHidden: true,
    render: (row) => (
      <span className={`tabular-nums text-sm font-medium ${row.totalDiscrepancias ? 'text-destructive' : 'text-success'}`}>
        {row.totalDiscrepancias ?? 0}
      </span>
    ),
  },
  {
    key: 'ajustes',
    label: 'Ajustado',
    mobileHidden: true,
    render: (row) => (
      <StatusBadge
        status={row.ajustesRealizados ? 'SIM' : 'NAO'}
        variant={row.ajustesRealizados ? 'success' : 'outline'}
        label={row.ajustesRealizados ? 'Sim' : 'Não'}
      />
    ),
  },
];

async function ReconciliacaoTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    inventarioFisicoService.listarInventarios({ status: 'CONCLUIDO', take: 25 }, ctx)
  );

  return (
    <DataTable
      data={result.items}
      columns={columns}
      rowHref={(row) => `/inventario/fisico/${row.id}`}
      nextCursor={result.nextCursor}
      emptyState={
        <EmptyState
          title="Sem inventários para reconciliar"
          description="Os inventários físicos concluídos aparecerão aqui para reconciliação."
        />
      }
    />
  );
}

export default async function ReconciliacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reconciliação de Inventário"
        description="Inventários físicos concluídos e seus ajustes"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Reconciliação' },
        ]}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/inventario/fisico">
              Ver Todos os Inventários
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <ReconciliacaoTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
