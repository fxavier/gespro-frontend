/**
 * Helpers de validação comuns a vários módulos (WS C, WS B, etc.).
 * Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
 *
 * Exporta:
 *  - nuit()          — Zod schema para NUIT moçambicano (9 dígitos)
 *  - biMocambicano() — Zod schema para BI moçambicano (12 dígitos + letra)
 *  - provinciaSchema — Zod enum das 11 províncias de Moçambique
 *  - PROVINCIAS_MZ   — array das províncias (para uso em UI/seed)
 */

import { z } from 'zod';
import { validarNUIT } from '@/lib/validacao-nuit';
import { validarBI } from '@/lib/validacao-bi';
import { getProvincias } from '@/lib/provincias-mocambique';

// ---------------------------------------------------------------------------
// NUIT
// ---------------------------------------------------------------------------

/**
 * Retorna um Zod schema que valida NUIT moçambicano (9 dígitos, não todos iguais).
 * Uso: `nuit()` como campo num z.object({...}).
 */
export function nuit(msg = 'NUIT inválido — deve ter 9 dígitos não repetidos') {
  return z
    .string()
    .min(9, 'NUIT deve ter exactamente 9 dígitos')
    .max(9, 'NUIT deve ter exactamente 9 dígitos')
    .refine((v) => validarNUIT(v), { message: msg });
}

// ---------------------------------------------------------------------------
// BI
// ---------------------------------------------------------------------------

/**
 * Retorna um Zod schema que valida Bilhete de Identidade moçambicano.
 * Formato: 12 dígitos seguidos de uma letra maiúscula (ex: 110100123456A).
 */
export function biMocambicano(
  msg = 'BI inválido — formato: 12 dígitos seguidos de uma letra maiúscula (ex: 110100123456A)',
) {
  return z.string().refine((v) => validarBI(v), { message: msg });
}

// ---------------------------------------------------------------------------
// Províncias
// ---------------------------------------------------------------------------

const _provincias = getProvincias();

/** Lista das províncias moçambicanas. Usada no provinciaSchema e no seed. */
export const PROVINCIAS_MZ = _provincias as [string, ...string[]];

/**
 * Zod schema para validar uma província moçambicana.
 * Valida contra a lista oficial de 11 províncias + Maputo Cidade.
 */
export const provinciaSchema = z.enum(PROVINCIAS_MZ);
