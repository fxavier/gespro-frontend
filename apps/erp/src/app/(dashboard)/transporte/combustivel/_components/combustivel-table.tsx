'use client';

import { Fuel } from 'lucide-react';
import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { AbastecimentoResumo } from '@/server/services/operacoes/abastecimento.interface';

const COMBUSTIVEL_LABELS: Record<string, string> = {
  GASOLINA: 'Gasolina',
  GASÓLEO: 'Gasóleo',
  GASOLEO: 'Gasóleo',
  GPL: 'GPL',
  ELECTRICO: 'Eléctrico',
};

const columns: TableColumn<AbastecimentoResumo>[] = [
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
        <Fuel className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium">{row.viaturaId}</span>
      </div>
    ),
  },
  {
    key: 'combustivel',
    label: 'Combustível',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {COMBUSTIVEL_LABELS[row.tipoCombustivel] ?? row.tipoCombustivel}
      </span>
    ),
  },
  {
    key: 'litros',
    label: 'Litros',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {parseFloat(row.litros).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} L
      </span>
    ),
  },
  {
    key: 'valorLitro',
    label: 'Preço/L',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        MZN {parseFloat(row.valorLitro).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'total',
    label: 'Total',
    render: (row) => (
      <span className="text-sm tabular-nums font-medium">
        MZN {parseFloat(row.valorTotal).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'km',
    label: 'KM Viatura',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {row.kmVeiculo.toLocaleString('pt-MZ')} km
      </span>
    ),
  },
];

interface CombustivelTableProps {
  data: AbastecimentoResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function CombustivelTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: CombustivelTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem registos de abastecimento"
          description="Nenhum abastecimento encontrado com os filtros seleccionados."
        />
      }
    />
  );
}
