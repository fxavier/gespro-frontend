'use client';

/**
 * Tabela de Tickets — CLIENT COMPONENT.
 * Padrão golden standard: colunas com funções render num módulo 'use client'.
 */

import Link from 'next/link';
import { MoreHorizontal, Eye, Edit, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { TicketResumo } from '@/server/services/operacoes/ticket.interface';

const TIPO_LABELS: Record<string, string> = {
  INCIDENTE: 'Incidente',
  REQUISICAO: 'Requisição',
  PROBLEMA: 'Problema',
  MUDANCA: 'Mudança',
  CONSULTA: 'Consulta',
};

const columns: TableColumn<TicketResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'createdAt',
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <span className="font-medium tabular-nums text-primary">{row.numero}</span>
        {row.slaEmAtraso && (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="SLA em atraso" />
        )}
      </div>
    ),
  },
  {
    key: 'titulo',
    label: 'Título',
    render: (row) => (
      <div>
        <p className="font-medium text-sm truncate max-w-[260px]">{row.titulo}</p>
        <p className="text-xs text-muted-foreground">{row.solicitanteNome}</p>
      </div>
    ),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {TIPO_LABELS[row.tipo] ?? row.tipo}
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
    key: 'sla',
    label: 'SLA',
    mobileHidden: true,
    render: (row) => {
      const agora = new Date();
      const limite = new Date(row.slaDataLimiteResolucao);
      const horas = Math.round((limite.getTime() - agora.getTime()) / (1000 * 60 * 60));
      if (row.slaEmAtraso) {
        return <span className="text-xs font-medium text-destructive tabular-nums">Atrasado</span>;
      }
      if (horas < 24) {
        return <span className="text-xs font-medium text-warning tabular-nums">{horas}h restantes</span>;
      }
      const dias = Math.round(horas / 24);
      return <span className="text-xs text-muted-foreground tabular-nums">{dias}d restantes</span>;
    },
  },
  {
    key: 'atribuido',
    label: 'Atribuído a',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {row.atribuidoParaNome ?? '—'}
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
            <Link href={`/tickets/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          {row.estado !== 'FECHADO' && row.estado !== 'CANCELADO' && (
            <DropdownMenuItem asChild>
              <Link href={`/tickets/${row.id}/editar`}>
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

interface TicketsTableProps {
  data: TicketResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function TicketsTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: TicketsTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/tickets/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem tickets"
          description="Não foram encontrados tickets com os filtros seleccionados."
        />
      }
    />
  );
}
