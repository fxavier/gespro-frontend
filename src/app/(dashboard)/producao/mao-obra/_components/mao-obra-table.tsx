'use client';

/**
 * Tabela de mão de obra — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados AssiduidadeRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface AssiduidadeRow {
  id: string;
  colaboradorNome: string;
  data: Date;
  tipo: string;
  horasTrabalhadas: string;
  horasExtras: string;
  atrasos: number;
}

const columns: TableColumn<AssiduidadeRow>[] = [
  {
    key: 'data',
    label: 'Data',
    render: (row) => (
      <span className="tabular-nums">{new Date(row.data).toLocaleDateString('pt-PT')}</span>
    ),
  },
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
    mobileHidden: true,
  },
  {
    key: 'horasTrabalhadas',
    label: 'H. Trabalhadas',
    render: (row) => <span className="tabular-nums">{row.horasTrabalhadas}h</span>,
    mobileHidden: true,
  },
  {
    key: 'horasExtras',
    label: 'H. Extras',
    render: (row) => <span className="tabular-nums">{row.horasExtras}h</span>,
    mobileHidden: true,
  },
  {
    key: 'atrasos',
    label: 'Atrasos',
    render: (row) => <span className="tabular-nums">{row.atrasos} min</span>,
  },
];

interface MaoObraTableProps {
  data: AssiduidadeRow[];
  nextCursor?: string | null;
}

export function MaoObraTable({ data, nextCursor }: MaoObraTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem registos de mão de obra"
          description="Registe a assiduidade dos colaboradores para acompanhar a produção."
        />
      }
    />
  );
}
