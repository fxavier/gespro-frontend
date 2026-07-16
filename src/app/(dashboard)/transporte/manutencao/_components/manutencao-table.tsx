'use client';

import { Wrench } from 'lucide-react';
import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { ManutencaoViaturaRef } from '@/server/services/operacoes/viatura.interface';

// ManutencaoViaturaRef extendida com viaturaMatricula para a listagem
export interface ManutencaoComViatura extends ManutencaoViaturaRef {
  viaturaId: string;
  viaturaMatricula: string;
}

const TIPO_MANUTENCAO_LABELS: Record<string, string> = {
  PREVENTIVA: 'Preventiva',
  CORRECTIVA: 'Correctiva',
};

const columns: TableColumn<ManutencaoComViatura>[] = [
  {
    key: 'data',
    label: 'Data',
    sortKey: 'data',
    render: (row) => (
      <span className="text-sm tabular-nums">
        {new Date(row.data).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'viatura',
    label: 'Viatura',
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium tabular-nums text-primary">{row.viaturaMatricula}</span>
      </div>
    ),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {TIPO_MANUTENCAO_LABELS[row.tipo] ?? row.tipo}
      </span>
    ),
  },
  {
    key: 'descricao',
    label: 'Descrição',
    render: (row) => (
      <p className="text-sm truncate max-w-[240px]">{row.descricao}</p>
    ),
  },
  {
    key: 'km',
    label: 'Quilometragem',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {row.quilometragem ? `${row.quilometragem.toLocaleString('pt-MZ')} km` : '—'}
      </span>
    ),
  },
  {
    key: 'custo',
    label: 'Custo',
    render: (row) => (
      <span className="text-sm tabular-nums font-medium">
        {row.custo
          ? `MZN ${parseFloat(row.custo).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`
          : '—'}
      </span>
    ),
  },
  {
    key: 'proxima',
    label: 'Próx. Manutenção',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {row.proximaManutencaoData
          ? new Date(row.proximaManutencaoData).toLocaleDateString('pt-MZ', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : '—'}
      </span>
    ),
  },
];

interface ManutencaoTableProps {
  data: ManutencaoComViatura[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ManutencaoTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ManutencaoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem registos de manutenção"
          description="Nenhuma manutenção encontrada com os filtros seleccionados."
        />
      }
    />
  );
}
