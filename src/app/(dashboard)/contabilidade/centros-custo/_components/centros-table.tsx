'use client';

import Link from 'next/link';
import { MoreHorizontal, Eye, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface CentroCustoResumo {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  orcamento: string | null;
}

const TIPO_LABELS: Record<string, string> = {
  DEPARTAMENTO: 'Departamento',
  PROJETO: 'Projecto',
  FILIAL: 'Filial',
  OUTRO: 'Outro',
};

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

const columns: TableColumn<CentroCustoResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-mono font-medium text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{TIPO_LABELS[row.tipo] ?? row.tipo}</span>
    ),
  },
  {
    key: 'orcamento',
    label: 'Orçamento',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) =>
      row.orcamento
        ? fmtMZN.format(parseFloat(row.orcamento))
        : <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/contabilidade/centros-custo/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/contabilidade/centros-custo/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface CentrosTableProps {
  data: CentroCustoResumo[];
  nextCursor?: string | null;
}

export function CentrosTable({ data, nextCursor }: CentrosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/contabilidade/centros-custo/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem centros de custo"
          description="Crie o primeiro centro de custo para imputação de gastos."
        />
      }
    />
  );
}
