'use client';

/**
 * Tabela de roteiros de produção — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados RoteiroRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface RoteiroRow {
  id: string;
  codigo: string;
  nome: string;
  versao: string;
  status: string;
  categoria: string | null;
}

const columns: TableColumn<RoteiroRow>[] = [
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
    key: 'versao',
    label: 'Versão',
    render: (row) => row.versao,
    mobileHidden: true,
  },
  {
    key: 'categoria',
    label: 'Categoria',
    render: (row) => <span className="text-muted-foreground">{row.categoria ?? '—'}</span>,
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface RoteirosTableProps {
  data: RoteiroRow[];
  nextCursor?: string | null;
}

export function RoteirosTable({ data, nextCursor }: RoteirosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/producao/roteiros/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem roteiros de produção"
          description="Crie o primeiro roteiro para definir processos e operações."
        />
      }
    />
  );
}
