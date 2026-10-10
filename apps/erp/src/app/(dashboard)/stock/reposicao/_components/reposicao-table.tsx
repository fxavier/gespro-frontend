'use client';

/**
 * Tabela de reposição de stock — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados SaldoStockComDetalheDto são objectos planos e serializam bem.
 */

import { DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { SaldoStockComDetalheDto } from '@/server/services/inventario/stock.interface';

const columns: TableColumn<SaldoStockComDetalheDto>[] = [
  {
    key: 'produtoId',
    label: 'Produto',
    render: (row) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.produto.nome}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{row.produto.codigo}</span>
      </div>
    ),
  },
  {
    key: 'localizacaoId',
    label: 'Localização',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{row.localizacao.nome}</span>,
  },
  {
    key: 'saldo',
    label: 'Saldo Actual',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium text-destructive">
        {Number(row.saldo).toLocaleString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'saldoReservado',
    label: 'Reservado',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {Number(row.saldoReservado).toLocaleString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'saldoDisponivel',
    label: 'Disponível',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        {Number(row.saldoDisponivel).toLocaleString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'estado',
    label: 'Alerta',
    render: () => (
      <StatusBadge status="CRITICO" variant="destructive" label="Stock Baixo" />
    ),
  },
];

interface ReposicaoTableProps {
  data: SaldoStockComDetalheDto[];
}

export function ReposicaoTable({ data }: ReposicaoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      emptyState={
        <EmptyState
          title="Sem alertas de stock"
          description="Todos os produtos estão acima do stock mínimo."
        />
      }
    />
  );
}
