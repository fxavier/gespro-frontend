/**
 * Oráculo da issue #561 — o webhook Stripe aplica eventos por ordem de `created`.
 *
 * O Stripe não garante a ordem de entrega (https://docs.stripe.com/webhooks#event-ordering).
 * Antes, um `customer.subscription.updated (active)` que falhou e foi reentregue depois de um
 * `customer.subscription.deleted` reactivava a assinatura (`LEITURA → ATIVA` é válida na
 * máquina de estados): acesso gratuito indefinido, porque no Stripe a subscrição está
 * `canceled` e nunca mais chega evento nenhum.
 *
 * Contrato:
 *   O1 `deleted(created=T2)` seguido de `updated(active, created=T1<T2)` → fica LEITURA; o
 *      evento antigo fica registado (200, o Stripe deixa de reentregar) e não transita.
 *   O2 Um evento mais recente (`T3 > T2`) continua a ser aplicado normalmente.
 *   O3 Dois eventos em paralelo, entregues fora de ordem → vence o mais recente, seja qual for
 *      o que chega primeiro à base.
 *
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Stripe from 'stripe';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

describe.skipIf(skip)('#561 — webhook Stripe respeita a ordem dos eventos (DB efémera)', () => {
  let db: any;
  let processar: (evento: Stripe.Event) => Promise<{ transitou: boolean; duplicado: boolean }>;

  const sufixo = `s561-${Date.now()}`;
  const tenants: string[] = [];
  let seq = 0;

  /** Segundos Unix, como o `created` do Stripe. */
  const T1 = 1_790_000_000;
  const T2 = T1 + 60;
  const T3 = T2 + 60;

  async function criarAssinatura(estado: 'ATIVA' | 'LEITURA' | 'TRIAL') {
    const n = ++seq;
    const id = `t-${sufixo}-${n}`;
    await db.tenant.create({
      data: {
        id,
        nome: `Tenant 561 ${n}`,
        slug: `${sufixo}-${n}`,
        nuit: `${Date.now()}${n}`.slice(-9),
      },
    });
    tenants.push(id);
    const sub = `sub_${sufixo}_${n}`;
    await db.assinatura.create({
      data: {
        tenantId: id,
        estado,
        planoAssinatura: 'BASICO',
        trialFim: new Date(Date.now() - 60 * 86_400_000),
        stripeCustomerId: `cus_${sufixo}_${n}`,
        stripeSubscriptionId: sub,
      },
    });
    return { tenantId: id, sub, customer: `cus_${sufixo}_${n}` };
  }

  function evento(
    tipo: 'customer.subscription.updated' | 'customer.subscription.deleted',
    alvo: { sub: string; customer: string },
    status: string,
    created: number,
  ): Stripe.Event {
    return {
      id: `evt_${sufixo}_${++seq}`,
      object: 'event',
      type: tipo,
      created,
      data: { object: { id: alvo.sub, object: 'subscription', customer: alvo.customer, status } },
    } as unknown as Stripe.Event;
  }

  async function estado(tenantId: string): Promise<string> {
    const a = await db.assinatura.findFirst({ where: { tenantId }, select: { estado: true } });
    return a.estado;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    const mod: any = await import('@/server/services/plataforma/assinatura.service');
    processar = mod.processarEventoWebhook;
  });

  afterAll(async () => {
    if (!db) return;
    await db.eventoWebhookStripe.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.assinatura.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.tenant.deleteMany({ where: { id: { in: tenants } } });
  });

  it('O1 — reentrega atrasada de `updated(active, T1)` depois de `deleted(T2)` não reactiva', async () => {
    const a = await criarAssinatura('ATIVA');

    const apagado = await processar(evento('customer.subscription.deleted', a, 'canceled', T2));
    expect(apagado.transitou).toBe(true);
    expect(await estado(a.tenantId)).toBe('LEITURA');

    const antigo = await processar(evento('customer.subscription.updated', a, 'active', T1));
    expect(antigo.duplicado).toBe(false);
    expect(antigo.transitou).toBe(false);
    expect(await estado(a.tenantId)).toBe('LEITURA');
  });

  it('O2 — um evento mais recente (T3 > T2) continua a aplicar', async () => {
    const a = await criarAssinatura('ATIVA');

    await processar(evento('customer.subscription.deleted', a, 'canceled', T2));
    await processar(evento('customer.subscription.updated', a, 'active', T1));
    expect(await estado(a.tenantId)).toBe('LEITURA');

    const novo = await processar(evento('customer.subscription.updated', a, 'active', T3));
    expect(novo.transitou).toBe(true);
    expect(await estado(a.tenantId)).toBe('ATIVA');
  });

  it('O3 — em paralelo e fora de ordem, vence o mais recente (nas duas ordens de chegada)', async () => {
    for (let i = 0; i < 4; i++) {
      // ATIVA → antigo (active, T1) e novo (canceled, T2) em corrida: fica LEITURA.
      const a = await criarAssinatura('ATIVA');
      const novo = evento('customer.subscription.deleted', a, 'canceled', T2);
      const antigo = evento('customer.subscription.updated', a, 'active', T1);
      await Promise.all(i % 2 === 0 ? [processar(novo), processar(antigo)] : [processar(antigo), processar(novo)]);
      expect(await estado(a.tenantId), `corrida ${i} (cancelamento mais recente)`).toBe('LEITURA');

      // LEITURA → antigo (canceled, T2) e novo (active, T3): fica ATIVA.
      const b = await criarAssinatura('LEITURA');
      const novoB = evento('customer.subscription.updated', b, 'active', T3);
      const antigoB = evento('customer.subscription.updated', b, 'canceled', T2);
      await Promise.all(
        i % 2 === 0 ? [processar(antigoB), processar(novoB)] : [processar(novoB), processar(antigoB)],
      );
      expect(await estado(b.tenantId), `corrida ${i} (activação mais recente)`).toBe('ATIVA');

      // ATIVA → antigo (canceled, T1) MUDA o estado; novo (active, T2) leu ATIVA antes disso.
      // O novo não pode perder a corrida para o antigo: fica ATIVA.
      const c = await criarAssinatura('ATIVA');
      const antigoC = evento('customer.subscription.deleted', c, 'canceled', T1);
      const novoC = evento('customer.subscription.updated', c, 'active', T2);
      await Promise.all(
        i % 2 === 0 ? [processar(antigoC), processar(novoC)] : [processar(novoC), processar(antigoC)],
      );
      expect(await estado(c.tenantId), `corrida ${i} (antigo muda o estado primeiro)`).toBe('ATIVA');
    }
  });
});
