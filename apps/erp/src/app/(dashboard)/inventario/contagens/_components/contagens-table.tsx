'use client';

/**
 * Tabela de Contagens de Stock — CLIENT COMPONENT.
 * Definições de colunas com funções render/rowHref DEVEM estar num módulo 'use client'.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { ContagemStockDto } from '@/server/services/inventario/contagem-stock.interface';

const columns: TableColumn<ContagemStockDto>[] = [
  {
    key: 'numero',
    label: 'Número',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'dataAbertura',
    label: 'Data Abertura',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {new Date(row.dataAbertura).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'localizacaoId',
    label: 'Localização',
    mobileHidden: true,
    render: (row) => (
      <span className="text-muted-foreground">
        {row.localizacaoId ?? 'Todas'}
      </span>
    ),
  },
  {
    key: 'cega',
    label: 'Contagem Cega',
    mobileHidden: true,
    render: (row) => (
      <span className="text-muted-foreground">{row.cega ? 'Sim' : 'Não'}</span>
    ),
  },
];

interface ContagensTableProps {
  data: ContagemStockDto[];
  nextCursor?: string | null;
}

export function ContagensTable({ data, nextCursor }: ContagensTableProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="Sem contagens"
        description="Ainda não existem contagens de stock. Crie a primeira contagem."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(row) => `/inventario/contagens/${row.id}`}
      nextCursor={nextCursor}
    />
  );
}
