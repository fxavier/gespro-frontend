'use client';

/**
 * Tabela de movimentações de ativos — CLIENT COMPONENT.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { MovimentacaoAtivoDto } from '@/server/services/inventario/ativos.interface';

const TIPO_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  ENTRADA: 'success',
  SAIDA: 'destructive',
  TRANSFERENCIA: 'info',
  EMPRESTIMO: 'warning',
  DEVOLUCAO: 'secondary',
  BAIXA: 'destructive',
  AJUSTE: 'outline',
};

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  TRANSFERENCIA: 'Transferência',
  EMPRESTIMO: 'Empréstimo',
  DEVOLUCAO: 'Devolução',
  BAIXA: 'Baixa',
  AJUSTE: 'Ajuste',
};

const columns: TableColumn<MovimentacaoAtivoDto>[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => (
      <StatusBadge
        status={row.tipo}
        variant={TIPO_VARIANTES[row.tipo] ?? 'default'}
        label={TIPO_LABELS[row.tipo] ?? row.tipo}
      />
    ),
  },
  {
    key: 'ativoId',
    label: 'Ativo',
    render: (row) => (
      <span className="text-sm font-medium">{row.ativoId.slice(0, 8)}…</span>
    ),
  },
  {
    key: 'motivo',
    label: 'Motivo',
    render: (row) => (
      <span className="text-sm truncate max-w-[200px] block">{row.motivo}</span>
    ),
  },
  {
    key: 'dataMovimentacao',
    label: 'Data',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.dataMovimentacao).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'confirmada',
    label: 'Confirmada',
    mobileHidden: true,
    render: (row) => (
      <StatusBadge
        status={row.confirmada ? 'CONFIRMADA' : 'PENDENTE'}
        variant={row.confirmada ? 'success' : 'warning'}
        label={row.confirmada ? 'Confirmada' : 'Pendente'}
      />
    ),
  },
];

interface MovimentacoesTableProps {
  data: MovimentacaoAtivoDto[];
}

export function MovimentacoesTable({ data }: MovimentacoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      emptyState={
        <EmptyState
          title="Sem movimentações registadas"
          description="As movimentações de ativos aparecerão aqui."
        />
      }
    />
  );
}
