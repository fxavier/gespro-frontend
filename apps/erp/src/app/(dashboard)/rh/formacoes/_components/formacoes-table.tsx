'use client';

/**
 * Tabela de formações — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados FormacaoRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface FormacaoRow {
  id: string;
  titulo: string;
  status: string;
  dataInicio: Date;
  dataFim: Date;
  vagasDisponiveis: number;
  participantes: number;
}

const columns: TableColumn<FormacaoRow>[] = [
  {
    key: 'titulo',
    label: 'Título',
    render: (row) => <span className="font-medium">{row.titulo}</span>,
  },
  {
    key: 'dataInicio',
    label: 'Início',
    render: (row) => new Date(row.dataInicio).toLocaleDateString('pt-PT'),
  },
  {
    key: 'dataFim',
    label: 'Fim',
    render: (row) => new Date(row.dataFim).toLocaleDateString('pt-PT'),
    mobileHidden: true,
  },
  {
    key: 'participantes',
    label: 'Participantes',
    render: (row) => (
      <span className="tabular-nums">
        {row.participantes}/{row.vagasDisponiveis}
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

interface FormacoesTableProps {
  data: FormacaoRow[];
  nextCursor?: string | null;
}

export function FormacoesTable({ data, nextCursor }: FormacoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/rh/formacoes/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem formações"
          description="Crie a primeira formação para começar a planear o desenvolvimento dos colaboradores."
        />
      }
    />
  );
}