'use client';

/**
 * Tabela de tarefas — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados TarefaRow são objectos planos e serializam bem.
 */

import Link from 'next/link';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface TarefaRow {
  id: string;
  codigo: string;
  titulo: string;
  projetoNome: string;
  status: string;
  prioridade: string;
  dataFimPrevista: Date | null;
}

const columns: TableColumn<TarefaRow>[] = [
  {
    key: 'codigo',
    label: 'Cód.',
    render: (row) => (
      <span className="tabular-nums font-mono text-xs text-muted-foreground">{row.codigo}</span>
    ),
  },
  {
    key: 'titulo',
    label: 'Tarefa',
    render: (row) => (
      <Link href={`/projetos/tarefas/${row.id}`} className="font-medium hover:underline line-clamp-1">
        {row.titulo}
      </Link>
    ),
  },
  {
    key: 'projetoNome',
    label: 'Projecto',
    render: (row) => <span className="text-sm">{row.projetoNome}</span>,
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
    key: 'dataFimPrevista',
    label: 'Prazo',
    render: (row) =>
      row.dataFimPrevista
        ? <span className="tabular-nums text-sm">{new Date(row.dataFimPrevista).toLocaleDateString('pt-PT')}</span>
        : <span className="text-muted-foreground">—</span>,
    mobileHidden: true,
  },
];

interface TarefasTableProps {
  data: TarefaRow[];
  nextCursor?: string | null;
}

export function TarefasTable({ data, nextCursor }: TarefasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem tarefas"
          description="Crie a primeira tarefa para começar a organizar o trabalho dos projectos."
        />
      }
    />
  );
}