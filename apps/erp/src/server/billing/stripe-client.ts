import 'server-only';
import Stripe from 'stripe';
import { AppError } from '@/lib/errors';
import type { Prisma } from '@prisma/client';
import { CICLO_IDS, type CicloId, type PlanoId } from '@/lib/planos';
import { prismaBase } from '@/server/db/client';

/**
 * Singleton do SDK Stripe + resolução de Price IDs a partir do ambiente.
 *
 * Segredos NUNCA vivem no repositório: `STRIPE_SECRET_KEY` e
 * `STRIPE_WEBHOOK_SECRET` vêm do Secrets Manager em produção (spec 16) e de
 * `.env` em dev. O Price ID de cada plano vem da tabela `Plano` (não é segredo) e, na
 * falta, da env `STRIPE_PRICE_<CODIGO>_<CICLO>` (ADR-0049 §4) — resolvido aqui, no servidor.
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

/** Nome da env var do Stripe Price para (plano, ciclo). Nunca devolve o valor. */
export function nomeEnvPrice(codigo: PlanoId, ciclo: CicloId): string {
  return `STRIPE_PRICE_${codigo}_${ciclo}`;
}

/**
 * Resolve o Stripe Price ID de (plano, ciclo): a coluna da tabela `Plano` ganha; vazia, recorre
 * à env `STRIPE_PRICE_<CODIGO>_<CICLO>` (os três planos de origem). Lança
 * `PRICE_NAO_CONFIGURADO` (503) se nenhum dos dois existir — nunca inventa um preço nem cai em
 * omissão silenciosa.
 */
export async function resolverPriceId(codigo: PlanoId, ciclo: CicloId): Promise<string> {
  const plano = await prismaBase.plano.findUnique({
    where: { codigo },
    select: { stripePriceIdMensal: true, stripePriceIdAnual: true },
  });
  const daTabela = ciclo === 'ANUAL' ? plano?.stripePriceIdAnual : plano?.stripePriceIdMensal;
  const priceId = daTabela || process.env[nomeEnvPrice(codigo, ciclo)];
  if (!priceId) {
    throw new AppError(
      'PRICE_NAO_CONFIGURADO',
      `Preço não configurado para o plano ${codigo} (${ciclo}).`,
      503,
    );
  }
  return priceId;
}

/**
 * Caminho inverso: o código do plano a que um Stripe Price pertence, ou `null` se não for de
 * nenhum. A tabela (qualquer ciclo) ganha à env; a env só cobre os planos de origem.
 */
export async function planoDoPriceId(
  db: Pick<Prisma.TransactionClient, 'plano'>,
  priceId: string,
): Promise<PlanoId | null> {
  const planos = await db.plano.findMany({
    select: { codigo: true, stripePriceIdMensal: true, stripePriceIdAnual: true },
  });
  const daTabela = planos.find(
    (p) => p.stripePriceIdMensal === priceId || p.stripePriceIdAnual === priceId,
  );
  if (daTabela) return daTabela.codigo;
  const daEnv = planos.find((p) =>
    CICLO_IDS.some((ciclo) => process.env[nomeEnvPrice(p.codigo, ciclo)] === priceId),
  );
  return daEnv?.codigo ?? null;
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
