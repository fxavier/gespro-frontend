'use client';

/**
 * Tabela de equipas — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados EquipaRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface EquipaRow {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  membros: number;
}

const columns: TableColumn<EquipaRow>[] = [
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'descricao',
    label: 'Descrição',
    render: (row) => <span className="text-muted-foreground">{row.descricao ?? '—'}</span>,
    mobileHidden: true,
  },
  {
    key: 'membros',
    label: 'Membros',
    render: (row) => <span className="tabular-nums">{row.membros}</span>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface EquipasTableProps {
  data: EquipaRow[];
  nextCursor?: string | null;
}

export function EquipasTable({ data, nextCursor }: EquipasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem equipas"
          description="Crie a primeira equipa para organizar os membros dos projectos."
        />
      }
    />
  );
}