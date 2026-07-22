import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { webhookLimiter } from '@/server/security/rate-limiter';
import { AppError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { getRequestContext } from '@/server/observability/context';
import { prismaBase } from '@/server/db/client';
import {
  processarEventoWebhook,
  verificarAssinaturaWebhook,
} from '@/server/services/plataforma/assinatura.service';

/**
 * POST /api/webhooks/stripe — reconciliação do estado da subscrição.
 *
 * Público (o Stripe não tem sessão), listado em `PUBLIC_PATHS`. A autenticação
 * é a **assinatura do evento**: `stripe.webhooks.constructEvent` sobre os bytes
 * crus do corpo, com `STRIPE_WEBHOOK_SECRET`. Sem isto, qualquer um podia
 * activar a subscrição de qualquer tenant com um POST.
 *
 * O corpo tem de ser lido como texto **antes** de qualquer parsing: `req.json()`
 * reserializa e a assinatura deixa de conferir.
 *
 * Idempotência: `EventoWebhookStripe.stripeEventId` é `@unique` e é inserido na
 * mesma transacção da lógica de negócio (ver `processarEventoWebhook`).
 * Reentregas devolvem 200 sem reprocessar.
 *
 * Erros de processamento devolvem 500 **de propósito**: o Stripe reentrega, e um
 * evento perdido significaria um tenant que pagou e continua bloqueado.
 */
export const runtime = 'nodejs';

export const POST = withApi(
  async (req: NextRequest) => {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    const rl = await webhookLimiter.consume(`${ip}::stripe-webhook`);
    if (rl.limited) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiados pedidos.' } },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, rl.retryAfterSec)) } },
      );
    }

    const assinaturaHeader = req.headers.get('stripe-signature');
    if (!assinaturaHeader) {
      return NextResponse.json(
        { error: { code: 'ASSINATURA_AUSENTE', message: 'Assinatura do webhook em falta.' } },
        { status: 400 },
      );
    }

    const rawBody = await req.text();

    let evento;
    try {
      evento = verificarAssinaturaWebhook(rawBody, assinaturaHeader);
    } catch (e) {
      // Configuração em falta ≠ assinatura inválida. Devolver 400 num deploy mal
      // configurado faria o Stripe desistir da reentrega e perder eventos em
      // silêncio; o 503 do AppError (via withApi) mantém a reentrega viva.
      if (e instanceof AppError) throw e;

      logger.warn(
        { err: (e as Error)?.message },
        '[webhook-stripe] assinatura inválida — pedido recusado',
      );
      return NextResponse.json(
        { error: { code: 'ASSINATURA_INVALIDA', message: 'Assinatura do webhook inválida.' } },
        { status: 400 },
      );
    }

    try {
      const resultado = await processarEventoWebhook(evento);

      if (resultado.naoResolvido) {
        // Evento de faturação sem tenant conhecido: não ficou registado, e
        // devolver 200 aqui tornaria a perda permanente (o Stripe pararia de
        // reentregar). 503 mantém a reentrega, que costuma resolver — a janela
        // é a criação da subscrição ainda a decorrer.
        logger.warn(
          { eventoId: evento.id, tipo: resultado.tipo, alerta: 'webhook_stripe_tenant_nao_resolvido' },
          '[webhook-stripe] tenant não resolvido — a pedir reentrega ao Stripe',
        );
        return NextResponse.json(
          {
            error: {
              code: 'TENANT_NAO_RESOLVIDO',
              message: 'Tenant ainda não associado a esta subscrição.',
            },
          },
          { status: 503, headers: { 'Retry-After': '30' } },
        );
      }

      logger.info(
        {
          eventoId: evento.id,
          tipo: resultado.tipo,
          tenantId: resultado.tenantId,
          duplicado: resultado.duplicado,
          transitou: resultado.transitou,
        },
        '[webhook-stripe] evento processado',
      );
      return NextResponse.json({ data: { recebido: true, duplicado: resultado.duplicado } });
    } catch (e) {
      // ALERTA (spec 14): um evento não processado pode deixar um tenant pago e
      // bloqueado. Regista-se a falha para inspecção e devolve-se 500 para o
      // Stripe reentregar.
      const traceId = getRequestContext()?.requestId ?? 'sem-trace';
      logger.error(
        {
          eventoId: evento.id,
          tipo: evento.type,
          traceId,
          alerta: 'webhook_stripe_falhou',
          err: { message: (e as Error)?.message, stack: (e as Error)?.stack },
        },
        '[webhook-stripe] FALHA no processamento — reentrega esperada',
      );

      await prismaBase.eventoWebhookStripe
        .updateMany({
          where: { stripeEventId: evento.id },
          data: { erro: String((e as Error)?.message ?? 'erro desconhecido').slice(0, 500) },
        })
        .catch(() => {});

      return NextResponse.json(
        { error: { code: 'WEBHOOK_FALHOU', message: 'Falha no processamento do evento.' } },
        { status: 500 },
      );
    }
  },
  { public: true },
);
