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
import type { ContratoServicoDto } from '@/server/services/compras/servico.service.interface';

const columns: TableColumn<ContratoServicoDto>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'clienteNome',
    label: 'Cliente',
    render: (row) => row.clienteNome,
  },
  {
    key: 'dataInicio',
    label: 'Início',
    mobileHidden: true,
    sortKey: 'dataFim',
    render: (row) => (
      <span className="text-sm tabular-nums">
        {new Date(row.dataInicio).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'dataFim',
    label: 'Fim',
    sortKey: 'dataFim',
    render: (row) => (
      <span className={`text-sm tabular-nums${row.diasParaExpirar < 30 && row.diasParaExpirar > 0 ? ' text-warning font-medium' : row.diasParaExpirar <= 0 ? ' text-destructive' : ''}`}>
        {new Date(row.dataFim).toLocaleDateString('pt-MZ', {
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
    key: 'valorMensal',
    label: 'Valor mensal',
    sortKey: 'valorMensal',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT {row.valorMensal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
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
            <Link href={`/servicos/contratos/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ContratosTableProps {
  data: ContratoServicoDto[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ContratosTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ContratosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/servicos/contratos/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem contratos de serviço"
          description="Os contratos de manutenção e suporte aparecerão aqui."
        />
      }
    />
  );
}
