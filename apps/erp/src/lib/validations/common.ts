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

// ---------------------------------------------------------------------------
// Identificadores de entidade
// ---------------------------------------------------------------------------

/**
 * Id de entidade: aceita **cuid ou uuid**.
 *
 * O Prisma gera cuid por omissão, mas o bootstrap do plano de contas
 * (`tenant-bootstrap.ts`) tem de atribuir os ids à mão — o `createMany` insere
 * por níveis e o filho precisa de saber o id do pai antes de existir — e usa
 * `crypto.randomUUID()`. Resultado: TODAS as contas PGC de TODOS os tenants,
 * em produção inclusive, têm uuid. Um `z.string().cuid()` num campo que
 * carregue um id de conta rejeita-as a todas.
 */
export const idEntidade = (mensagem = 'ID inválido') =>
  z.string().refine(
    (v) =>
      /^c[a-z0-9]{20,}$/i.test(v) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    { message: mensagem },
  );
