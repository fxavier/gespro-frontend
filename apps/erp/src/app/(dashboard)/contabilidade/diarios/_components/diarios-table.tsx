'use client';

import Link from 'next/link';
import { MoreHorizontal, Edit, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface DiarioResumo {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  ativo: boolean;
}

const TIPO_LABELS: Record<string, string> = {
  VENDAS: 'Vendas',
  COMPRAS: 'Compras',
  CAIXA: 'Caixa',
  BANCO: 'Banco',
  OPERACOES: 'Operações',
  SALARIOS: 'Salários',
  ABERTURA: 'Abertura',
  ENCERRAMENTO: 'Encerramento',
  OUTROS: 'Outros',
};

const columns: TableColumn<DiarioResumo>[] = [
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
    render: (row) => (
      <span className="text-sm text-muted-foreground">{TIPO_LABELS[row.tipo] ?? row.tipo}</span>
    ),
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
            <Link href={`/contabilidade/diarios/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/contabilidade/diarios/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function DiariosTable({ data }: { data: DiarioResumo[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/contabilidade/diarios/${row.id}`}
      emptyState={
        <EmptyState
          title="Sem diários configurados"
          description="Crie o primeiro diário contabilístico."
        />
      }
    />
  );
}
