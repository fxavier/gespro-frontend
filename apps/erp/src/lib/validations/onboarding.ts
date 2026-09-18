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
 * Contrato de `POST /api/publico/registo` e do ecrã `/registo` do ERP (ver
 * `docs/handoff/site-provisionamento.md`).
 * NUNCA aceita `tenantId`, `slug` nem `estado`: o slug é derivado server-side do
 * nome da empresa e o tenant é criado, não recebido.
 *
 * **COM campo `senha` desde o ADR-0031**, que inverte o ADR-0013 §5: quem se
 * regista tem de entrar no produto no fim da submissão, e uma identidade sem
 * credencial só entra pelo e-mail de acções — que pressupõe correio a
 * funcionar e a chegar, no pior momento possível para essa premissa. A
 * palavra-passe é escrita no Keycloak com `temporaria: false` antes de haver
 * tenant em Postgres; o ERP continua a nunca a guardar nem a verificar.
 *
 * Mesma regra de `MudarPalavraPasseSchema` (`plataforma.ts`, ADR-0030): mínimo
 * de 10 caracteres e confirmação coincidente. Não há aqui uma segunda regra —
 * mudar uma obriga a mudar a outra.
 *
 * `senha` e `confirmacao` são de topo. Um `admin.senha` residual (o sítio onde
 * o campo vivia antes do ADR-0013) continua a ser descartado pelo Zod e nunca
 * é lido.
 */
export const RegistoTenantSchema = z
  .object({
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
    senha: z
      .string()
      .min(10, 'A palavra-passe tem de ter pelo menos 10 caracteres')
      .max(200),
    confirmacao: z.string().min(1, 'Confirme a palavra-passe'),
    planoId: planoIdEnum,
    provincia: z.string().refine((v) => getProvincias().includes(v), {
      message: 'Província inválida para Moçambique',
    }),
    captchaToken: z.string().min(1, 'Verificação anti-robô obrigatória').max(4096),
  })
  .refine((v) => v.senha === v.confirmacao, {
    path: ['confirmacao'],
    message: 'As palavras-passe não coincidem',
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
