'use client';

/**
 * Tabela de orçamentos — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados OrcamentoRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface OrcamentoRow {
  id: string;
  projetoNome: string;
  versao: number;
  status: string;
  totalPlanejado: number;
  totalUtilizado: number;
}

const columns: TableColumn<OrcamentoRow>[] = [
  {
    key: 'projetoNome',
    label: 'Projecto',
    render: (row) => <span className="font-medium">{row.projetoNome}</span>,
  },
  {
    key: 'versao',
    label: 'Versão',
    render: (row) => <span className="tabular-nums">v{row.versao}</span>,
    mobileHidden: true,
  },
  {
    key: 'totalPlanejado',
    label: 'Planejado (MT)',
    render: (row) => (
      <span className="tabular-nums font-medium">
        {Number(row.totalPlanejado).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'totalUtilizado',
    label: 'Utilizado (MT)',
    render: (row) => (
      <span className="tabular-nums">
        {Number(row.totalUtilizado).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface OrcamentosTableProps {
  data: OrcamentoRow[];
  nextCursor?: string | null;
}

export function OrcamentosTable({ data, nextCursor }: OrcamentosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem orçamentos"
          description="Crie o primeiro orçamento para controlar os custos dos projectos."
        />
      }
    />
  );
}