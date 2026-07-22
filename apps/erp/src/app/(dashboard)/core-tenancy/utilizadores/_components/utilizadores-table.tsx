'use client';

/**
 * Tabela de utilizadores — CLIENT COMPONENT.
 * Colunas com funções `render` vivem num módulo 'use client'.
 * Padrão golden standard: Server Component pai importa este wrapper.
 */

import Link from 'next/link';
import { MoreHorizontal, Edit, UserX } from 'lucide-react';
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
import type { UserRow } from '@/server/services/plataforma/user-admin.interface';
import { UtilizadorAcoes } from './utilizador-acoes';

const columns: TableColumn<UserRow>[] = [
  {
    key: 'nome',
    label: 'Nome',
    sortKey: 'nome',
    render: (row) => (
      <span className="font-medium">{row.nome}</span>
    ),
  },
  {
    key: 'email',
    label: 'Email',
    render: (row) => (
      <span className="text-muted-foreground">{row.email}</span>
    ),
  },
  {
    key: 'roles',
    label: 'Papéis',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {row.roles.map((r) => r.nome).join(', ') || '—'}
      </span>
    ),
  },
  {
    key: 'permissoes',
    label: 'Permissões',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {row.permissoes.length}
      </span>
    ),
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => (
      <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />
    ),
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    mobileHidden: true,
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {new Date(row.createdAt).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
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
            aria-label={`Acções para ${row.nome}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/core-tenancy/utilizadores/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          {row.ativo && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                <UtilizadorAcoes id={row.id} nome={row.nome} modoCompacto />
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface UtilizadoresTableProps {
  data: UserRow[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function UtilizadoresTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: UtilizadoresTableProps) {
  // Serializar: UserRow tem Date objects — converter para strings antes de passar
  const tableData = data.map((u) => ({
    ...u,
    createdAt: new Date(u.createdAt),
    updatedAt: new Date(u.updatedAt),
    deletedAt: u.deletedAt ? new Date(u.deletedAt) : null,
  }));

  return (
    <DataTable
      data={tableData}
      columns={columns as TableColumn<typeof tableData[0]>[]}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem utilizadores"
          description="Crie o primeiro utilizador para dar início à gestão de acessos."
        />
      }
    />
  );
}
