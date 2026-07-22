'use client';

/**
 * Tabela de faturas — CLIENT COMPONENT.
 * Render functions com JSX vivem sempre num módulo 'use client'.
 */

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { DataTable, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface FaturaRow {
  id: string;
  numero: string;
  clienteId: string;
  status: string;
  dataEmissao: string;
  dataVencimento: string;
  total: string;
  ivaTotal: string;
  subtotal: string;
  moeda: string;
}

const columns: TableColumn<FaturaRow>[] = [
  {
    key: 'numero',
    label: 'Nº Fatura',
    render: (row) => (
      <Link href={`/vendas/faturas/${row.id}`} className="flex items-center gap-1.5 font-mono text-sm font-medium text-primary hover:underline">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        {row.numero}
      </Link>
    ),
  },
  {
    key: 'clienteId',
    label: 'Cliente',
    mobileHidden: true,
    render: (row) => (
      <Link href={`/clientes/${row.clienteId}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        {row.clienteId.slice(-8)}
      </Link>
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
    key: 'dataVencimento',
    label: 'Vencimento',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {new Date(row.dataVencimento).toLocaleDateString('pt-MZ')}
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

interface FaturasTableProps {
  data: FaturaRow[];
  nextCursor?: string | null;
}

export function FaturasTable({ data, nextCursor }: FaturasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      rowHref={(row) => `/vendas/faturas/${row.id}`}
    />
  );
}
