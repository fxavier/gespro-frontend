'use client';

import { StatusBadge, type TableColumn } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import type { MovimentoLinha } from '../../_lib/tipos';

/** Valor com o sentido à vista: + entra na conta (DEBITO), − sai (CREDITO). */
export function Valor({ m }: { m: Pick<MovimentoLinha, 'valor' | 'natureza'> }) {
  const entrada = m.natureza === 'DEBITO';
  return (
    <span className={entrada ? 'tabular-nums' : 'tabular-nums text-destructive'}>
      {entrada ? '+' : '−'} {formatMZN(m.valor)}
    </span>
  );
}

export const colunasMovimento: TableColumn<MovimentoLinha>[] = [
  { key: 'data', label: 'Data', className: 'tabular-nums whitespace-nowrap', render: (m) => formatarData(m.data) },
  {
    key: 'referencia', label: 'Referência', mobileHidden: true,
    render: (m) => m.referencia ?? <span className="text-muted-foreground">—</span>,
  },
  { key: 'descricao', label: 'Descrição', render: (m) => <span className="line-clamp-2">{m.descricao}</span> },
  { key: 'valor', label: 'Valor', className: 'text-right', headerClassName: 'text-right', render: (m) => <Valor m={m} /> },
  { key: 'estado', label: 'Estado', mobileHidden: true, render: (m) => <StatusBadge status={m.estado} /> },
];
