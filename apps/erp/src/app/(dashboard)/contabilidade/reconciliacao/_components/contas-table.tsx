'use client';

import { AlertTriangle } from 'lucide-react';
import { DataTable, EmptyState, StatusBadge, type TableColumn } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';

export interface ContaReconciliacaoRow {
  id: string;
  conta: string;
  contaPgc: string;
  pgcPartilhada: boolean;
  excecoes: number;
  sugestoes: number;
  emTransito: number;
  periodo: { estado: string; dataInicio: string; dataFim: string } | null;
}

const colunas: TableColumn<ContaReconciliacaoRow>[] = [
  {
    key: 'conta',
    label: 'Conta bancária',
    render: (r) => (
      <div>
        <div className="font-medium">{r.conta}</div>
        <div className="text-xs text-muted-foreground">
          PGC {r.contaPgc}
          {r.pgcPartilhada && (
            <span className="ml-2 inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" aria-hidden /> conta PGC partilhada
            </span>
          )}
        </div>
      </div>
    ),
  },
  {
    key: 'excecoes',
    label: 'Excepções',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (r) => <span className={r.excecoes > 0 ? 'font-semibold text-destructive' : ''}>{r.excecoes}</span>,
  },
  { key: 'sugestoes', label: 'Sugestões', className: 'text-right tabular-nums', headerClassName: 'text-right', render: (r) => r.sugestoes },
  {
    key: 'transito', label: 'Em trânsito', className: 'text-right tabular-nums', headerClassName: 'text-right',
    mobileHidden: true, render: (r) => r.emTransito,
  },
  {
    key: 'periodo',
    label: 'Período em curso',
    mobileHidden: true,
    render: (r) =>
      r.periodo ? (
        <div className="flex items-center gap-2">
          <StatusBadge status={r.periodo.estado} />
          <span className="text-sm tabular-nums">
            {formatarData(r.periodo.dataInicio)} — {formatarData(r.periodo.dataFim)}
          </span>
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function ContasTable({ data }: { data: ContaReconciliacaoRow[] }) {
  return (
    <DataTable
      data={data}
      columns={colunas}
      rowHref={(r) => `/contabilidade/reconciliacao/${r.id}`}
      emptyState={
        <EmptyState
          title="Sem contas bancárias activas"
          description="Crie uma conta bancária para começar a reconciliar."
        />
      }
    />
  );
}
