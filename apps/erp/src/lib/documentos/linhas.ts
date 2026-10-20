import { Prisma } from '@prisma/client';
import type { TaxaIva } from '@/lib/iva';
import { arredondarLinha } from '@/lib/vendas-totais';

export interface LinhaCalculo {
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: TaxaIva;
}

/**
 * Calcula os valores de uma linha de documento.
 *
 * base  = round2(q × p − d)
 * iva   = round2(base × taxa)
 * total = round2(base + iva)
 *
 * Deve produzir exactamente os mesmos valores que o transform de
 * LinhaDocumentoSchema em validations/faturacao.ts (mostrado = gravado).
 */
export function calcularLinha(l: LinhaCalculo): { base: number; iva: number; total: number } {
  const r = arredondarLinha(
    new Prisma.Decimal(String(l.quantidade)).mul(String(l.precoUnitario)).minus(String(l.desconto)),
    l.taxaIva,
  );
  return { base: r.subtotal.toNumber(), iva: r.ivaItem.toNumber(), total: r.total.toNumber() };
}

/**
 * Soma das linhas arredondadas (cada linha calculada por calcularLinha).
 */
export function calcularTotais(linhas: LinhaCalculo[]): { base: number; iva: number; total: number } {
  return linhas
    .map(calcularLinha)
    .reduce(
      (a, r) => ({ base: a.base + r.base, iva: a.iva + r.iva, total: a.total + r.total }),
      { base: 0, iva: 0, total: 0 },
    );
}
