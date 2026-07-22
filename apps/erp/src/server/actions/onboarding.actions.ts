'use server';
/**
 * Server Actions — Assinatura SaaS (spec 19).
 *
 * Só a fronteira AUTENTICADA vive aqui: Checkout, Portal e cancelamento. O
 * registo público e o webhook do Stripe são Route Handlers (`withApi`) porque
 * não têm sessão nem contexto de tenant — Server Actions não servem lá.
 *
 * Permissão: `assinatura:gerir` (catálogo em `prisma/seed/rbac.ts`).
 */
import {
  CancelarSubscricaoSchema,
  CheckoutSchema,
} from '@/lib/validations/onboarding';
import { createSafeAction } from '@/server/safe-action';
import { assinaturaService } from '@/server/services/plataforma/assinatura.service';
import type { CicloId, PlanoId } from '@/lib/planos';

/**
 * Cria (ou reaproveita) o Customer Stripe do tenant e devolve o URL da Checkout
 * Session. O plano é revalidado server-side contra o catálogo — o cliente envia
 * um `planoId` do enum, nunca um Price ID.
 */
export const iniciarCheckout = createSafeAction({
  schema: CheckoutSchema,
  permission: 'assinatura:gerir',
  revalidate: { paths: ['/definicoes/faturacao'] },
  handler: async (input, ctx) =>
    assinaturaService.iniciarCheckout(
      { planoId: input.planoId as PlanoId, ciclo: input.ciclo as CicloId },
      ctx,
    ),
});

/** URL do Billing Portal do Stripe (mudar plano/cartão, facturas, cancelar). */
export const abrirPortalCliente = createSafeAction({
  permission: 'assinatura:gerir',
  handler: async (_input, ctx) => assinaturaService.abrirPortalCliente(ctx),
});

/**
 * Cancela a subscrição no fim do período já pago. O estado local só muda quando
 * o Stripe confirmar (`customer.subscription.deleted`).
 */
export const cancelarSubscricao = createSafeAction({
  schema: CancelarSubscricaoSchema,
  permission: 'assinatura:gerir',
  revalidate: { paths: ['/definicoes/faturacao'] },
  handler: async (input, ctx) => assinaturaService.cancelarSubscricao(input, ctx),
});
