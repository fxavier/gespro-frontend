/**
 * Testa que o rate limiter devolve 429 após esgotar o limite.
 * Simula o comportamento de endpoints com rate limiting aplicado.
 *
 * Não depende de DB nem de Edge Runtime — usa apenas o módulo rate-limiter.
 */

import { describe, it, expect } from 'vitest';
import { createRateLimiter, rateLimitedResponse } from '../rate-limiter';

/**
 * Simulação do handler de um endpoint com rate limiting.
 * Replica exactamente a lógica dos Route Handlers:
 *   const rl = await limiter.consume(key);
 *   if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);
 */
async function handleComRateLimit(limiter: ReturnType<typeof createRateLimiter>, key: string): Promise<Response> {
  const rl = await limiter.consume(key);
  if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);
  return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
}

describe('Rate limit → 429 (integração de handler)', () => {
  it('reset-request: devolve 200 dentro do limite e 429 quando excedido', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    const key = '192.168.1.1::reset-request';

    // 5 pedidos dentro do limite
    for (let i = 0; i < 5; i++) {
      const res = await handleComRateLimit(limiter, key);
      expect(res.status).toBe(200);
    }

    // 6º pedido → 429
    const res = await handleComRateLimit(limiter, key);
    expect(res.status).toBe(429);

    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers.get('Retry-After')).not.toBeNull();
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('invite: devolve 429 após 10 convites por utilizador', async () => {
    const limiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 });
    const key = 'user-uuid-123::invite';

    for (let i = 0; i < 10; i++) {
      const res = await handleComRateLimit(limiter, key);
      expect(res.status).toBe(200);
    }

    const res = await handleComRateLimit(limiter, key);
    expect(res.status).toBe(429);
  });

  it('export: devolve 429 após 20 exportações por utilizador por hora', async () => {
    const limiter = createRateLimiter({ windowMs: 60 * 60_000, max: 20 });
    const key = 'user-uuid-456::export';

    for (let i = 0; i < 20; i++) {
      const res = await handleComRateLimit(limiter, key);
      expect(res.status).toBe(200);
    }

    const res = await handleComRateLimit(limiter, key);
    expect(res.status).toBe(429);
  });

  it('IPs diferentes não partilham limite', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

    // IP A esgota o seu limite
    for (let i = 0; i < 3; i++) {
      await handleComRateLimit(limiter, '10.0.0.1::reset-request');
    }
    const resA = await handleComRateLimit(limiter, '10.0.0.1::reset-request');
    expect(resA.status).toBe(429);

    // IP B ainda tem capacidade
    const resB = await handleComRateLimit(limiter, '10.0.0.2::reset-request');
    expect(resB.status).toBe(200);
  });
});
