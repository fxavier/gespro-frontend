import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  deCentavos,
  getWebhookSecret,
  paraCentavos,
  resolverPriceId,
  stripeConfigurado,
} from '../stripe-client';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_BASICO_MENSAL;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('conversão de montantes — só na fronteira Stripe', () => {
  it('converte para cêntimos arredondando ao cêntimo', () => {
    expect(paraCentavos(29)).toBe(2900);
    expect(paraCentavos(29.99)).toBe(2999);
    expect(paraCentavos(0.005)).toBe(1);
    expect(paraCentavos(0)).toBe(0);
  });

  it('faz o caminho inverso sem perda para valores com 2 casas', () => {
    for (const v of [0, 1, 29, 79.5, 199.99, 1990]) {
      expect(deCentavos(paraCentavos(v))).toBeCloseTo(v, 2);
    }
  });
});

describe('configuração', () => {
  it('reporta o Stripe como não configurado sem chave secreta', () => {
    expect(stripeConfigurado()).toBe(false);
  });

  it('reporta configurado quando a chave existe', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    expect(stripeConfigurado()).toBe(true);
  });

  it('recusa o segredo do webhook em falta (503, não 500 silencioso)', () => {
    expect(() => getWebhookSecret()).toThrowError(
      expect.objectContaining({ code: 'STRIPE_WEBHOOK_NAO_CONFIGURADO', status: 503 }),
    );
  });

  it('devolve o segredo do webhook quando definido', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc';
    expect(getWebhookSecret()).toBe('whsec_abc');
  });
});

describe('resolução de Price IDs', () => {
  it('lê o Price da env var indicada pelo catálogo', () => {
    process.env.STRIPE_PRICE_BASICO_MENSAL = 'price_123';
    expect(resolverPriceId('BASICO', 'MENSAL')).toBe('price_123');
  });

  it('falha explicitamente se o preço não estiver configurado (nunca inventa)', () => {
    expect(() => resolverPriceId('BASICO', 'MENSAL')).toThrowError(
      expect.objectContaining({ code: 'PRICE_NAO_CONFIGURADO', status: 503 }),
    );
  });
});
