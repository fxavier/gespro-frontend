'use client';

/**
 * Tabela de trocas — CLIENT COMPONENT.
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
import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { TrocaRow } from '@/server/services/comercial/troca.service';
import { ArrowRightLeft } from 'lucide-react';

const columns: TableColumn<TrocaRow>[] = [
  {
    key: 'numero',
    label: 'Número',
    render: (row) => (
      <span className="font-medium tabular-nums text-foreground">{row.numero}</span>
    ),
  },
  {
    key: 'devolucaoId',
    label: 'Devolução',
    render: (row) => (
      <Link
        href={`/vendas/devolucoes/${row.devolucaoId}`}
        className="text-primary hover:underline text-sm font-mono"
      >
        {row.devolucaoId.slice(-8)}
      </Link>
    ),
  },
  {
    key: 'diferenca',
    label: 'Diferença (MT)',
    render: (row) => {
      const val = parseFloat(row.diferenca);
      const color = val > 0 ? 'text-destructive' : val < 0 ? 'text-primary' : '';
      return (
        <span className={`tabular-nums font-medium ${color}`}>
          {val > 0 ? '+' : ''}MT{' '}
          {val.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
        </span>
      );
    },
  },
  {
    key: 'createdAt',
    label: 'Data',
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
            <Link href={`/vendas/devolucoes/${row.devolucaoId}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver devolução
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/vendas/${row.vendaSubstituicaoId}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver venda de substituição
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface Props {
  data: TrocaRow[];
  nextCursor: string | null;
}

export function TrocasTable({ data, nextCursor }: Props) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<ArrowRightLeft className="h-8 w-8" />}
        title="Sem trocas"
        description="Ainda não existem trocas registadas. Inicie uma troca a partir de uma devolução aprovada."
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
