'use client';

/**
 * Tabela de categorias de ativos — CLIENT COMPONENT.
 */

import Link from 'next/link';
import { MoreHorizontal, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { CategoriaAtivoDto } from '@/server/services/inventario/ativos.interface';

const columns: TableColumn<CategoriaAtivoDto>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Categoria',
    render: (row) => (
      <div className="space-y-0.5">
        <div className="font-medium">{row.nome}</div>
        {row.descricao && (
          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{row.descricao}</div>
        )}
      </div>
    ),
  },
  {
    key: 'metodoAmortizacao',
    label: 'Amortização',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.metodoAmortizacao.replace(/_/g, ' ')}</span>
    ),
  },
  {
    key: 'vidaUtilAnos',
    label: 'Vida Útil',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">{row.vidaUtilAnos} ano{row.vidaUtilAnos !== 1 ? 's' : ''}</span>
    ),
  },
  {
    key: 'ativa',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.ativa ? 'ATIVA' : 'INATIVA'}
        variant={row.ativa ? 'success' : 'secondary'}
        label={row.ativa ? 'Activa' : 'Inactiva'}
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
            aria-label={`Acções para ${row.nome}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/inventario/categorias/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface CategoriasTableProps {
  data: CategoriaAtivoDto[];
  nextCursor?: string | null;
}

export function CategoriasTable({ data, nextCursor }: CategoriasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem categorias registadas"
          description="Crie a primeira categoria para organizar os ativos."
        />
      }
    />
  );
}
