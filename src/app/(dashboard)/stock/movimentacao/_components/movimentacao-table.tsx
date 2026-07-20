'use client';

/**
 * Tabela de movimentações de stock — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados MovimentoStockDto são objectos planos e serializam bem.
 */

import { DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { MovimentoStockDto } from '@/server/services/inventario/stock.interface';

const TIPO_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  ENTRADA: 'success',
  SAIDA: 'destructive',
  TRANSFERENCIA: 'info',
  BAIXA: 'destructive',
  AJUSTE: 'outline',
  RESERVA: 'warning',
};

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  TRANSFERENCIA: 'Transferência',
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
    render: (row) => <span className="text-sm font-medium tabular-nums">{row.produtoId.slice(0, 8)}…</span>,
  },
  {
    key: 'quantidade',
    label: 'Qtd',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">{Number(row.quantidade).toLocaleString('pt-MZ')}</span>
    ),
  },
  {
    key: 'motivo',
    label: 'Motivo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{row.motivo ?? '—'}</span>
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

interface MovimentacaoTableProps {
  data: MovimentoStockDto[];
  nextCursor?: string | null;
}

export function MovimentacaoTable({ data, nextCursor }: MovimentacaoTableProps) {
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
