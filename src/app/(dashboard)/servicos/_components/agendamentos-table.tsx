'use client';

/**
 * Tabela de agendamentos de serviço — CLIENT COMPONENT.
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
import type { AgendamentoResumo } from '@/server/services/compras/servico.service.interface';

const columns: TableColumn<AgendamentoResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">
        {row.codigo}
      </span>
    ),
  },
  {
    key: 'servico',
    label: 'Serviço',
    render: (row) => row.servicoNome,
  },
  {
    key: 'cliente',
    label: 'Cliente',
    render: (row) => row.clienteNome,
  },
  {
    key: 'tecnico',
    label: 'Técnico',
    mobileHidden: true,
    render: (row) =>
      row.tecnicoNome ? (
        <span className="text-sm">{row.tecnicoNome}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
  },
  {
    key: 'dataAgendamento',
    label: 'Data',
    sortKey: 'dataAgendamento',
    render: (row) => (
      <div className="tabular-nums text-sm">
        <p>
          {new Date(row.dataAgendamento).toLocaleDateString('pt-MZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </p>
        <p className="text-muted-foreground">
          {row.horaInicio} – {row.horaFim}
        </p>
      </div>
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
    sortKey: 'total',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT{' '}
        {row.total.toLocaleString('pt-MZ', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
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
            aria-label={`Acções para ${row.codigo}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/servicos/agendamentos/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface AgendamentosTableProps {
  data: AgendamentoResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function AgendamentosTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: AgendamentosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/servicos/agendamentos/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem agendamentos"
          description="Os agendamentos de serviço aparecerão aqui quando forem criados."
        />
      }
    />
  );
}
