'use client';

/**
 * Tabela de fornecedores — CLIENT COMPONENT.
 *
 * Regra golden standard: definições de colunas com funções render/rowHref
 * vivem sempre num módulo Client Component.
 */

import Link from 'next/link';
import { MoreHorizontal, Edit, Eye } from 'lucide-react';
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
import type { FornecedorResumo } from '@/server/services/compras/fornecedor.service.interface';
import { FornecedorAcoes } from './fornecedor-acoes';

const columns: TableColumn<FornecedorResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    sortKey: 'nome',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">
        {row.codigo}
      </span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => (
      <div>
        <p className="font-medium">{row.nome}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{row.nuit}</p>
      </div>
    ),
  },
  {
    key: 'email',
    label: 'Email',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.email}</span>
    ),
  },
  {
    key: 'classificacao',
    label: 'Classificação',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.classificacao} />,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'totalCompras',
    label: 'Total Compras',
    sortKey: 'totalCompras',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT {row.totalCompras.toLocaleString('pt-MZ', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </span>
    ),
  },
  {
    key: 'ultimaCompra',
    label: 'Última Compra',
    mobileHidden: true,
    render: (row) =>
      row.ultimaCompra ? (
        <span className="tabular-nums text-muted-foreground text-sm">
          {new Date(row.ultimaCompra).toLocaleDateString('pt-MZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
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
            aria-label={`Acções para ${row.nome}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/fornecedores/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/fornecedores/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
            <FornecedorAcoes id={row.id} status={row.status} modoCompacto />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface FornecedoresTableProps {
  data: FornecedorResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function FornecedoresTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: FornecedoresTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/fornecedores/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem fornecedores"
          description="Registe o primeiro fornecedor para começar a gerir as compras."
        />
      }
    />
  );
}
