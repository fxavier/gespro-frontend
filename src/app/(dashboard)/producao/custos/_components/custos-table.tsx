'use client';

/**
 * Tabela de custos de produção — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados CustoOrdemRow são objectos planos e serializam bem.
 */

import Link from 'next/link';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface CustoOrdemRow {
  id: string;
  numero: string;
  nomeProduto: string;
  quantidade: number;
  unidadeMedida: string;
  custoEstimado: string;
  status: string;
  dataPrevisaoFim: Date;
}

const columns: TableColumn<CustoOrdemRow>[] = [
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
    label: 'Qtd.',
    render: (row) => (
      <span className="tabular-nums">{row.quantidade} {row.unidadeMedida}</span>
    ),
    mobileHidden: true,
  },
  {
    key: 'custoEstimado',
    label: 'Custo Estimado',
    render: (row) => <span className="tabular-nums font-medium">MT {row.custoEstimado}</span>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'dataPrevisaoFim',
    label: 'Prazo',
    render: (row) => (
      <span className="tabular-nums text-sm">
        {new Date(row.dataPrevisaoFim).toLocaleDateString('pt-PT')}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'accoes',
    label: '',
    render: (row) => (
      <Link
        href={`/producao/ordens/${row.id}`}
        className="text-xs text-primary hover:underline"
      >
        Ver detalhes
      </Link>
    ),
  },
];

interface CustosTableProps {
  data: CustoOrdemRow[];
  nextCursor?: string | null;
}

export function CustosTable({ data, nextCursor }: CustosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem ordens de produção"
          description="Ainda não existem ordens para analisar custos."
        />
      }
    />
  );
}