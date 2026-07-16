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
import type { EntregaResumo } from '@/server/services/operacoes/entrega.interface';

const columns: TableColumn<EntregaResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'createdAt',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'cliente',
    label: 'Cliente',
    render: (row) => (
      <div>
        <p className="font-medium text-sm">{row.clienteNome}</p>
        <p className="text-xs text-muted-foreground">{row.cidade}</p>
      </div>
    ),
  },
  {
    key: 'dataAgendada',
    label: 'Agendada',
    mobileHidden: true,
    sortKey: 'dataAgendada',
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {new Date(row.dataAgendada).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'taxa',
    label: 'Taxa',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        MZN {parseFloat(row.taxaEntrega).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.prioridade} />,
  },
  {
    key: 'estado',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.estado} />,
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
            <Link href={`/transporte/entregas/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface EntregasTableProps {
  data: EntregaResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function EntregasTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: EntregasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/transporte/entregas/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem entregas registadas"
          description="Nenhuma entrega encontrada com os filtros seleccionados."
        />
      }
    />
  );
}
