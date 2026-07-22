'use client';

/**
 * Tabela de clientes — CLIENT COMPONENT.
 * REGRA GOLDEN STANDARD: definições de colunas com funções vivem num módulo 'use client'.
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
import type { ClienteSummary } from '@/server/services/comercial/cliente.interface';
import { ClienteAcoes } from './cliente-acoes';

const columns: TableColumn<ClienteSummary>[] = [
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
    render: (row) => (
      <div>
        <p className="font-medium">{row.nome}</p>
        {row.nuit && (
          <p className="text-xs text-muted-foreground tabular-nums">NUIT {row.nuit}</p>
        )}
      </div>
    ),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.tipo} />,
  },
  {
    key: 'email',
    label: 'Email',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.email ?? '—'}</span>
    ),
  },
  {
    key: 'telefone',
    label: 'Telefone',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums">{row.telefone ?? '—'}</span>
    ),
  },
  {
    key: 'categoria',
    label: 'Categoria',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.categoria} />,
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
            <Link href={`/clientes/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/clientes/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
            <ClienteAcoes id={row.id} status={row.status} modoCompacto />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ClientesTableProps {
  data: ClienteSummary[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ClientesTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ClientesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/clientes/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem clientes"
          description="Crie o primeiro cliente para dar início à gestão comercial."
        />
      }
    />
  );
}
