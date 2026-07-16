'use client';

/**
 * Tabela de sessões de caixa — CLIENT COMPONENT.
 * Colunas com funções render VIVEM aqui (regra golden standard).
 */

import Link from 'next/link';
import { MoreHorizontal, Eye, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

// Tipo plain-object (serializável de SC para CC)
export interface SessaoCaixaResumo {
  id: string;
  numero: string;
  dataAbertura: string;
  dataFechamento: string | null;
  fundoInicial: string;
  fundoFinal: string | null;
  totalEntradas: string;
  totalSaidas: string;
  diferenca: string | null;
  status: string;
}

const formatMZN = (v: string | null) => {
  if (v === null || v === undefined) return '—';
  const n = parseFloat(v);
  return `MT ${n.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const columns: TableColumn<SessaoCaixaResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'numero',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'dataAbertura',
    label: 'Abertura',
    sortKey: 'dataAbertura',
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {new Date(row.dataAbertura).toLocaleString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    ),
  },
  {
    key: 'dataFechamento',
    label: 'Fecho',
    mobileHidden: true,
    render: (row) =>
      row.dataFechamento ? (
        <span className="tabular-nums text-muted-foreground">
          {new Date(row.dataFechamento).toLocaleString('pt-MZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'fundoInicial',
    label: 'Fundo Inicial',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">{formatMZN(row.fundoInicial)}</span>
    ),
  },
  {
    key: 'totalEntradas',
    label: 'Entradas',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums text-success">{formatMZN(row.totalEntradas)}</span>
    ),
  },
  {
    key: 'diferenca',
    label: 'Diferença',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => {
      if (!row.diferenca) return <span className="text-muted-foreground">—</span>;
      const d = parseFloat(row.diferenca);
      const colorClass = d === 0 ? 'text-muted-foreground' : d > 0 ? 'text-info' : 'text-destructive';
      return (
        <span className={`tabular-nums font-medium ${colorClass}`}>
          {d > 0 ? '+' : ''}{formatMZN(row.diferenca)}
        </span>
      );
    },
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
            aria-label={`Acções para ${row.numero}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/caixa/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          {row.status === 'ABERTA' && (
            <DropdownMenuItem asChild>
              <Link href={`/caixa/fechamento?sessaoId=${row.id}`}>
                <Lock className="mr-2 h-4 w-4" />
                Fechar caixa
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface SessoesTableProps {
  data: SessaoCaixaResumo[];
  nextCursor?: string | null;
}

export function SessoesTable({ data, nextCursor }: SessoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/caixa/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem sessões de caixa"
          description="Abra o primeiro caixa para iniciar as operações."
        />
      }
    />
  );
}
