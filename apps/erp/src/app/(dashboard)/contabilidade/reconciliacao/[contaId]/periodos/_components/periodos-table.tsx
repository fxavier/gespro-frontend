'use client';

import { DataTable, EmptyState, StatusBadge, type TableColumn } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';

export interface PeriodoRow {
  id: string;
  contaId: string;
  dataInicio: string;
  dataFim: string;
  estado: string;
  saldoFinalBanco: string;
  diferencaResidual: string | null;
}

const colunas: TableColumn<PeriodoRow>[] = [
  { key: 'periodo', label: 'Período', className: 'tabular-nums', render: (p) => `${formatarData(p.dataInicio)} — ${formatarData(p.dataFim)}` },
  { key: 'estado', label: 'Estado', render: (p) => <StatusBadge status={p.estado} /> },
  { key: 'saldo', label: 'Saldo final (banco)', className: 'text-right tabular-nums', headerClassName: 'text-right', render: (p) => formatMZN(p.saldoFinalBanco) },
  {
    key: 'residual', label: 'Diferença residual', className: 'text-right tabular-nums', headerClassName: 'text-right', mobileHidden: true,
    render: (p) => (p.diferencaResidual === null ? <span className="text-muted-foreground">—</span> : formatMZN(p.diferencaResidual)),
  },
];

export function PeriodosTable({ data }: { data: PeriodoRow[] }) {
  return (
    <DataTable
      data={data}
      columns={colunas}
      rowHref={(p) => `/contabilidade/reconciliacao/${p.contaId}/periodos/${p.id}`}
      emptyState={<EmptyState title="Sem períodos" description="Abra o primeiro período de reconciliação desta conta." />}
    />
  );
}
