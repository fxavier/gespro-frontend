'use server';
/**
 * Server Actions — Notificações (WS 13)
 *
 * Permissões:
 *   notificacoes:ver           — leitura das próprias notificações
 *   notificacoes:marcar_lida   — marcar como lida
 *   notificacoes:gerir_prefs   — actualizar preferências de notificação
 */
import { z } from 'zod';
import { createSafeAction } from '@/server/safe-action';
import { notificacaoService } from '@/server/services/plataforma/notificacao.service';
import { MarcarLidaSchema, ActualizarPreferenciaSchema } from '@/lib/validations/notificacoes';

// ---------------------------------------------------------------------------
// Marcar notificação como lida
// ---------------------------------------------------------------------------

export const marcarNotificacaoLida = createSafeAction({
  schema: MarcarLidaSchema,
  revalidate: { tags: ['notificacoes'] },
  handler: async ({ id }, ctx) => {
    await notificacaoService.marcarLida(id, ctx);
    return { id };
  },
});

// ---------------------------------------------------------------------------
// Marcar todas as notificações como lidas
// ---------------------------------------------------------------------------

export const marcarTodasNotificacoesLidas = createSafeAction({
  revalidate: { tags: ['notificacoes'] },
  handler: async (_input, ctx) => notificacaoService.marcarTodasLidas(ctx),
});

// ---------------------------------------------------------------------------
// Actualizar preferência de notificação
// ---------------------------------------------------------------------------

export const actualizarPreferenciaNotificacao = createSafeAction({
  schema: ActualizarPreferenciaSchema,
  revalidate: { tags: ['notificacoes', 'preferencias-notificacoes'] },
  handler: async ({ tipo, canais }, ctx) => {
    await notificacaoService.actualizarPreferencia(tipo, canais, ctx);
    return { tipo };
  },
});

// ---------------------------------------------------------------------------
// Emitir notificação (uso interno / admin)
// ---------------------------------------------------------------------------

export const emitirNotificacao = createSafeAction({
  schema: z.object({
    userId: z.string().cuid(),
    tipo: z.enum([
      'DOCUMENTO_EXPIRADO',
      'DOCUMENTO_PROXIMO_EXPIRAR',
      'MANUTENCAO_PENDENTE',
      'RESET_PASSWORD',
      'CONVITE_UTILIZADOR',
      'ALERTA_SISTEMA',
    ]),
    titulo: z.string().min(1).max(200),
    mensagem: z.string().min(1).max(1000),
    entidadeTipo: z.string().optional(),
    entidadeId: z.string().optional(),
  }),
  permission: 'admin:gerir_utilizadores',
  revalidate: { tags: ['notificacoes'] },
  handler: async (input, ctx) => notificacaoService.emitir(input, ctx),
});
