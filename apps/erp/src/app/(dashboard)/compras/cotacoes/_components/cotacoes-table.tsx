'use client';

/**
 * Tabela de cotações de compra — CLIENT COMPONENT.
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
import type { CotacaoResumo } from '@/server/services/compras/compras.service.interface';

const columns: TableColumn<CotacaoResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'data',
    label: 'Data',
    sortKey: 'createdAt',
    render: (row) => (
      <span className="tabular-nums text-sm">
        {new Date(row.data).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'dataValidade',
    label: 'Validade',
    mobileHidden: true,
    sortKey: 'dataValidade',
    render: (row) => (
      <span className="tabular-nums text-sm">
        {new Date(row.dataValidade).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'fornecedores',
    label: 'Fornecedores',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums">
        {row.totalRespostas}/{row.totalFornecedores}
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
            <Link href={`/compras/cotacoes/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface CotacoesTableProps {
  data: CotacaoResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function CotacoesTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: CotacoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/compras/cotacoes/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem cotações"
          description="Crie uma cotação a partir de uma requisição aprovada."
        />
      }
    />
  );
}
