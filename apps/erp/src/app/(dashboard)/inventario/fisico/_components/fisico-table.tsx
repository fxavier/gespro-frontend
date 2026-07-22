'use client';

/**
 * Tabela de inventários físicos — CLIENT COMPONENT.
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
import type { InventarioFisicoDto } from '@/server/services/inventario/inventario-fisico.interface';

const STATUS_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  PLANEJADO: 'outline',
  AGENDADO: 'info',
  EM_ANDAMENTO: 'warning',
  PAUSADO: 'secondary',
  CONCLUIDO: 'success',
  CANCELADO: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  PLANEJADO: 'Planeado',
  AGENDADO: 'Agendado',
  EM_ANDAMENTO: 'Em Andamento',
  PAUSADO: 'Pausado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const columns: TableColumn<InventarioFisicoDto>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'titulo',
    label: 'Inventário',
    render: (row) => (
      <div className="space-y-0.5">
        <div className="font-medium">{row.titulo}</div>
        {row.descricao && (
          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{row.descricao}</div>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.status}
        variant={STATUS_VARIANTES[row.status] ?? 'default'}
        label={STATUS_LABELS[row.status] ?? row.status}
      />
    ),
  },
  {
    key: 'dataInicio',
    label: 'Data Início',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.dataInicio).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'totalAtivos',
    label: 'Ativos',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">
        {row.totalAtivosContados ?? 0} / {row.totalAtivosEsperados ?? '—'}
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
            aria-label={`Acções para ${row.titulo}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/inventario/fisico/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface FisicoTableProps {
  data: InventarioFisicoDto[];
  nextCursor?: string | null;
}

export function FisicoTable({ data, nextCursor }: FisicoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/inventario/fisico/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem inventários físicos"
          description="Inicie o primeiro inventário físico para contar e reconciliar os ativos."
        />
      }
    />
  );
}
