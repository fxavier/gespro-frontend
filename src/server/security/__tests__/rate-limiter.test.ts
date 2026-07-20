import { describe, it, expect } from 'vitest';
import { createRateLimiter, rateLimitedResponse } from '../rate-limiter';

describe('RateLimiter (backend em memória)', () => {
  it('não limita antes de atingir o máximo', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const key = 'test-key-1';

    const r1 = await limiter.consume(key);
    expect(r1.limited).toBe(false);
    expect(r1.remaining).toBe(2);

    const r2 = await limiter.consume(key);
    expect(r2.limited).toBe(false);
    expect(r2.remaining).toBe(1);

    const r3 = await limiter.consume(key);
    expect(r3.limited).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('limita após atingir o máximo e devolve 429 com Retry-After', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const key = 'test-key-2';

    await limiter.consume(key);
    await limiter.consume(key);

    const r = await limiter.consume(key);
    expect(r.limited).toBe(true);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it('check não incrementa o contador', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const key = 'test-key-3';

    await limiter.check(key); // não incrementa
    await limiter.check(key); // não incrementa

    const r = await limiter.consume(key); // incrementa → 1
    expect(r.limited).toBe(false);
    expect(r.remaining).toBe(1);
  });

  it('increment e check funcionam separadamente', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const key = 'test-key-4';

    await limiter.increment(key); // count = 1
    await limiter.increment(key); // count = 2

    const r = await limiter.check(key); // max=2, count=2 → limitado
    expect(r.limited).toBe(true);
  });

  it('chaves independentes não interferem entre si', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    await limiter.consume('chave-A');
    const rA = await limiter.consume('chave-A');
    expect(rA.limited).toBe(true);

    // chave-B não foi afectada
    const rB = await limiter.consume('chave-B');
    expect(rB.limited).toBe(false);
  });

  it('janela diferente cria limites independentes', async () => {
    const limiterA = createRateLimiter({ windowMs: 1_000, max: 5 });
    const limiterB = createRateLimiter({ windowMs: 60_000, max: 5 });
    const key = 'test-key-5';

    await limiterA.consume(key);
    await limiterB.consume(key);

    // Instâncias distintas — stores distintos
    const rA = await limiterA.check(key);
    const rB = await limiterB.check(key);
    expect(rA.remaining).toBe(4);
    expect(rB.remaining).toBe(4);
  });
});

describe('rateLimitedResponse', () => {
  it('devolve Response 429 com Retry-After', () => {
    const res = rateLimitedResponse(30);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('Retry-After nunca é menor que 1 segundo', () => {
    const res = rateLimitedResponse(0);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
  });
});
