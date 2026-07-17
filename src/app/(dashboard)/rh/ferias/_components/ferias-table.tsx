'use client';

/**
 * Tabela de solicitações de férias — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados SolicitacaoRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface SolicitacaoRow {
  id: string;
  colaboradorNome: string;
  dataInicio: Date;
  dataFim: Date;
  diasSolicitados: number;
  tipo: string;
  status: string;
}

const columns: TableColumn<SolicitacaoRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
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
    key: 'diasSolicitados',
    label: 'Dias',
    render: (row) => <span className="tabular-nums">{row.diasSolicitados}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <span className="capitalize">{row.tipo.toLowerCase().replace(/_/g, ' ')}</span>,
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface FeriasTableProps {
  data: SolicitacaoRow[];
  nextCursor?: string | null;
}

export function FeriasTable({ data, nextCursor }: FeriasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem solicitações de férias"
          description="Crie a primeira solicitação para começar a gerir as férias dos colaboradores."
        />
      }
    />
  );
}