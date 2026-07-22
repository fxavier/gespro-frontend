'use client';

/**
 * Tabela de notas de débito — CLIENT COMPONENT.
 */

import { DataTable, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface NotaDebitoRow {
  id: string;
  numero: string;
  clienteId: string;
  status: string;
  motivo: string;
  dataEmissao: string;
  total: string;
  moeda: string;
}

const columns: TableColumn<NotaDebitoRow>[] = [
  {
    key: 'numero',
    label: 'Nº Nota',
    render: (row) => (
      <span className="font-mono text-sm font-medium">{row.numero}</span>
    ),
  },
  {
    key: 'clienteId',
    label: 'Cliente',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.clienteId.slice(-8)}</span>
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

interface NotasDebitoTableProps {
  data: NotaDebitoRow[];
  nextCursor?: string | null;
}

export function NotasDebitoTable({ data, nextCursor }: NotasDebitoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
    />
  );
}
