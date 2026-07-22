'use client';

/**
 * Tabela de ordens de produção — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados OrdemRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface OrdemRow {
  id: string;
  numero: string;
  nomeProduto: string;
  status: string;
  prioridade: string;
  progresso: number;
  dataPrevisaoFim: Date | null;
}

const columns: TableColumn<OrdemRow>[] = [
  {
    key: 'numero',
    label: 'Nº Ordem',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'nomeProduto',
    label: 'Produto',
    render: (row) => <span className="font-medium">{row.nomeProduto}</span>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    render: (row) => <StatusBadge status={row.prioridade} />,
    mobileHidden: true,
  },
  {
    key: 'progresso',
    label: 'Progresso',
    render: (row) => <span className="tabular-nums">{row.progresso}%</span>,
    mobileHidden: true,
  },
  {
    key: 'dataPrevisaoFim',
    label: 'Prazo',
    render: (row) =>
      row.dataPrevisaoFim
        ? new Date(row.dataPrevisaoFim).toLocaleDateString('pt-PT')
        : '—',
    mobileHidden: true,
  },
];

interface OrdensTableProps {
  data: OrdemRow[];
  nextCursor?: string | null;
}

export function OrdensTable({ data, nextCursor }: OrdensTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/producao/ordens/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem ordens de produção"
          description="Crie a primeira ordem de fabrico para começar."
        />
      }
    />
  );
}
