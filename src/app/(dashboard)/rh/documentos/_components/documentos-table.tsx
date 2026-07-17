'use client';

/**
 * Tabela de documentos dos colaboradores — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados DocRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface DocRow {
  id: string;
  colaboradorNome: string;
  tipo: string;
  nome: string;
  dataUpload: string;
}

const columns: TableColumn<DocRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
  },
  {
    key: 'nome',
    label: 'Ficheiro',
    render: (row) => <span className="text-sm text-muted-foreground">{row.nome}</span>,
    mobileHidden: true,
  },
  {
    key: 'dataUpload',
    label: 'Data Upload',
    render: (row) => <span className="tabular-nums">{row.dataUpload}</span>,
    mobileHidden: true,
  },
];

interface DocumentosTableProps {
  data: DocRow[];
  nextCursor?: string | null;
}

export function DocumentosTable({ data, nextCursor }: DocumentosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem documentos"
          description="Os documentos carregados via ficha do colaborador aparecerão aqui."
        />
      }
    />
  );
}