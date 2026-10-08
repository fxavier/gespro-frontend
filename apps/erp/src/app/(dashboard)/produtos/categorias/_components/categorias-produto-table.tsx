'use client';

/**
 * Tabela de categorias de produto (#119) — CLIENT COMPONENT (colunas com `render`).
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
import type { CategoriaProdutoDto } from '@/server/services/inventario/catalogo.interface';

const columns: TableColumn<CategoriaProdutoDto>[] = [
  {
    key: 'nome',
    label: 'Categoria',
    render: (row) => (
      <div className="flex items-center gap-2">
        {/* A cor é um dado da categoria (escolhida pelo utilizador), não um token de tema. */}
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-full border"
          style={{ backgroundColor: row.cor }}
        />
        <span className="font-medium">{row.nome}</span>
      </div>
    ),
  },
  {
    key: 'descricao',
    label: 'Descrição',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground truncate max-w-[320px] block">
        {row.descricao ?? '—'}
      </span>
    ),
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} label={row.ativo ? 'Activa' : 'Inactiva'} />,
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
            <Link href={`/produtos/categorias/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface CategoriasProdutoTableProps {
  data: CategoriaProdutoDto[];
  nextCursor?: string | null;
}

export function CategoriasProdutoTable({ data, nextCursor }: CategoriasProdutoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      rowHref={(row) => `/produtos/categorias/${row.id}/editar`}
      emptyState={
        <EmptyState
          title="Sem categorias de produto"
          description="Crie a primeira categoria — cada produto tem de pertencer a uma."
        />
      }
    />
  );
}
