'use client';

/**
 * Tabela de devoluções — CLIENT COMPONENT.
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
import type { DevolucaoRow } from '@/server/services/comercial/devolucao.service';
import { RotateCcw } from 'lucide-react';

const MOTIVO_LABELS: Record<string, string> = {
  DEFEITO: 'Defeito',
  PRODUTO_ERRADO: 'Produto errado',
  INSATISFACAO: 'Insatisfação',
  EXCESSO_PEDIDO: 'Excesso de pedido',
  AVARIA_TRANSPORTE: 'Avaria no transporte',
  OUTRO: 'Outro',
};

const columns: TableColumn<DevolucaoRow>[] = [
  {
    key: 'numero',
    label: 'Número',
    render: (row) => (
      <Link
        href={`/vendas/devolucoes/${row.id}`}
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
    key: 'motivo',
    label: 'Motivo',
    render: (row) => MOTIVO_LABELS[row.motivo] ?? row.motivo,
  },
  {
    key: 'valorTotal',
    label: 'Valor',
    render: (row) => (
      <span className="tabular-nums">
        MT {parseFloat(row.valorTotal).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
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
            <Link href={`/vendas/devolucoes/${row.id}`}>
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
  data: DevolucaoRow[];
  nextCursor: string | null;
}

export function DevolucaoTable({ data, nextCursor }: Props) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<RotateCcw className="h-8 w-8" />}
        title="Sem devoluções"
        description="Ainda não existem devoluções registadas."
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
