/**
 * Amortização de Ativos — Server Component (NUNCA 'use client').
 * Mostra ativos activos com informação de amortização.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { PageHeader, DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { AtivoDto } from '@/server/services/inventario/ativos.interface';
import { TableSkeleton } from '../ativos/_components/table-skeletons';

const METODO_LABELS: Record<string, string> = {
  LINEAR: 'Linear',
  DIGITOS_ANOS: 'Dígitos dos Anos',
  UNIDADES_PRODUCAO: 'Unidades de Produção',
  SALDOS_DECRESCENTES: 'Saldos Decrescentes',
};

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
      <div className="font-medium">{row.nome}</div>
    ),
  },
  {
    key: 'valorCompra',
    label: 'Valor Original',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        MT {Number(row.valorCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    ),
  },
  {
    key: 'valorLiquidoContabilistico',
    label: 'Valor Líquido',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        {row.valorLiquidoContabilistico
          ? `MT ${Number(row.valorLiquidoContabilistico).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : '—'}
      </span>
    ),
  },
  {
    key: 'percentualAmortizado',
    label: 'Amortizado',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">
        {row.percentualAmortizado
          ? `${Number(row.percentualAmortizado).toFixed(1)}%`
          : '—'}
      </span>
    ),
  },
  {
    key: 'metodoAmortizacao',
    label: 'Método',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {METODO_LABELS[row.metodoAmortizacao] ?? row.metodoAmortizacao}
      </span>
    ),
  },
  {
    key: 'vidaUtilAnos',
    label: 'Vida Útil',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">{row.vidaUtilAnos}a</span>
    ),
  },
];

async function AmortizacaoTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    ativosService.listarAtivos({ estado: 'EM_USO', take: 50, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
  );

  return (
    <DataTable
      data={result.items}
      columns={columns}
      rowHref={(row) => `/inventario/ativos/${row.id}`}
      nextCursor={result.nextCursor}
      emptyState={
        <EmptyState
          title="Sem ativos para amortizar"
          description="Os ativos em uso com planos de amortização aparecerão aqui."
        />
      }
    />
  );
}

export default async function AmortizacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Amortização de Ativos"
        description="Valores líquidos e planos de amortização dos ativos em uso"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Amortização' },
        ]}
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
        <AmortizacaoTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
