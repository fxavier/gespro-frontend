import 'server-only';
import Stripe from 'stripe';
import { AppError } from '@/lib/errors';
import { nomeEnvPrice, type CicloId, type PlanoId } from '@/lib/planos';

/**
 * Singleton do SDK Stripe + resolução de Price IDs a partir do ambiente.
 *
 * Segredos NUNCA vivem no repositório: `STRIPE_SECRET_KEY` e
 * `STRIPE_WEBHOOK_SECRET` vêm do Secrets Manager em produção (spec 16) e de
 * `.env` em dev. O catálogo (`src/lib/planos.ts`) guarda só o *nome* da env var
 * de cada Price — resolvido aqui, no servidor.
 *
 * Se a chave não estiver configurada, `getStripe()` lança `STRIPE_NAO_CONFIGURADO`
 * (503): o onboarding continua a funcionar em modo trial local — a criação da
 * subscrição em background é best-effort e não bloqueia o provisionamento.
 */

let cliente: Stripe | null = null;

export function stripeConfigurado(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new AppError(
      'STRIPE_NAO_CONFIGURADO',
      'Faturação indisponível: integração de pagamentos não configurada.',
      503,
    );
  }
  if (!cliente) {
    cliente = new Stripe(key, {
      // `maxNetworkRetries` cobre falhas transitórias sem duplicar cobranças
      // (o Stripe é idempotente por `Idempotency-Key` interno do SDK).
      maxNetworkRetries: 2,
      appInfo: { name: 'GestPro', url: 'https://gespro.mz' },
    });
  }
  return cliente;
}

/** Apenas para testes: limpa o singleton entre casos. */
export function resetStripeClient(): void {
  cliente = null;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError(
      'STRIPE_WEBHOOK_NAO_CONFIGURADO',
      'Webhook de faturação não configurado.',
      503,
    );
  }
  return secret;
}

/**
 * Resolve o Stripe Price ID de (plano, ciclo) a partir do ambiente.
 * Lança `PRICE_NAO_CONFIGURADO` (503) se a env var estiver por preencher — nunca
 * inventa um preço nem cai em omissão silenciosa.
 */
export function resolverPriceId(planoId: PlanoId, ciclo: CicloId): string {
  const envVar = nomeEnvPrice(planoId, ciclo);
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new AppError(
      'PRICE_NAO_CONFIGURADO',
      `Preço não configurado para o plano ${planoId} (${ciclo}).`,
      503,
    );
  }
  return priceId;
}

// ---------------------------------------------------------------------------
// Conversão de montantes — SÓ nesta fronteira
// ---------------------------------------------------------------------------

/**
 * Unidade principal → unidade mínima (cêntimos), como o Stripe exige.
 * Arredonda ao cêntimo mais próximo; nunca usar `Decimal` do tenant aqui — a
 * subscrição SaaS não entra no livro-razão em MZN (ADR-0009).
 */
export function paraCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Unidade mínima (cêntimos) → unidade principal. */
export function deCentavos(centavos: number): number {
  return centavos / 100;
}
