/**
 * Refinements Zod para documentos de identidade e dados moçambicanos.
 * Partilhado entre cliente e servidor — sem `server-only`.
 */
import { z } from 'zod';
import { validarNUIT } from '../validacao-nuit';
import { validarBI } from '../validacao-bi';

/**
 * NUIT — Número Único de Identificação Tributária (9 dígitos, não todos iguais).
 *
 * @example
 *   const schema = z.object({ nuit: nuit() })
 *   schema.parse({ nuit: '123456789' }) // ok
 *   schema.parse({ nuit: '111111111' }) // throws
 */
export function nuit() {
  return z
    .string({ required_error: 'NUIT é obrigatório' })
    .regex(/^\d{9}$/, 'NUIT deve ter exactamente 9 dígitos')
    .refine(validarNUIT, { message: 'NUIT inválido' });
}

/**
 * BI moçambicano — 12 dígitos seguidos de uma letra maiúscula (ex: 110100123456A).
 *
 * @example
 *   const schema = z.object({ bi: biMocambicano() })
 *   schema.parse({ bi: '110100123456A' }) // ok
 */
export function biMocambicano() {
  return z
    .string({ required_error: 'Bilhete de Identidade é obrigatório' })
    .refine(validarBI, {
      message: 'BI inválido — formato esperado: 12 dígitos seguidos de uma letra (ex: 110100123456A)',
    });
}

/**
 * Email corporativo (alias de z.string().email() com mensagem em português).
 */
export function emailMz() {
  return z
    .string({ required_error: 'Email é obrigatório' })
    .email('Email inválido');
}

/**
 * Telefone moçambicano — 8 ou 9 dígitos, começando por 8 (redes móveis) ou 2 (fixo).
 * Aceita com ou sem código de país (+258).
 */
export function telefoneMz() {
  return z
    .string({ required_error: 'Número de telefone é obrigatório' })
    .refine(
      (v) => {
        const limpo = v.replace(/[\s\-\(\)]/g, '').replace(/^\+258/, '');
        return /^[28]\d{7,8}$/.test(limpo);
      },
      { message: 'Número de telefone moçambicano inválido (ex: 84 123 4567 ou +258 84 123 4567)' },
    );
}
