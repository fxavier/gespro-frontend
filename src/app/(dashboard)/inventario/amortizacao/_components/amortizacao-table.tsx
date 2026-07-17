'use client';

/**
 * Tabela de amortização — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render`/`rowHref` VIVEM SEMPRE num
 * módulo Client Component. Funções não serializam para o servidor ("Functions
 * cannot be passed directly to Client Components"). O Server Component pai
 * importa este wrapper; os dados AtivoDto são objectos planos e serializam bem.
 */

import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { AtivoDto } from '@/server/services/inventario/ativos.interface';

const METODO_LABELS: Record<string, string> = {
  LINEAR: 'Linear',
  DIGITOS_ANOS: 'Dígitos dos Anos',
  UNIDADES_PRODUCAO: 'Unidades de Produção',
  SALDOS_DECRESCENTES: 'Saldos Decrescentes',
};

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
      <div className="font-medium">{row.nome}</div>
    ),
  },
  {
    key: 'valorCompra',
    label: 'Valor Original',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        MT {Number(row.valorCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    ),
  },
  {
    key: 'valorLiquidoContabilistico',
    label: 'Valor Líquido',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        {row.valorLiquidoContabilistico
          ? `MT ${Number(row.valorLiquidoContabilistico).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : '—'}
      </span>
    ),
  },
  {
    key: 'percentualAmortizado',
    label: 'Amortizado',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">
        {row.percentualAmortizado
          ? `${Number(row.percentualAmortizado).toFixed(1)}%`
          : '—'}
      </span>
    ),
  },
  {
    key: 'metodoAmortizacao',
    label: 'Método',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {METODO_LABELS[row.metodoAmortizacao] ?? row.metodoAmortizacao}
      </span>
    ),
  },
  {
    key: 'vidaUtilAnos',
    label: 'Vida Útil',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">{row.vidaUtilAnos}a</span>
    ),
  },
];

interface AmortizacaoTableProps {
  data: AtivoDto[];
  nextCursor?: string | null;
}

export function AmortizacaoTable({ data, nextCursor }: AmortizacaoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/inventario/ativos/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem ativos para amortizar"
          description="Os ativos em uso com planos de amortização aparecerão aqui."
        />
      }
    />
  );
}