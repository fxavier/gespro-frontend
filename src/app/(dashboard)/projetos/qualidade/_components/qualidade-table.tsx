'use client';

import { DataTable, type TableColumn } from '@/components/patterns/data-table';
import { StatusBadge } from '@/components/patterns/status-badge';

type RegistoQualidade = {
  id: string;
  tipo: string;
  descricao: string;
  status: string;
  projetoId: string;
  createdAt: Date;
};

const COLUMNS: TableColumn<RegistoQualidade>[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    render: (r) => <StatusBadge status={r.tipo} />,
  },
  {
    key: 'descricao',
    label: 'Descrição',
    render: (r) => (
      <span className="text-sm truncate max-w-xs block" title={r.descricao}>
        {r.descricao}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    render: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {new Date(r.createdAt).toLocaleDateString('pt-MZ')}
      </span>
    ),
    mobileHidden: true,
  },
];

interface QualidadeTableProps {
  data: RegistoQualidade[];
  nextCursor: string | null;
}

export function QualidadeTable({ data, nextCursor }: QualidadeTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      data={data}
      rowHref={(r) => `/projetos/qualidade/${r.id}`}
      nextCursor={nextCursor}
      emptyState={
        <div className="py-12 text-center text-muted-foreground text-sm">
          Nenhum registo de qualidade. Clique em &ldquo;Novo Registo&rdquo; para começar.
        </div>
      }
    />
  );
}
