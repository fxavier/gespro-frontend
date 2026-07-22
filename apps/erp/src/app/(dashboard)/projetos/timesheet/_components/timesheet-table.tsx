'use client';

/**
 * Tabela de timesheet — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados TimesheetRow são objectos planos e serializam bem.
 */

import { Badge } from '@/components/ui/badge';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface TimesheetRow {
  id: string;
  projetoNome: string;
  colaboradorNome: string;
  data: Date;
  duracaoHoras: string;
  tipo: string;
  faturavel: boolean;
  aprovado: boolean;
}

const columns: TableColumn<TimesheetRow>[] = [
  {
    key: 'data',
    label: 'Data',
    render: (row) => (
      <span className="tabular-nums">
        {new Date(row.data).toLocaleDateString('pt-PT')}
      </span>
    ),
  },
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'projetoNome',
    label: 'Projecto',
    render: (row) => row.projetoNome,
    mobileHidden: true,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => (
      <span className="capitalize text-sm">
        {row.tipo.toLowerCase().replace(/_/g, ' ')}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'duracaoHoras',
    label: 'Duração',
    render: (row) => <span className="tabular-nums">{row.duracaoHoras}h</span>,
  },
  {
    key: 'faturavel',
    label: 'Facturável',
    render: (row) => (
      <Badge variant={row.faturavel ? 'default' : 'secondary'}>
        {row.faturavel ? 'Sim' : 'Não'}
      </Badge>
    ),
    mobileHidden: true,
  },
  {
    key: 'aprovado',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.aprovado ? 'APROVADO' : 'PENDENTE'} />,
  },
];

interface TimesheetTableProps {
  data: TimesheetRow[];
  nextCursor?: string | null;
}

export function TimesheetTable({ data, nextCursor }: TimesheetTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem registos de tempo"
          description="Registe o primeiro tempo para começar a acompanhar as horas por projecto."
        />
      }
    />
  );
}