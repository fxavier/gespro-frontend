// Zod schemas — Notificações (WS 13)
// Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums (espelham os enums Prisma em SCREAMING_SNAKE)
// ---------------------------------------------------------------------------

export const tipoNotificacaoEnum = z.enum([
  'DOCUMENTO_EXPIRADO',
  'DOCUMENTO_PROXIMO_EXPIRAR',
  'MANUTENCAO_PENDENTE',
  'RESET_PASSWORD',
  'CONVITE_UTILIZADOR',
  'ALERTA_SISTEMA',
]);
export type TipoNotificacao = z.infer<typeof tipoNotificacaoEnum>;

export const canalNotificacaoEnum = z.enum(['IN_APP', 'EMAIL']);
export type CanalNotificacao = z.infer<typeof canalNotificacaoEnum>;

// ---------------------------------------------------------------------------
// Filtros de listagem
// ---------------------------------------------------------------------------

export const FiltroNotificacoesSchema = z.object({
  apenasNaoLidas: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  tipo: tipoNotificacaoEnum.optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(20),
});

export type FiltroNotificacoes = z.infer<typeof FiltroNotificacoesSchema>;

// ---------------------------------------------------------------------------
// Acções de notificação
// ---------------------------------------------------------------------------

export const MarcarLidaSchema = z.object({
  id: z.string().cuid('ID de notificação inválido'),
});

export const ActualizarPreferenciaSchema = z.object({
  tipo: tipoNotificacaoEnum,
  canais: z.array(canalNotificacaoEnum).min(0).max(2),
});

export type ActualizarPreferencia = z.infer<typeof ActualizarPreferenciaSchema>;
