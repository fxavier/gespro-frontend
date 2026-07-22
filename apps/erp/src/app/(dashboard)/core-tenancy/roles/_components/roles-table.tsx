'use client';

/**
 * Tabela de papéis (roles) — CLIENT COMPONENT.
 * Colunas com funções render vivem num módulo 'use client'.
 */

import Link from 'next/link';
import { MoreHorizontal, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { RoleRow } from '@/server/services/plataforma/user-admin.interface';
import { RoleAcoes } from './role-acoes';

const columns: TableColumn<RoleRow>[] = [
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{row.nome}</span>
        {row.isSystem && (
          <Badge variant="secondary" className="text-xs">Sistema</Badge>
        )}
      </div>
    ),
  },
  {
    key: 'descricao',
    label: 'Descrição',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.descricao ?? '—'}</span>
    ),
  },
  {
    key: 'permissoes',
    label: 'Permissões',
    className: 'tabular-nums',
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {row.permissions.length}
      </span>
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
            <Link href={`/core-tenancy/roles/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          {!row.isSystem && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                <RoleAcoes id={row.id} nome={row.nome} modoCompacto />
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface RolesTableProps {
  data: RoleRow[];
}

export function RolesTable({ data }: RolesTableProps) {
  // Converter Date objects para garantir serialização correcta
  const tableData = data.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  }));

  return (
    <DataTable
      data={tableData}
      columns={columns as TableColumn<typeof tableData[0]>[]}
      emptyState={
        <EmptyState
          title="Sem papéis configurados"
          description="Crie o primeiro papel para gerir as permissões dos utilizadores."
        />
      }
    />
  );
}
