'use client';

/**
 * Movimentos de uma sessão de caixa — CLIENT COMPONENT.
 * Colunas com funções render VIVEM aqui (regra golden standard).
 *
 * O sinal de cada linha é apresentação: os totais autoritativos vêm do
 * `resumoSessao` no servidor. A classificação abaixo espelha a que lá está
 * (caixa.service.ts, `resumoSessao`) — se um tipo novo aparecer, muda nos dois.
 */

import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarDataHora } from '@/lib/format-date';
import { MOVIMENTOS_ENTRADA, MOVIMENTOS_SAIDA } from '@/lib/caixa-movimentos';

export interface MovimentoCaixaResumo {
  id: string;
  tipo: string;
  valor: string;
  descricao: string;
  observacoes: string | null;
  dataMovimento: string;
}

export const TIPO_MOVIMENTO_LABEL: Record<string, string> = {
  ABERTURA: 'Abertura',
  VENDA: 'Venda',
  RECEBIMENTO: 'Recebimento',
  SANGRIA: 'Sangria',
  REFORCO: 'Reforço',
  DEVOLUCAO: 'Devolução',
  FECHAMENTO: 'Fecho',
  AJUSTE: 'Ajuste',
  PAGAMENTO: 'Pagamento',
};

/** Tipos que contam como saída (espelha caixa.service.ts resumoSessao/fecharSessao). */
const SAIDAS = new Set<string>(MOVIMENTOS_SAIDA);
const ENTRADAS = new Set<string>(MOVIMENTOS_ENTRADA);

const columns: TableColumn<MovimentoCaixaResumo>[] = [
  {
    key: 'dataMovimento',
    label: 'Data',
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {formatarDataHora(row.dataMovimento)}
      </span>
    ),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => (
      <span className="font-medium">{TIPO_MOVIMENTO_LABEL[row.tipo] ?? row.tipo}</span>
    ),
  },
  {
    key: 'descricao',
    label: 'Descrição',
    render: (row) => (
      <div className="min-w-0">
        <p className="truncate">{row.descricao}</p>
        {row.observacoes && (
          <p className="truncate text-xs text-muted-foreground">{row.observacoes}</p>
        )}
      </div>
    ),
  },
  {
    key: 'valor',
    label: 'Valor',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => {
      const cor = SAIDAS.has(row.tipo)
        ? 'text-destructive'
        : ENTRADAS.has(row.tipo)
          ? 'text-success'
          : 'text-foreground';
      const sinal = SAIDAS.has(row.tipo) ? '−' : ENTRADAS.has(row.tipo) ? '+' : '';
      return (
        <span className={`tabular-nums font-medium ${cor}`}>
          {sinal}
          {formatMZN(row.valor)}
        </span>
      );
    },
  },
];

export function MovimentosTable({ data }: { data: MovimentoCaixaResumo[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      emptyState={
        <EmptyState
          title="Sem movimentos"
          description="Esta sessão ainda não registou entradas nem saídas."
        />
      }
    />
  );
}
