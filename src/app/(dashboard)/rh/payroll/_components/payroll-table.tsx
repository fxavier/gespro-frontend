'use client';

/**
 * Tabela de processamento salarial — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados PayrollRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface PayrollRow {
  id: string;
  colaboradorNome: string;
  mesReferencia: number;
  anoReferencia: number;
  salarioBruto: string;
  salarioLiquido: string;
  status: string;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const columns: TableColumn<PayrollRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'periodo',
    label: 'Período',
    render: (row) => (
      <span className="tabular-nums">
        {MESES[(row.mesReferencia - 1)]} {row.anoReferencia}
      </span>
    ),
  },
  {
    key: 'salarioBruto',
    label: 'Salário Bruto',
    render: (row) => <span className="tabular-nums">MT {row.salarioBruto}</span>,
  },
  {
    key: 'salarioLiquido',
    label: 'Salário Líquido',
    render: (row) => <span className="tabular-nums font-medium">MT {row.salarioLiquido}</span>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface PayrollTableProps {
  data: PayrollRow[];
  nextCursor?: string | null;
}

export function PayrollTable({ data, nextCursor }: PayrollTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem processamentos salariais"
          description="Processe o primeiro salário para começar a gerir a folha de pagamento."
        />
      }
    />
  );
}