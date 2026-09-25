import type { TaxaIva } from '@/lib/iva';

export interface LinhaCalculo {
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: TaxaIva;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

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
  const base = round2(l.quantidade * l.precoUnitario - l.desconto);
  const iva = round2(base * l.taxaIva);
  const total = round2(base + iva);
  return { base, iva, total };
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
