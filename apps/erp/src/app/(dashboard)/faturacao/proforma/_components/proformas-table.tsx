'use client';

import Link from 'next/link';
import { MoreHorizontal, Eye, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface ProformaResumo {
  id: string;
  numero: string;
  clienteNome: string;
  dataEmissao: string;
  dataValidade: string;
  total: string;
  status: string;
}

const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('pt-PT') : '—';
const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

const columns: TableColumn<ProformaResumo>[] = [
  {
    key: 'numero',
    label: 'Nº Proforma',
    render: (row) => <span className="font-mono font-medium text-primary">{row.numero}</span>,
  },
  {
    key: 'clienteNome',
    label: 'Cliente',
    render: (row) => <span className="font-medium">{row.clienteNome}</span>,
  },
  {
    key: 'dataEmissao',
    label: 'Emissão',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{fmtDate(row.dataEmissao)}</span>,
  },
  {
    key: 'dataValidade',
    label: 'Validade',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{fmtDate(row.dataValidade)}</span>,
  },
  {
    key: 'total',
    label: 'Total',
    className: 'text-right tabular-nums font-semibold',
    headerClassName: 'text-right',
    render: (row) => fmtMZN.format(parseFloat(row.total)),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/faturacao/proforma/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/faturacao/proforma/${row.id}/converter`}>
              <FileCheck className="mr-2 h-4 w-4" />
              Converter em Fatura
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ProformasTableProps {
  data: ProformaResumo[];
  nextCursor?: string | null;
}

export function ProformasTable({ data, nextCursor }: ProformasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/faturacao/proforma/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem proformas emitidas"
          description="Crie a primeira proforma para um cliente."
        />
      }
    />
  );
}
