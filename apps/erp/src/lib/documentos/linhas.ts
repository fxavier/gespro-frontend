/**
 * ESQUELETO DO ORÁCULO (issue #77, nó N1) — POR IMPLEMENTAR.
 *
 * Criado pelo verificador só com as assinaturas da especificação, para que os
 * testes compilem e falhem na asserção. O autor reescreve este ficheiro.
 */
import type { TaxaIva } from '@/lib/iva';

export interface LinhaCalculo {
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: TaxaIva;
}

export function calcularLinha(_l: LinhaCalculo): { base: number; iva: number; total: number } {
  throw new Error('por implementar');
}

export function calcularTotais(_linhas: LinhaCalculo[]): { base: number; iva: number; total: number } {
  throw new Error('por implementar');
}
