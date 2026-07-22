'use client';

/**
 * Tabela de estruturas de produto (BOM) — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados EstruturaRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface EstruturaRow {
  id: string;
  codigo: string;
  nome: string;
  versao: string;
  status: string;
  nivelComplexidade: string | null;
}

const columns: TableColumn<EstruturaRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Produto',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'versao',
    label: 'Versão',
    render: (row) => row.versao,
    mobileHidden: true,
  },
  {
    key: 'nivelComplexidade',
    label: 'Complexidade',
    render: (row) => row.nivelComplexidade ? <StatusBadge status={row.nivelComplexidade} /> : <span className="text-muted-foreground">—</span>,
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface EstruturaTableProps {
  data: EstruturaRow[];
  nextCursor?: string | null;
}

export function EstruturaTable({ data, nextCursor }: EstruturaTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/producao/estrutura/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem estruturas de produto"
          description="Crie a primeira estrutura (BOM) para gerir listas de materiais."
        />
      }
    />
  );
}
