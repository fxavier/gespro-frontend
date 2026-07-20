'use client';

/**
 * Tabela de assiduidade — CLIENT COMPONENT.
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
  data: string;
  entrada: string;
  saida: string;
  horasTrabalhadas: string;
  horasExtras: string;
  tipo: string;
}

const columns: TableColumn<AssiduidadeRow>[] = [
  {
    key: 'data',
    label: 'Data',
    render: (row) => <span className="tabular-nums">{row.data}</span>,
  },
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'entrada',
    label: 'Entrada',
    render: (row) => <span className="tabular-nums">{row.entrada}</span>,
    mobileHidden: true,
  },
  {
    key: 'saida',
    label: 'Saída',
    render: (row) => <span className="tabular-nums">{row.saida}</span>,
    mobileHidden: true,
  },
  {
    key: 'horasTrabalhadas',
    label: 'Horas Trabalhadas',
    render: (row) => <span className="tabular-nums">{row.horasTrabalhadas}h</span>,
    mobileHidden: true,
  },
  {
    key: 'horasExtras',
    label: 'Horas Extra',
    render: (row) => (
      <span className={`tabular-nums ${Number(row.horasExtras) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
        {Number(row.horasExtras) > 0 ? `+${row.horasExtras}h` : '—'}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
  },
];

interface AssiduidadeTableProps {
  data: AssiduidadeRow[];
  nextCursor?: string | null;
}

export function AssiduidadeTable({ data, nextCursor }: AssiduidadeTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/rh/assiduidade/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem registos de assiduidade"
          description="Registe a primeira presença para começar a controlar horários."
        />
      }
    />
  );
}