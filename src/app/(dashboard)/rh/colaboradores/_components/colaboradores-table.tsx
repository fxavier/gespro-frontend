'use client';

/**
 * Tabela de colaboradores — CLIENT COMPONENT.
 * Colunas com funções render vivem neste módulo client (não serializáveis pelo servidor).
 */

import Link from 'next/link';
import { MoreHorizontal, Edit, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { ColaboradorAcoes } from './colaborador-acoes';

export interface ColaboradorResumo {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  departamentoId: string | null;
  cargoId: string | null;
  email: string;
}

const columns: TableColumn<ColaboradorResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    sortKey: 'codigo',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome',
    sortKey: 'nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'email',
    label: 'Email',
    mobileHidden: true,
    render: (row) => (
      <span className="text-muted-foreground text-sm">{row.email}</span>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => {
      const podeEditar = row.status !== 'INACTIVO';
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Acções para ${row.nome}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/rh/colaboradores/${row.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </Link>
            </DropdownMenuItem>
            {podeEditar && (
              <DropdownMenuItem asChild>
                <Link href={`/rh/colaboradores/${row.id}/editar`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
              <ColaboradorAcoes id={row.id} status={row.status} modoCompacto />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

interface ColaboradoresTableProps {
  data: ColaboradorResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ColaboradoresTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ColaboradoresTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/rh/colaboradores/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem colaboradores"
          description="Adicione o primeiro colaborador para começar a gerir a sua equipa."
        />
      }
    />
  );
}
