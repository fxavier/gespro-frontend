'use client';

import Link from 'next/link';
import { MoreHorizontal, Eye, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface NotaCreditoResumo {
  id: string;
  numero: string;
  clienteNome: string;
  faturaOriginalNumero: string;
  dataEmissao: string;
  total: string;
  status: string;
}

const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('pt-PT') : '—';
const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

const columns: TableColumn<NotaCreditoResumo>[] = [
  {
    key: 'numero',
    label: 'Nº NC',
    render: (row) => <span className="font-mono font-medium text-primary">{row.numero}</span>,
  },
  {
    key: 'clienteNome',
    label: 'Cliente',
    render: (row) => <span className="font-medium">{row.clienteNome}</span>,
  },
  {
    key: 'faturaOriginalNumero',
    label: 'Fatura Original',
    mobileHidden: true,
    render: (row) => <span className="text-sm font-mono text-muted-foreground">{row.faturaOriginalNumero}</span>,
  },
  {
    key: 'dataEmissao',
    label: 'Data',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{fmtDate(row.dataEmissao)}</span>,
  },
  {
    key: 'total',
    label: 'Valor Crédito',
    className: 'text-right tabular-nums font-semibold text-destructive',
    headerClassName: 'text-right',
    render: (row) => `-${fmtMZN.format(parseFloat(row.total))}`,
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
            <Link href={`/faturacao/nota-credito/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          {row.status === 'EMITIDA' && (
            <DropdownMenuItem asChild>
              <Link href={`/faturacao/nota-credito/${row.id}/liquidar`}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Liquidar
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface NotasCreditoTableProps {
  data: NotaCreditoResumo[];
  nextCursor?: string | null;
}

export function NotasCreditoTable({ data, nextCursor }: NotasCreditoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/faturacao/nota-credito/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem notas de crédito"
          description="As notas de crédito aparecerão aqui após emissão."
        />
      }
    />
  );
}
