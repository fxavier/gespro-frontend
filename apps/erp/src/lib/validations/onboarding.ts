// Zod schemas — Onboarding self-service e faturação por subscrição (spec 19).
// Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.

import { z } from 'zod';
import { validarNUIT } from '@/lib/validacao-nuit';
import { getProvincias } from '@/lib/provincias-mocambique';
import { PLANO_IDS, CICLO_IDS } from '@/lib/planos';

export const planoIdEnum = z.enum(PLANO_IDS as unknown as [string, ...string[]]);
export const cicloEnum = z.enum(CICLO_IDS as unknown as [string, ...string[]]);

export const estadoAssinaturaEnum = z.enum([
  'TRIAL',
  'ATIVA',
  'SUSPENSA',
  'CANCELADA',
  'EXPIRADO',
]);

// ---------------------------------------------------------------------------
// Registo público (POST /api/publico/registo)
// ---------------------------------------------------------------------------

/**
 * Contrato de `POST /api/publico/registo` (ver `docs/handoff/site-provisionamento.md`).
 * NUNCA aceita `tenantId`, `slug` nem `estado`: o slug é derivado server-side do
 * nome da empresa e o tenant é criado, não recebido.
 *
 * SEM campo `senha` desde o ADR-0013 §5: o registo cria a identidade no
 * Keycloak com VERIFY_EMAIL + UPDATE_PASSWORD pendentes e a palavra-passe é
 * definida lá — o ERP nunca a vê. Um campo de palavra-passe a menos num
 * formulário público não autenticado também alivia o ADR-0016.
 * (Chaves desconhecidas são descartadas: um site que ainda envie `senha` não
 * rebenta — mas o valor nunca é lido.)
 */
export const RegistoTenantSchema = z.object({
  empresa: z.object({
    nome: z.string().trim().min(2, 'Nome da empresa obrigatório').max(200),
    nuit: z
      .string()
      .trim()
      .refine(validarNUIT, { message: 'NUIT inválido (9 dígitos não repetidos)' }),
  }),
  admin: z.object({
    nome: z.string().trim().min(2, 'Nome obrigatório').max(150),
    email: z.string().trim().toLowerCase().email('Email inválido').max(254),
  }),
  planoId: planoIdEnum,
  provincia: z.string().refine((v) => getProvincias().includes(v), {
    message: 'Província inválida para Moçambique',
  }),
  captchaToken: z.string().min(1, 'Verificação anti-robô obrigatória').max(4096),
});

export type RegistoTenantInput = z.infer<typeof RegistoTenantSchema>;

// ---------------------------------------------------------------------------
// Checkout / gestão da subscrição (Server Actions autenticadas)
// ---------------------------------------------------------------------------

export const CheckoutSchema = z.object({
  planoId: planoIdEnum,
  ciclo: cicloEnum,
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

export const CancelarSubscricaoSchema = z.object({
  motivo: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Tokens públicos
// ---------------------------------------------------------------------------

export const TokenQuerySchema = z.object({
  token: z.string().min(16, 'Token inválido').max(4096),
});
