'use client';

/**
 * Tabela de movimentos de STOCK — CLIENT COMPONENT.
 * Colunas com funções `render` vivem aqui (não podem atravessar a fronteira RSC).
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { MovimentoStockDto } from '@/server/services/inventario/stock.interface';

const TIPO_VARIANTES: Record<
  string,
  'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'
> = {
  ENTRADA: 'success',
  SAIDA: 'destructive',
  TRANSFERENCIA: 'info',
  EMPRESTIMO: 'warning',
  DEVOLUCAO: 'secondary',
  BAIXA: 'destructive',
  AJUSTE: 'outline',
  RESERVA: 'warning',
};

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  TRANSFERENCIA: 'Transferência',
  EMPRESTIMO: 'Empréstimo',
  DEVOLUCAO: 'Devolução',
  BAIXA: 'Baixa',
  AJUSTE: 'Ajuste',
  RESERVA: 'Reserva',
};

const columns: TableColumn<MovimentoStockDto>[] = [
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
    key: 'produtoId',
    label: 'Produto',
    render: (row) => (
      <span className="text-sm font-medium tabular-nums">{row.produtoId.slice(0, 8)}…</span>
    ),
  },
  {
    key: 'quantidade',
    label: 'Qtd',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        {Number(row.quantidade).toLocaleString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'motivo',
    label: 'Motivo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
        {row.motivo ?? '—'}
      </span>
    ),
  },
  {
    key: 'createdAt',
    label: 'Data',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.createdAt).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
];

interface MovimentosStockTableProps {
  data: MovimentoStockDto[];
  nextCursor?: string | null;
}

export function MovimentosStockTable({ data, nextCursor }: MovimentosStockTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem movimentações registadas"
          description="As movimentações de stock aparecerão aqui."
        />
      }
    />
  );
}
