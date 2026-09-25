/**
 * ESQUELETO DO ORÁCULO (issue #77, nó N1) — POR IMPLEMENTAR.
 *
 * Criado pelo verificador só com as assinaturas da especificação, para que os
 * testes compilem e falhem na asserção. O autor reescreve este ficheiro.
 */
import type { z } from 'zod';

export const TAXAS_IVA = [0, 0.16] as const;
export type TaxaIva = (typeof TAXAS_IVA)[number];
export const TAXA_IVA_NORMAL: TaxaIva = 0.16;
export const ROTULOS_TAXA_IVA: Record<`${TaxaIva}`, string> = { '0': '0% (isento)', '0.16': '16%' };
export const MENSAGEM_TAXA_IVA_INVALIDA = 'Taxa de IVA inválida — use 0.16 (16%) ou 0 (isento)';

export function lerTaxaIva(_v: unknown): TaxaIva {
  throw new Error('por implementar');
}

export function taxaIvaSchema(_mensagem?: string): z.ZodType<TaxaIva> {
  throw new Error('por implementar');
}
