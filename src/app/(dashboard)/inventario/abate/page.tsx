/**
 * Abate de Ativos — Server Component (NUNCA 'use client').
 * Lista os ativos com estado BAIXADO.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { PageHeader, DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { AtivoDto } from '@/server/services/inventario/ativos.interface';
import { TableSkeleton } from '../ativos/_components/table-skeletons';
import Link from 'next/link';

const columns: TableColumn<AtivoDto>[] = [
  {
    key: 'codigoInterno',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigoInterno}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Ativo',
    render: (row) => (
      <div className="space-y-0.5">
        <div className="font-medium">{row.nome}</div>
        {(row.marca || row.modelo) && (
          <div className="text-xs text-muted-foreground">{[row.marca, row.modelo].filter(Boolean).join(' ')}</div>
        )}
      </div>
    ),
  },
  {
    key: 'valorCompra',
    label: 'Valor Original',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums">
        MT {Number(row.valorCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    ),
  },
  {
    key: 'dataAquisicao',
    label: 'Data Aquisição',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.dataAquisicao).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
];

async function AbateTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    ativosService.listarAtivos({ estado: 'BAIXADO', take: 50, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
  );

  return (
    <DataTable
      data={result.items}
      columns={columns}
      rowHref={(row) => `/inventario/ativos/${row.id}`}
      nextCursor={result.nextCursor}
      emptyState={
        <EmptyState
          title="Sem ativos abatidos"
          description="Os ativos com estado BAIXADO aparecerão aqui."
        />
      }
    />
  );
}

export default async function AbatePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Abate de Ativos"
        description="Registo de ativos baixados e abatidos do inventário"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Abate' },
        ]}
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={4} />}>
        <AbateTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
