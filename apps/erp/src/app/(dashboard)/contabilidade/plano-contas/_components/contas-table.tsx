'use client';

/**
 * Tabela do Plano de Contas PGC-NIRF — CLIENT COMPONENT.
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

export interface ContaPGCResumo {
  id: string;
  codigo: string;
  nome: string;
  classe: string;
  tipo: string;
  natureza: string;
  nivel: number;
  aceitaLancamento: boolean;
  ativo: boolean;
}

const columns: TableColumn<ContaPGCResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    sortKey: 'codigo',
    render: (row) => (
      <span className="font-mono tabular-nums text-primary font-medium">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => (
      <span
        className="font-medium"
        style={{ paddingLeft: `${(row.nivel - 1) * 12}px` }}
      >
        {row.nome}
      </span>
    ),
  },
  {
    key: 'classe',
    label: 'Classe',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {row.classe.replace('CLASSE_', 'Classe ')}
      </span>
    ),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.tipo} />,
  },
  {
    key: 'natureza',
    label: 'Natureza',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {row.natureza === 'DEVEDORA' ? 'Devedora' : 'Credora'}
      </span>
    ),
  },
  {
    key: 'aceitaLancamento',
    label: 'Lançamentos',
    mobileHidden: true,
    className: 'text-center',
    headerClassName: 'text-center',
    render: (row) => (
      <span className={`text-xs font-medium ${row.aceitaLancamento ? 'text-success' : 'text-muted-foreground'}`}>
        {row.aceitaLancamento ? 'Sim' : 'Não'}
      </span>
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Acções para ${row.codigo}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/contabilidade/plano-contas/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/contabilidade/plano-contas/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ContasTableProps {
  data: ContaPGCResumo[];
  nextCursor?: string | null;
}

export function ContasTable({ data, nextCursor }: ContasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/contabilidade/plano-contas/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem contas no plano"
          description="Adicione contas ao plano PGC-NIRF ou execute o seed com o plano oficial."
        />
      }
    />
  );
}
