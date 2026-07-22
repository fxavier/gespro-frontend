'use client';

/**
 * Tabela de transferências — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados MovimentoStockDto são objectos planos e serializam bem.
 */

import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { MovimentoStockDto } from '@/server/services/inventario/stock.interface';

const columns: TableColumn<MovimentoStockDto>[] = [
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
      <span className="tabular-nums font-medium">{Number(row.quantidade).toLocaleString('pt-MZ')}</span>
    ),
  },
  {
    key: 'localizacaoOrigemId',
    label: 'Origem',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.localizacaoOrigemId ?? '—'}</span>
    ),
  },
  {
    key: 'localizacaoDestinoId',
    label: 'Destino',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.localizacaoDestinoId ?? '—'}</span>
    ),
  },
  {
    key: 'createdAt',
    label: 'Data',
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

interface TransferenciasTableProps {
  data: MovimentoStockDto[];
}

export function TransferenciasTable({ data }: TransferenciasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      emptyState={
        <EmptyState
          title="Sem transferências registadas"
          description="As transferências de stock entre localizações aparecerão aqui."
        />
      }
    />
  );
}