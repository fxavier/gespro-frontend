'use client';

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
import type { ContaPagarResumo } from '@/server/services/compras/conta-pagar.service.interface';

const columns: TableColumn<ContaPagarResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'fornecedorNome',
    label: 'Fornecedor',
    render: (row) => row.fornecedorNome,
  },
  {
    key: 'descricao',
    label: 'Descrição',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground truncate max-w-48 block">
        {row.descricao}
      </span>
    ),
  },
  {
    key: 'dataVencimento',
    label: 'Vencimento',
    sortKey: 'dataVencimento',
    render: (row) => (
      <div className="text-sm">
        <p className={`tabular-nums${row.diasAtraso > 0 ? ' text-destructive font-medium' : ''}`}>
          {new Date(row.dataVencimento).toLocaleDateString('pt-MZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </p>
        {row.diasAtraso > 0 && (
          <p className="text-xs text-destructive">{row.diasAtraso}d atraso</p>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'valorRestante',
    label: 'Restante',
    sortKey: 'valorOriginal',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <div className="text-right">
        <p className="font-medium tabular-nums">
          MT {row.valorRestante.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          / MT {row.valorOriginal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
        </p>
      </div>
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
            <Link href={`/fornecedores/contas-pagar/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ContasPagarTableProps {
  data: ContaPagarResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ContasPagarTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ContasPagarTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/fornecedores/contas-pagar/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem contas a pagar"
          description="As contas a pagar geradas a partir de recebimentos aparecerão aqui."
        />
      }
    />
  );
}
