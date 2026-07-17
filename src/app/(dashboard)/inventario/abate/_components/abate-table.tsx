'use client';

/**
 * Tabela de abate — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai
 * importa este wrapper; os dados AtivoDto são objectos planos e serializam bem.
 */

import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { AtivoDto } from '@/server/services/inventario/ativos.interface';

const columns: TableColumn<AtivoDto>[] = [
  {
    key: 'codigoInterno',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigoInterno}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Ativo',
    render: (row) => (
      <div className="space-y-0.5">
        <div className="font-medium">{row.nome}</div>
        {(row.marca || row.modelo) && (
          <div className="text-xs text-muted-foreground">{[row.marca, row.modelo].filter(Boolean).join(' ')}</div>
        )}
      </div>
    ),
  },
  {
    key: 'valorCompra',
    label: 'Valor Original',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums">
        MT {Number(row.valorCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    ),
  },
  {
    key: 'dataAquisicao',
    label: 'Data Aquisição',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.dataAquisicao).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
];

interface AbateTableProps {
  data: AtivoDto[];
}

export function AbateTable({ data }: AbateTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/inventario/ativos/${row.id}`}
      emptyState={
        <EmptyState
          title="Sem ativos abatidos"
          description="Os ativos com estado BAIXADO aparecerão aqui."
        />
      }
    />
  );
}