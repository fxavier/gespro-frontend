'use client';

/**
 * Tabela de Motoristas — CLIENT COMPONENT.
 * Padrão golden standard: colunas com funções render num módulo 'use client'.
 */

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
import type { MotoristaResumo } from '@/server/services/operacoes/motorista.service';

const ESTADO_OPERACIONAL_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  SUSPENSO: 'Suspenso',
};

const columns: TableColumn<MotoristaResumo>[] = [
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => (
      <span className="font-medium">{row.nomeCompleto}</span>
    ),
  },
  {
    key: 'contacto',
    label: 'Contacto',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">{row.contacto}</span>
    ),
  },
  {
    key: 'carta',
    label: 'Carta',
    mobileHidden: true,
    render: (row) => (
      <div className="text-sm">
        <span className="font-medium tabular-nums">{row.numeroCarta}</span>
        <span className="text-muted-foreground ml-1.5">
          ({row.categoriaCarta.join(', ')})
        </span>
      </div>
    ),
  },
  {
    key: 'validade',
    label: 'Validade Carta',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {new Date(row.validadeCarta).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'estado',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.estadoOperacional}
        label={ESTADO_OPERACIONAL_LABELS[row.estadoOperacional] ?? row.estadoOperacional}
      />
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
            aria-label={`Acções para ${row.nomeCompleto}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/transporte/motoristas/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/transporte/motoristas/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface MotoristasTableProps {
  data: MotoristaResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function MotoristasTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: MotoristasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/transporte/motoristas/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem motoristas registados"
          description="Registe o primeiro motorista para começar a gerir a equipa."
        />
      }
    />
  );
}
