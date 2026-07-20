'use client';

/**
 * Tabela de vendas — CLIENT COMPONENT.
 * Colunas com funções render vivem sempre num módulo 'use client'.
 */

import Link from 'next/link';
import { MoreHorizontal, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { VendaSummary } from '@/server/services/comercial/venda.interface';
import { VendaAcoes } from './venda-acoes';

const ORIGEM_LABELS: Record<string, string> = {
  POS: 'POS',
  ENCOMENDA: 'Encomenda',
  ECOMMERCE: 'E-Commerce',
  MANUAL: 'Manual',
};

const columns: TableColumn<VendaSummary>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'numero',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'dataVenda',
    label: 'Data',
    sortKey: 'dataVenda',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {new Date(row.dataVenda).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'cliente',
    label: 'Cliente',
    render: (row) => (
      <span className="text-sm">{row.clienteNome ?? 'Consumidor Final'}</span>
    ),
  },
  {
    key: 'origem',
    label: 'Origem',
    mobileHidden: true,
    render: (row) => (
      <span className="text-xs text-muted-foreground">{ORIGEM_LABELS[row.origem] ?? row.origem}</span>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'total',
    label: 'Total',
    sortKey: 'total',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT {parseFloat(row.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Acções para ${row.numero}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/vendas/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
            <VendaAcoes id={row.id} status={row.status} modoCompacto />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface VendasTableProps {
  data: VendaSummary[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function VendasTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: VendasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/vendas/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem vendas"
          description="Nenhuma venda encontrada para os filtros seleccionados."
        />
      }
    />
  );
}
