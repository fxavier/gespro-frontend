'use client';

/**
 * Tabela de notas de crédito — CLIENT COMPONENT.
 */

import { DataTable, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface NotaCreditoRow {
  id: string;
  numero: string;
  faturaOriginalId: string;
  status: string;
  motivo: string;
  dataEmissao: string;
  total: string;
  moeda: string;
}

const columns: TableColumn<NotaCreditoRow>[] = [
  {
    key: 'numero',
    label: 'Nº Nota',
    render: (row) => (
      <span className="font-mono text-sm font-medium">{row.numero}</span>
    ),
  },
  {
    key: 'faturaOriginalId',
    label: 'Fatura Original',
    mobileHidden: true,
    render: (row) => (
      <a href={`/vendas/faturas/${row.faturaOriginalId}`} className="text-sm text-primary hover:underline">
        {row.faturaOriginalId.slice(-8)}
      </a>
    ),
  },
  {
    key: 'motivo',
    label: 'Motivo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{row.motivo}</span>
    ),
  },
  {
    key: 'dataEmissao',
    label: 'Emissão',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {new Date(row.dataEmissao).toLocaleDateString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'total',
    label: 'Total',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT {parseFloat(row.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface NotasCreditoTableProps {
  data: NotaCreditoRow[];
  nextCursor?: string | null;
}

export function NotasCreditoTable({ data, nextCursor }: NotasCreditoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
    />
  );
}
