'use client';

/**
 * Tabela de planeamento da produção — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados OrdemRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface OrdemRow {
  id: string;
  numero: string;
  nomeProduto: string;
  quantidade: number;
  unidadeMedida: string;
  prioridade: string;
  status: string;
  dataPrevisaoInicio: Date;
  dataPrevisaoFim: Date;
}

const columns: TableColumn<OrdemRow>[] = [
  {
    key: 'numero',
    label: 'Número',
    render: (row) => <span className="tabular-nums font-mono text-xs">{row.numero}</span>,
  },
  {
    key: 'nomeProduto',
    label: 'Produto',
    render: (row) => <span className="font-medium">{row.nomeProduto}</span>,
  },
  {
    key: 'quantidade',
    label: 'Qtd.',
    render: (row) => (
      <span className="tabular-nums">
        {row.quantidade} {row.unidadeMedida}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    render: (row) => <StatusBadge status={row.prioridade} />,
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'dataPrevisaoInicio',
    label: 'Início Prev.',
    render: (row) => (
      <span className="tabular-nums text-sm">
        {new Date(row.dataPrevisaoInicio).toLocaleDateString('pt-PT')}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'dataPrevisaoFim',
    label: 'Fim Prev.',
    render: (row) => (
      <span className="tabular-nums text-sm">
        {new Date(row.dataPrevisaoFim).toLocaleDateString('pt-PT')}
      </span>
    ),
    mobileHidden: true,
  },
];

interface PlaneamentoTableProps {
  data: OrdemRow[];
  nextCursor?: string | null;
}

export function PlaneamentoTable({ data, nextCursor }: PlaneamentoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem ordens em planeamento"
          description="Crie uma ordem de produção para começar a planear o fabrico."
        />
      }
    />
  );
}