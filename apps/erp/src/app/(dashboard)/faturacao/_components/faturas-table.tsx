'use client';

import Link from 'next/link';
import { MoreHorizontal, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';

export interface FaturaResumo {
  id: string;
  numero: string;
  clienteNome: string;
  dataEmissao: string;
  dataVencimento: string;
  subtotal: string;
  ivaTotal: string;
  total: string;
  statusFatura: string;
}

// Formatação pela porta da frente: o Intl cru devolvia «8 288,00 MTn», e a
// data em pt-PT sem fuso divergia entre servidor e cliente.
const fmtMZN = (v: string) => formatMZN(parseFloat(v));

const columns: TableColumn<FaturaResumo>[] = [
  {
    key: 'numero',
    label: 'Nº Fatura',
    render: (row) => (
      <span className="font-mono font-medium text-primary">{row.numero}</span>
    ),
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
    render: (row) => <span className="text-sm text-muted-foreground">{formatarData(row.dataEmissao)}</span>,
  },
  {
    key: 'dataVencimento',
    label: 'Vencimento',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{formatarData(row.dataVencimento)}</span>,
  },
  {
    key: 'ivaTotal',
    label: 'IVA',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => fmtMZN(row.ivaTotal),
  },
  {
    key: 'total',
    label: 'Total',
    className: 'text-right tabular-nums font-semibold',
    headerClassName: 'text-right',
    render: (row) => fmtMZN(row.total),
  },
  {
    key: 'statusFatura',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.statusFatura} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()} aria-label="Ações para esta fatura">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/faturacao/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Download className="mr-2 h-4 w-4" />
            Descarregar PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface FaturasTableProps {
  data: FaturaResumo[];
  nextCursor?: string | null;
}

export function FaturasTable({ data, nextCursor }: FaturasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/faturacao/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem faturas emitidas"
          description="Emita a primeira fatura clicando em Nova Fatura."
        />
      }
    />
  );
}
