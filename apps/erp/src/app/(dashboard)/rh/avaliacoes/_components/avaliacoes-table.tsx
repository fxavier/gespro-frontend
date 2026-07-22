'use client';

/**
 * Tabela de avaliações de desempenho — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados AvaliacaoRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface AvaliacaoRow {
  id: string;
  colaboradorNome: string;
  avaliadorNome: string;
  tipo: string;
  periodo: string;
  notaFinal: number | null;
  status: string;
  dataInicio: Date;
}

const TIPO_LABEL: Record<string, string> = {
  DESEMPENHO: 'Desempenho',
  COMPETENCIAS: 'Competências',
  GRAU_360: 'Avaliação 360°',
  PROBATORIO: 'Período Probatório',
};

const columns: TableColumn<AvaliacaoRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'avaliadorNome',
    label: 'Avaliador',
    render: (row) => row.avaliadorNome,
    mobileHidden: true,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => TIPO_LABEL[row.tipo] ?? row.tipo,
    mobileHidden: true,
  },
  {
    key: 'periodo',
    label: 'Período',
    render: (row) => row.periodo,
  },
  {
    key: 'notaFinal',
    label: 'Nota Final',
    render: (row) =>
      row.notaFinal !== null ? (
        <span className="tabular-nums font-medium">{Number(row.notaFinal).toFixed(1)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface AvaliacoesTableProps {
  data: AvaliacaoRow[];
  nextCursor?: string | null;
}

export function AvaliacoesTable({ data, nextCursor }: AvaliacoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/rh/avaliacoes/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem avaliações"
          description="Crie a primeira avaliação para começar a acompanhar o desempenho dos colaboradores."
        />
      }
    />
  );
}