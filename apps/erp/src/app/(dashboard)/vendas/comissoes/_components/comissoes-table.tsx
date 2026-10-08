'use client';

/**
 * Tabela de comissões — CLIENT COMPONENT.
 * Render functions com JSX vivem sempre num módulo 'use client'.
 */

import Link from 'next/link';
import { DataTable, StatusBadge } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import type { TableColumn } from '@/components/patterns';
import type { ComissaoRow } from '@/server/services/comercial/comissao.interface';

const columns: TableColumn<ComissaoRow>[] = [
  {
    key: 'vendaId',
    label: 'Venda',
    render: (row) => (
      <a href={`/vendas/${row.vendaId}`} className="font-mono text-xs text-primary hover:underline">
        {row.vendaId.slice(-8)}
      </a>
    ),
  },
  {
    key: 'percentualAplicado',
    label: '%',
    render: (row) => (
      <span className="tabular-nums">{parseFloat(row.percentualAplicado).toFixed(2)}%</span>
    ),
  },
  {
    key: 'valorBase',
    label: 'Valor Base',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        MT {parseFloat(row.valorBase).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'valorComissao',
    label: 'Comissão',
    sortKey: 'valorComissao',
    render: (row) => (
      <Link
        href={`/vendas/comissoes/${row.id}`}
        className="font-medium tabular-nums text-primary hover:underline"
      >
        MT {parseFloat(row.valorComissao).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </Link>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'createdAt',
    label: 'Data',
    mobileHidden: true,
    sortKey: 'createdAt',
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatarData(row.createdAt)}
      </span>
    ),
  },
];

interface ComissoesTableProps {
  data: ComissaoRow[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ComissoesTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ComissoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
    />
  );
}
