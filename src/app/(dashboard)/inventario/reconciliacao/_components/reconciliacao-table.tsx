'use client';

/**
 * Tabela de reconciliação de inventário — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai
 * importa este wrapper; os dados InventarioFisicoDto são objectos planos e
 * serializam bem.
 */

import { DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { InventarioFisicoDto } from '@/server/services/inventario/inventario-fisico.interface';

const STATUS_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  PLANEJADO: 'outline',
  AGENDADO: 'info',
  EM_ANDAMENTO: 'warning',
  PAUSADO: 'secondary',
  CONCLUIDO: 'success',
  CANCELADO: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  PLANEJADO: 'Planeado',
  AGENDADO: 'Agendado',
  EM_ANDAMENTO: 'Em Andamento',
  PAUSADO: 'Pausado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const columns: TableColumn<InventarioFisicoDto>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => <span className="font-medium tabular-nums text-primary">{row.codigo}</span>,
  },
  {
    key: 'titulo',
    label: 'Inventário',
    render: (row) => <div className="font-medium">{row.titulo}</div>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.status}
        variant={STATUS_VARIANTES[row.status] ?? 'default'}
        label={STATUS_LABELS[row.status] ?? row.status}
      />
    ),
  },
  {
    key: 'discrepancias',
    label: 'Discrepâncias',
    mobileHidden: true,
    render: (row) => (
      <span className={`tabular-nums text-sm font-medium ${row.totalDiscrepancias ? 'text-destructive' : 'text-success'}`}>
        {row.totalDiscrepancias ?? 0}
      </span>
    ),
  },
  {
    key: 'ajustes',
    label: 'Ajustado',
    mobileHidden: true,
    render: (row) => (
      <StatusBadge
        status={row.ajustesRealizados ? 'SIM' : 'NAO'}
        variant={row.ajustesRealizados ? 'success' : 'outline'}
        label={row.ajustesRealizados ? 'Sim' : 'Não'}
      />
    ),
  },
];

interface ReconciliacaoTableProps {
  data: InventarioFisicoDto[];
  nextCursor?: string | null;
}

export function ReconciliacaoTable({ data, nextCursor }: ReconciliacaoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/inventario/fisico/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem inventários para reconciliar"
          description="Os inventários físicos concluídos aparecerão aqui para reconciliação."
        />
      }
    />
  );
}
