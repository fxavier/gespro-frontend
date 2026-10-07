import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';

/**
 * Opção da combobox «Factura a creditar» (#258): começa pelo número, que é o que se pesquisa,
 * e mostra o saldo creditável (#86, #266) — o que ainda se pode creditar, não o total.
 */
export function rotuloFaturaCreditavel(f: {
  numero: string;
  dataEmissao: Date;
  saldoCreditavel: { toString(): string };
}): string {
  return `${f.numero} · ${formatarData(f.dataEmissao)} · saldo ${formatMZN(f.saldoCreditavel.toString())}`;
}
