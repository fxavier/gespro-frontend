'use client';

/**
 * Tabela de vendedores — CLIENT COMPONENT.
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
import type { VendedorRow } from '@/server/services/comercial/vendedor.service';
import { Users } from 'lucide-react';

const columns: TableColumn<VendedorRow>[] = [
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => (
      <Link
        href={`/vendas/vendedores/${row.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.nome}
      </Link>
    ),
  },
  {
    key: 'email',
    label: 'Email',
    mobileHidden: true,
    render: (row) => row.email ?? '—',
  },
  {
    key: 'telefone',
    label: 'Telefone',
    mobileHidden: true,
    render: (row) => row.telefone ?? '—',
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'metaMensal',
    label: 'Meta Mensal',
    mobileHidden: true,
    render: (row) =>
      row.metaMensal
        ? `MT ${parseFloat(row.metaMensal).toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`
        : '—',
  },
  {
    key: 'acoes',
    label: '',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Acções</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/vendas/vendedores/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver perfil
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface Props {
  data: VendedorRow[];
  nextCursor: string | null;
}

export function VendedoresTable({ data, nextCursor }: Props) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Sem vendedores"
        description="Ainda não existem vendedores registados. Crie o primeiro vendedor."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      nextCursor={nextCursor}
      cursorParam="cursor"
    />
  );
}
