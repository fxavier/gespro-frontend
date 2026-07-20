'use client';

/**
 * Tabela de pedidos de compra — CLIENT COMPONENT.
 * Regra golden standard: definições de colunas com funções render/rowHref
 * vivem sempre num módulo Client Component.
 */

import Link from 'next/link';
import { MoreHorizontal, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { PedidoCompraResumo } from '@/server/services/compras/compras.service.interface';

const columns: TableColumn<PedidoCompraResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'numero',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">
        {row.numero}
      </span>
    ),
  },
  {
    key: 'data',
    label: 'Data',
    sortKey: 'createdAt',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-muted-foreground text-sm">
        {new Date(row.data).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'fornecedor',
    label: 'Fornecedor',
    render: (row) => row.fornecedorNome,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'valorTotal',
    label: 'Valor Total',
    sortKey: 'valorTotal',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT{' '}
        {row.valorTotal.toLocaleString('pt-MZ', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    ),
  },
  {
    key: 'dataEntregaPrevista',
    label: 'Entrega Prevista',
    mobileHidden: true,
    sortKey: 'dataEntregaPrevista',
    render: (row) => (
      <span className="tabular-nums text-muted-foreground text-sm">
        {new Date(row.dataEntregaPrevista).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
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
            <Link href={`/compras/pedidos/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface PedidosTableProps {
  data: PedidoCompraResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function PedidosTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: PedidosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/compras/pedidos/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem pedidos de compra"
          description="Os pedidos de compra aparecerão aqui quando forem criados."
        />
      }
    />
  );
}
