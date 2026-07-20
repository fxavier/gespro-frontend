'use client';

import { DataTable, type TableColumn } from '@/components/patterns/data-table';
import { StatusBadge } from '@/components/patterns/status-badge';

type Comunicacao = {
  id: string;
  tipo: string;
  data: Date;
  participantes: string[];
  resumo: string;
  projetoId: string;
  createdAt: Date;
};

const COLUMNS: TableColumn<Comunicacao>[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    render: (r) => <StatusBadge status={r.tipo} />,
  },
  {
    key: 'data',
    label: 'Data',
    render: (r) => (
      <span className="text-sm tabular-nums">
        {new Date(r.data).toLocaleDateString('pt-MZ')}
      </span>
    ),
  },
  {
    key: 'resumo',
    label: 'Resumo',
    render: (r) => (
      <span className="text-sm truncate max-w-xs block" title={r.resumo}>
        {r.resumo}
      </span>
    ),
  },
  {
    key: 'participantes',
    label: 'Participantes',
    render: (r) => (
      <span className="text-xs text-muted-foreground">
        {r.participantes.length} participante(s)
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'createdAt',
    label: 'Registado em',
    render: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {new Date(r.createdAt).toLocaleDateString('pt-MZ')}
      </span>
    ),
    mobileHidden: true,
  },
];

interface ComunicacoesTableProps {
  data: Comunicacao[];
  nextCursor: string | null;
}

export function ComunicacoesTable({ data, nextCursor }: ComunicacoesTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      data={data}
      rowHref={(r) => `/projetos/comunicacoes/${r.id}`}
      nextCursor={nextCursor}
      emptyState={
        <div className="py-12 text-center text-muted-foreground text-sm">
          Nenhuma comunicação registada. Clique em &ldquo;Nova Comunicação&rdquo; para começar.
        </div>
      }
    />
  );
}
