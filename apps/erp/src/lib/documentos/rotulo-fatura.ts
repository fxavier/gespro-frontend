import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';

/** Opção da combobox «Factura a creditar» (#258): começa pelo número, que é o que se pesquisa. */
export function rotuloFaturaCreditavel(f: { numero: string; dataEmissao: Date; total: { toString(): string } }): string {
  return `${f.numero} · ${formatarData(f.dataEmissao)} · ${formatMZN(f.total.toString())}`;
}
