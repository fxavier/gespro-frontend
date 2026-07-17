'use client';

/**
 * Tabela de projectos — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai
 * importa este wrapper; os dados ProjetoRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface ProjetoRow {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  prioridade: string;
  dataFimPrevista: Date | null;
  progresso: number;
}

const columns: TableColumn<ProjetoRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
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
    render: (row) => (
      <span className="tabular-nums">{row.progresso}%</span>
    ),
    mobileHidden: true,
  },
  {
    key: 'dataFimPrevista',
    label: 'Prazo',
    render: (row) =>
      row.dataFimPrevista
        ? new Date(row.dataFimPrevista).toLocaleDateString('pt-PT')
        : '—',
    mobileHidden: true,
  },
];

interface ProjetosTableProps {
  data: ProjetoRow[];
  nextCursor?: string | null;
}

export function ProjetosTable({ data, nextCursor }: ProjetosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/projetos/lista/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem projectos"
          description="Crie o primeiro projecto para começar a organizar o trabalho da equipa."
        />
      }
    />
  );
}