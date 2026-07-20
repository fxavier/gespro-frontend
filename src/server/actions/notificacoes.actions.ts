'use server';
/**
 * Server Actions — Notificações (WS 13)
 *
 * Estas três actions são self-scoped: operam sempre sobre os dados do utilizador
 * autenticado (ctx.tenantId + ctx.userId), sem guard de permissão adicional —
 * a autenticação (sessão válida) é suficiente para aceder às próprias notificações.
 * Não existem permissões "notificacoes:*" no catálogo RBAC; a isenção é intencional.
 *
 * A action emitirNotificacao foi removida: não tem consumidor na UI e o único
 * produtor (cron) chama o serviço diretamente — manter a action aumentava a
 * superfície de ataque sem benefício.
 */
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
