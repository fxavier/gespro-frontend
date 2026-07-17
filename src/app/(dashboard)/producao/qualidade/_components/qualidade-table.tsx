'use client';

/**
 * Tabela de controlo de qualidade — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados QualidadeRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface QualidadeRow {
  id: string;
  numero: string;
  nomeProduto: string;
  quantidade: number;
  progresso: number;
  qualidadeAprovada: boolean;
  status: string;
  dataFimReal: Date | null;
}

const columns: TableColumn<QualidadeRow>[] = [
  {
    key: 'numero',
    label: 'Nº Ordem',
    render: (row) => <span className="tabular-nums font-mono text-xs">{row.numero}</span>,
  },
  {
    key: 'nomeProduto',
    label: 'Produto',
    render: (row) => <span className="font-medium">{row.nomeProduto}</span>,
  },
  {
    key: 'quantidade',
    label: 'Qtd. Prevista',
    render: (row) => <span className="tabular-nums">{row.quantidade}</span>,
    mobileHidden: true,
  },
  {
    key: 'progresso',
    label: 'Progresso',
    render: (row) => <span className="tabular-nums font-medium">{row.progresso}%</span>,
  },
  {
    key: 'qualidadeAprovada',
    label: 'Qualidade',
    render: (row) => <StatusBadge status={row.qualidadeAprovada ? 'APROVADA' : 'PENDENTE'} />,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'dataFimReal',
    label: 'Conclusão',
    render: (row) =>
      row.dataFimReal
        ? <span className="tabular-nums text-sm">{new Date(row.dataFimReal).toLocaleDateString('pt-PT')}</span>
        : <span className="text-muted-foreground">—</span>,
    mobileHidden: true,
  },
];

interface QualidadeTableProps {
  data: QualidadeRow[];
  nextCursor?: string | null;
}

export function QualidadeTable({ data, nextCursor }: QualidadeTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem ordens para avaliar"
          description="Não existem ordens de produção para controlo de qualidade."
        />
      }
    />
  );
}
