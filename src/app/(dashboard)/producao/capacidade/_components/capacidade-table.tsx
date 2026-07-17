'use client';

/**
 * Tabela de capacidade produtiva — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados CentroRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface CentroRow {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  capacidadeHorasDia: string | null;
  custoHora: string;
  ativo: boolean;
  operacoesActivas: number;
}

const columns: TableColumn<CentroRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => <span className="tabular-nums font-mono text-xs">{row.codigo}</span>,
  },
  {
    key: 'nome',
    label: 'Centro de Trabalho',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
    mobileHidden: true,
  },
  {
    key: 'capacidadeHorasDia',
    label: 'Cap. (h/dia)',
    render: (row) => (
      <span className="tabular-nums">
        {row.capacidadeHorasDia ? `${row.capacidadeHorasDia}h` : '—'}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'custoHora',
    label: 'Custo/Hora',
    render: (row) => <span className="tabular-nums">MT {row.custoHora}</span>,
    mobileHidden: true,
  },
  {
    key: 'operacoesActivas',
    label: 'Operações Activas',
    render: (row) => <span className="tabular-nums">{row.operacoesActivas}</span>,
    mobileHidden: true,
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />,
  },
];

interface CapacidadeTableProps {
  data: CentroRow[];
  nextCursor?: string | null;
}

export function CapacidadeTable({ data, nextCursor }: CapacidadeTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem centros de trabalho"
          description="Registe centros de trabalho para gerir a capacidade produtiva."
        />
      }
    />
  );
}
