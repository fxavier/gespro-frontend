/**
 * Tabela de linhas + rodapé de totais, partilhada pelos detalhes de cotação e
 * proforma. Server Component puro (sem handlers): os dois documentos têm
 * exactamente a mesma grelha, e duplicá-la era a terceira cópia da mesma coisa.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMZN } from '@/lib/format-currency';

export interface LinhaDocumento {
  id: string;
  descricao: string;
  quantidade: string;
  precoUnitario: string;
  desconto: string;
  taxaIva: string;
  total: string;
}

interface Props {
  linhas: LinhaDocumento[];
  subtotal: string;
  descontoTotal: string;
  ivaTotal: string;
  total: string;
}

const num = (v: string) => Number(v ?? '0');

export function LinhasDocumento({ linhas, subtotal, descontoTotal, ivaTotal, total }: Props) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Qtd.</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Preço Unit.</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Desc.</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">IVA</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.id} className="h-10">
                <TableCell className="font-medium">{linha.descricao}</TableCell>
                <TableCell className="text-right tabular-nums">{num(linha.quantidade)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMZN(linha.precoUnitario)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMZN(linha.desconto)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {num(linha.taxaIva)}%
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMZN(linha.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t bg-muted/30 px-4 py-3 space-y-1">
        <div className="flex justify-end gap-8 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums w-40 text-right">{formatMZN(subtotal)}</span>
        </div>
        <div className="flex justify-end gap-8 text-sm">
          <span className="text-muted-foreground">Desconto</span>
          <span className="tabular-nums w-40 text-right">{formatMZN(descontoTotal)}</span>
        </div>
        <div className="flex justify-end gap-8 text-sm">
          <span className="text-muted-foreground">IVA</span>
          <span className="tabular-nums w-40 text-right">{formatMZN(ivaTotal)}</span>
        </div>
        <div className="flex justify-end gap-8 pt-1 border-t mt-1">
          <span className="font-semibold">Total</span>
          <span className="tabular-nums w-40 text-right text-lg font-bold">{formatMZN(total)}</span>
        </div>
      </div>
    </div>
  );
}
