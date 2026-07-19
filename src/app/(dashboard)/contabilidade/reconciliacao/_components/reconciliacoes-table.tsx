'use client';

/**
 * Tabela de reconciliações bancárias — colunas com funções de render vivem
 * num módulo 'use client' (fronteira RSC).
 */

import { DataTable, StatusBadge, EmptyState, type TableColumn } from '@/components/patterns';

export interface ReconciliacaoRow {
  id: string;
  contaLabel: string;
  periodo: string;
  saldoFinalBanco: string;
  saldoFinalContabil: string;
  diferencaNaoConciliada: string;
  status: string;
}

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
const fmtValor = (s: string) => fmtMZN.format(Number(s));

const colunas: TableColumn<ReconciliacaoRow>[] = [
  { key: 'conta', label: 'Conta bancária', render: (r) => <span className="font-medium">{r.contaLabel}</span> },
  { key: 'periodo', label: 'Período', render: (r) => r.periodo, mobileHidden: true },
  {
    key: 'saldoBanco',
    label: 'Saldo banco',
    render: (r) => <span className="tabular-nums">{fmtValor(r.saldoFinalBanco)}</span>,
    className: 'text-right',
    headerClassName: 'text-right',
    mobileHidden: true,
  },
  {
    key: 'saldoContabil',
    label: 'Saldo contabilístico',
    render: (r) => <span className="tabular-nums">{fmtValor(r.saldoFinalContabil)}</span>,
    className: 'text-right',
    headerClassName: 'text-right',
    mobileHidden: true,
  },
  {
    key: 'diferenca',
    label: 'Diferença',
    render: (r) => (
      <span className={`tabular-nums ${Number(r.diferencaNaoConciliada) === 0 ? 'text-success' : 'text-warning'}`}>
        {fmtValor(r.diferencaNaoConciliada)}
      </span>
    ),
    className: 'text-right',
    headerClassName: 'text-right',
  },
  { key: 'status', label: 'Estado', render: (r) => <StatusBadge status={r.status} /> },
];

export function ReconciliacoesTable({ data }: { data: ReconciliacaoRow[] }) {
  return (
    <DataTable
      data={data}
      columns={colunas}
      rowHref={(r) => `/contabilidade/reconciliacao/${r.id}`}
      emptyState={
        <EmptyState
          title="Sem reconciliações"
          description="Inicie uma reconciliação para confrontar o extracto do banco com o razão."
        />
      }
    />
  );
}
