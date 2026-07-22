'use client';

import { DataTable, StatusBadge, EmptyState, type TableColumn } from '@/components/patterns';

export interface ContaBancariaRow {
  id: string;
  banco: string;
  agencia: string;
  numeroConta: string;
  tipoConta: string;
  moeda: string;
  contaContabil: string;
  ativo: boolean;
}

const TIPO_LABEL: Record<string, string> = {
  CORRENTE: 'Corrente',
  POUPANCA: 'Poupança',
  DEPOSITO_PRAZO: 'Depósito a prazo',
};

const colunas: TableColumn<ContaBancariaRow>[] = [
  { key: 'banco', label: 'Banco', render: (r) => <span className="font-medium">{r.banco}</span> },
  { key: 'numeroConta', label: 'Nº de conta', render: (r) => <span className="font-mono text-xs">{r.numeroConta}</span> },
  { key: 'agencia', label: 'Agência', render: (r) => r.agencia, mobileHidden: true },
  { key: 'tipoConta', label: 'Tipo', render: (r) => TIPO_LABEL[r.tipoConta] ?? r.tipoConta, mobileHidden: true },
  { key: 'moeda', label: 'Moeda', render: (r) => r.moeda, mobileHidden: true },
  { key: 'contaContabil', label: 'Conta PGC', render: (r) => <span className="font-mono text-xs">{r.contaContabil}</span>, mobileHidden: true },
  {
    key: 'ativo',
    label: 'Estado',
    render: (r) => <StatusBadge status={r.ativo ? 'ATIVO' : 'INATIVO'} />,
  },
];

export function ContasBancariasTable({ data }: { data: ContaBancariaRow[] }) {
  return (
    <DataTable
      data={data}
      columns={colunas}
      rowHref={(r) => `/contabilidade/contas-bancarias/${r.id}/editar`}
      emptyState={
        <EmptyState
          title="Sem contas bancárias"
          description="Crie uma conta bancária ligada a uma conta PGC da classe 1."
        />
      }
    />
  );
}
