'use client';

import Link from 'next/link';
import { DataTable, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type VagaRow = {
  id: string;
  codigo: string;
  titulo: string;
  status: string;
  numeroPosicoes: number;
  posicoesPreenchidas: number;
  localizacao: string | null;
  regimeTrabalho: string;
  dataAbertura: Date | null;
  createdAt: Date;
  _count: { candidaturas: number };
};

const COLUMNS: TableColumn<VagaRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <Link
        href={`/rh/recrutamento/vagas/${row.id}`}
        className="font-mono text-sm font-medium text-primary hover:underline"
      >
        {row.codigo}
      </Link>
    ),
  },
  {
    key: 'titulo',
    label: 'Título',
    render: (row) => (
      <div className="max-w-64 truncate font-medium">{row.titulo}</div>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'posicoes',
    label: 'Posições',
    render: (row) => (
      <span className="tabular-nums text-sm">
        {row.posicoesPreenchidas}/{row.numeroPosicoes}
      </span>
    ),
  },
  {
    key: 'candidaturas',
    label: 'Candidaturas',
    render: (row) => (
      <span className="tabular-nums text-sm">{row._count.candidaturas}</span>
    ),
  },
  {
    key: 'localizacao',
    label: 'Localização',
    render: (row) => (
      <span className="text-muted-foreground text-sm">{row.localizacao ?? '—'}</span>
    ),
  },
  {
    key: 'createdAt',
    label: 'Criada',
    render: (row) => (
      <span className="text-muted-foreground text-sm tabular-nums">
        {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true, locale: ptBR })}
      </span>
    ),
  },
];

interface VagasTableProps {
  data: VagaRow[];
  nextCursor: string | null;
}

export function VagasTable({ data, nextCursor }: VagasTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      data={data}
      rowHref={(row) => `/rh/recrutamento/vagas/${row.id}`}
      emptyState={<span className="text-muted-foreground text-sm">Nenhuma vaga encontrada. Crie a primeira vaga de recrutamento.</span>}
      nextCursor={nextCursor}
      cursorParam="cursor"
    />
  );
}
