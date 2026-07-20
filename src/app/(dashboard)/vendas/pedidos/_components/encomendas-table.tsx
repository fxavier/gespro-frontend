'use client';

/**
 * Tabela de encomendas de venda — CLIENT COMPONENT.
 * Funções de render/rowHref não serializam para o servidor.
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
import type { EncomendaRow } from '@/server/services/comercial/encomenda.service';
import { ShoppingBag } from 'lucide-react';

const columns: TableColumn<EncomendaRow>[] = [
  {
    key: 'numero',
    label: 'Número',
    render: (row) => (
      <Link
        href={`/vendas/pedidos/${row.id}`}
        className="font-medium tabular-nums text-primary hover:underline"
      >
        {row.numero}
      </Link>
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
    render: (row) => (
      <span className="tabular-nums">
        MT {parseFloat(row.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'dataPrevista',
    label: 'Data Prevista',
    mobileHidden: true,
    render: (row) =>
      row.dataPrevista
        ? new Date(row.dataPrevista).toLocaleDateString('pt-MZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : '—',
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    mobileHidden: true,
    render: (row) =>
      new Date(row.createdAt).toLocaleDateString('pt-MZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
  },
  {
    key: 'acoes',
    label: '',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Acções</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/vendas/pedidos/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface Props {
  data: EncomendaRow[];
  nextCursor: string | null;
}

export function EncomendasTable({ data, nextCursor }: Props) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="Sem encomendas"
        description="Ainda não existem encomendas. Crie a primeira encomenda de venda."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      nextCursor={nextCursor}
      cursorParam="cursor"
    />
  );
}
