import { z } from 'zod';

export const TAXAS_IVA = [0, 0.16] as const;
export type TaxaIva = (typeof TAXAS_IVA)[number];
export const TAXA_IVA_NORMAL: TaxaIva = 0.16;
export const ROTULOS_TAXA_IVA: Record<`${TaxaIva}`, string> = { '0': '0% (isento)', '0.16': '16%' };
export const MENSAGEM_TAXA_IVA_INVALIDA = 'Taxa de IVA inválida — use 0.16 (16%) ou 0 (isento)';

/** Guarda de tipo: verifica se `v` é um valor válido de `TaxaIva`. */
export function ehTaxaIva(v: unknown): v is TaxaIva {
  return typeof v === 'number' && (TAXAS_IVA as readonly number[]).includes(v);
}

/**
 * Lê uma taxa de IVA de um valor desconhecido.
 *
 * Aceita número ou string numérica (com trim). Recusa '', só espaços, null,
 * undefined, NaN e qualquer valor fora de TAXAS_IVA. Nunca devolve omissão.
 */
export function lerTaxaIva(v: unknown): TaxaIva {
  if (v === null || v === undefined) {
    throw new Error(MENSAGEM_TAXA_IVA_INVALIDA);
  }
  let n: number;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') {
      throw new Error(MENSAGEM_TAXA_IVA_INVALIDA);
    }
    n = Number(trimmed);
  } else if (typeof v === 'number') {
    n = v;
  } else {
    throw new Error(MENSAGEM_TAXA_IVA_INVALIDA);
  }
  if (Number.isNaN(n) || !ehTaxaIva(n)) {
    throw new Error(MENSAGEM_TAXA_IVA_INVALIDA);
  }
  return n;
}

/**
 * Schema Zod para a taxa de IVA.
 *
 * Aceita os mesmos valores que `lerTaxaIva`. Recusa '' antes de converter
 * (z.coerce.number() converteria '' em 0, que seria válido). Sem .default().
 * Acrescentar 0.05 no futuro requer só alterar TAXAS_IVA e ROTULOS_TAXA_IVA.
 */
export function taxaIvaSchema(
  mensagem = MENSAGEM_TAXA_IVA_INVALIDA,
): z.ZodType<number, z.ZodTypeDef, unknown> {
  return z.preprocess(
    (v) => {
      if (v === null || v === undefined) return v;
      if (typeof v === 'string') {
        const t = v.trim();
        // Mantém como string vazia para que z.number rejeite com invalid_type_error
        if (t === '') return v;
        return Number(t);
      }
      return v;
    },
    z
      .number({ required_error: mensagem, invalid_type_error: mensagem })
      .refine((n): n is TaxaIva => ehTaxaIva(n), mensagem),
  ) as z.ZodType<number, z.ZodTypeDef, unknown>;
}
