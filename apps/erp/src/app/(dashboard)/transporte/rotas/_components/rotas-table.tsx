'use client';

import Link from 'next/link';
import { MoreHorizontal, Eye, Edit, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { RotaResumo } from '@/server/services/operacoes/rota.interface';

const columns: TableColumn<RotaResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    sortKey: 'createdAt',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'rota',
    label: 'Rota',
    render: (row) => (
      <div>
        <p className="font-medium text-sm">{row.nome}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3 inline" />
          {row.origem} → {row.destino}
        </p>
      </div>
    ),
  },
  {
    key: 'dataInicio',
    label: 'Início',
    mobileHidden: true,
    sortKey: 'dataInicio',
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {new Date(row.dataInicio).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'custo',
    label: 'Custo Est.',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {row.custoEstimado ? `MZN ${parseFloat(row.custoEstimado).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}` : '—'}
      </span>
    ),
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
            aria-label={`Acções para ${row.codigo}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/transporte/rotas/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          {(row.estado === 'PLANEADA' || row.estado === 'PAUSADA') && (
            <DropdownMenuItem asChild>
              <Link href={`/transporte/rotas/${row.id}/editar`}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface RotasTableProps {
  data: RotaResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function RotasTable({ data, nextCursor, currentOrderBy, currentOrderDir }: RotasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/transporte/rotas/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem rotas registadas"
          description="Crie a primeira rota para começar a gerir operações de entrega."
        />
      }
    />
  );
}
