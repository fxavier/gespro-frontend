/**
 * Testes de integração do adaptador Valkey — RateLimiter.
 *
 * Usa Testcontainers para arrancar um contentor `valkey/valkey:8-alpine`
 * efémero. O adaptador em memória permanece coberto pelos testes unitários
 * existentes em src/server/security/__tests__/rate-limiter.test.ts.
 *
 * O que estes testes provam que os testes unitários não conseguem provar:
 *   1. O algoritmo de janela deslizante Lua funciona contra Valkey real.
 *   2. Dois clientes distintos (simulando duas instâncias ERP) partilham
 *      estado: o limite é atingido mesmo alternando entre clientes — é o
 *      defeito central que motivou o ADR-0014.
 *   3. O modo failClosed bloqueia quando o Valkey está em baixo.
 *   4. O modo failOpen deixa passar quando o Valkey está em baixo.
 *
 * Degradação graciosa (igual ao padrão do Postgres efémero, spec 15):
 *   - Local sem Docker: salta (SKIP_INTEGRATION=true ou Docker indisponível).
 *   - CI: qualquer falha é um blocker real (não silenciado).
 */

import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import type { StartedTestContainer } from 'testcontainers';

const IS_CI = Boolean(process.env.CI);

let container: StartedTestContainer | null = null;
let Redis: typeof import('ioredis').default;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createValkeyRateLimiter: any;

const skip = (msg: string) => {
  console.warn(`[valkey-integration] ${msg} — testes saltados.`);
  process.env.SKIP_VALKEY_INTEGRATION = 'true';
};

beforeAll(async () => {
  // ── 1. Importar Testcontainers ────────────────────────────────────────────
  let GenericContainer: (typeof import('testcontainers'))['GenericContainer'];
  try {
    const tc = await import('testcontainers');
    GenericContainer = tc.GenericContainer;
  } catch (err) {
    if (IS_CI) throw err;
    skip('testcontainers não instalado');
    return;
  }

  // ── 2. Arrancar contentor Valkey ─────────────────────────────────────────
  try {
    container = await new GenericContainer('valkey/valkey:8-alpine')
      .withExposedPorts(6379)
      .withStartupTimeout(30_000)
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(6379);
    process.env.VALKEY_URL = `redis://${host}:${port}`;
    console.info(`[valkey-integration] Contentor pronto: redis://${host}:${port}`);
  } catch (err) {
    if (IS_CI) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    skip(`Docker indisponível ou contentor falhou: ${msg}`);
    return;
  }

  // ── 3. Importar módulos que dependem de VALKEY_URL ───────────────────────
  const ioredis = await import('ioredis');
  Redis = ioredis.default;
  const mod = await import('@/server/security/rate-limiter-valkey');
  createValkeyRateLimiter = mod.createValkeyRateLimiter;
}, 60_000);

afterAll(async () => {
  if (container) {
    await container.stop();
    console.info('[valkey-integration] Contentor Valkey parado.');
  }
});

// Helper: cria um cliente ioredis ligado ao contentor efémero.
function makeClient() {
  const url = process.env.VALKEY_URL!;
  return new Redis(url, {
    enableReadyCheck: false,
    maxRetriesPerRequest: 0,
    lazyConnect: false,
  });
}

// Suite principal
describe('RateLimiter adaptador Valkey (integração)', () => {
  beforeEach(() => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;
  });

  it('não limita antes de atingir o máximo', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    const client = makeClient();
    try {
      const limiter = createValkeyRateLimiter({ windowMs: 60_000, max: 3, failClosed: false }, client);
      const key = `test:basic:${Date.now()}`;

      const r1 = await limiter.consume(key);
      expect(r1.limited).toBe(false);
      expect(r1.remaining).toBe(2);

      const r2 = await limiter.consume(key);
      expect(r2.limited).toBe(false);
      expect(r2.remaining).toBe(1);

      const r3 = await limiter.consume(key);
      expect(r3.limited).toBe(false);
      expect(r3.remaining).toBe(0);
    } finally {
      client.disconnect();
    }
  });

  it('limita após atingir o máximo e devolve retryAfterSec > 0', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    const client = makeClient();
    try {
      const limiter = createValkeyRateLimiter({ windowMs: 60_000, max: 2, failClosed: false }, client);
      const key = `test:limit:${Date.now()}`;

      await limiter.consume(key);
      await limiter.consume(key);

      const r = await limiter.consume(key);
      expect(r.limited).toBe(true);
      expect(r.retryAfterSec).toBeGreaterThan(0);
      expect(r.remaining).toBe(0);
    } finally {
      client.disconnect();
    }
  });

  it('check não incrementa o contador', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    const client = makeClient();
    try {
      const limiter = createValkeyRateLimiter({ windowMs: 60_000, max: 2, failClosed: false }, client);
      const key = `test:check:${Date.now()}`;

      await limiter.check(key);
      await limiter.check(key);

      const r = await limiter.consume(key); // conta 1
      expect(r.limited).toBe(false);
      expect(r.remaining).toBe(1);
    } finally {
      client.disconnect();
    }
  });

  it('increment + check funcionam separadamente', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    const client = makeClient();
    try {
      const limiter = createValkeyRateLimiter({ windowMs: 60_000, max: 2, failClosed: false }, client);
      const key = `test:incr:${Date.now()}`;

      await limiter.increment(key); // count=1
      await limiter.increment(key); // count=2

      const r = await limiter.check(key);
      expect(r.limited).toBe(true);
    } finally {
      client.disconnect();
    }
  });

  it('chaves diferentes não interferem', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    const client = makeClient();
    try {
      const limiter = createValkeyRateLimiter({ windowMs: 60_000, max: 1, failClosed: false }, client);
      const ts = Date.now();

      await limiter.consume(`test:sep:A:${ts}`);
      const rA = await limiter.consume(`test:sep:A:${ts}`);
      expect(rA.limited).toBe(true);

      const rB = await limiter.consume(`test:sep:B:${ts}`);
      expect(rB.limited).toBe(false);
    } finally {
      client.disconnect();
    }
  });

  /**
   * TESTE CENTRAL (ADR-0014 §Consequências):
   * Dois clientes distintos partilham estado — simulação de duas instâncias ECS.
   *
   * Um adaptador em memória falharia este teste: clienteA e clienteB teriam
   * contadores independentes e o limite de max=3 nunca seria atingido com
   * alternância (cada um veria count=1 após a sua própria chamada).
   *
   * Com Valkey, ambos operam sobre a mesma chave e o limite é partilhado.
   */
  it('[GATE] limite partilhado entre duas instâncias (clienteA + clienteB)', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    const clientA = makeClient();
    const clientB = makeClient();

    try {
      const limiterA = createValkeyRateLimiter({ windowMs: 60_000, max: 3, failClosed: false }, clientA);
      const limiterB = createValkeyRateLimiter({ windowMs: 60_000, max: 3, failClosed: false }, clientB);
      const key = `test:shared:${Date.now()}`;

      // Pedido 1 — instância A
      const r1 = await limiterA.consume(key);
      expect(r1.limited).toBe(false);

      // Pedido 2 — instância B (alternando!)
      const r2 = await limiterB.consume(key);
      expect(r2.limited).toBe(false);

      // Pedido 3 — instância A
      const r3 = await limiterA.consume(key);
      expect(r3.limited).toBe(false);

      // Pedido 4 — instância B: o limite (max=3) já foi atingido no total.
      // Com um adaptador em memória, clienteB só veria 2 pedidos seus
      // e devolveria limited=false — aqui tem de devolver limited=true.
      const r4 = await limiterB.consume(key);
      expect(r4.limited).toBe(true);
      console.info(
        '[GATE] Limite partilhado verificado: instâncias A e B partilham contador no Valkey.',
      );
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it('failClosed=true bloqueia quando o Valkey está inacessível', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    // Cria um cliente apontando para uma porta que não existe.
    const badClient = new Redis('redis://127.0.0.1:19999', {
      enableReadyCheck: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 200,
      commandTimeout: 200,
      retryStrategy: () => null, // não reconectar
    });

    try {
      const limiter = createValkeyRateLimiter(
        { windowMs: 60_000, max: 5, failClosed: true },
        badClient,
      );
      const r = await limiter.consume('test:fail-closed');
      // Deve bloquear mesmo sem conseguir chegar ao Valkey.
      expect(r.limited).toBe(true);
      expect(r.retryAfterSec).toBeGreaterThan(0);
    } finally {
      badClient.disconnect();
    }
  });

  it('failClosed=false deixa passar quando o Valkey está inacessível', async () => {
    if (process.env.SKIP_VALKEY_INTEGRATION === 'true') return;

    const badClient = new Redis('redis://127.0.0.1:19999', {
      enableReadyCheck: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 200,
      commandTimeout: 200,
      retryStrategy: () => null,
    });

    try {
      const limiter = createValkeyRateLimiter(
        { windowMs: 60_000, max: 5, failClosed: false },
        badClient,
      );
      const r = await limiter.consume('test:fail-open');
      // Deve deixar passar (falha aberta).
      expect(r.limited).toBe(false);
    } finally {
      badClient.disconnect();
    }
  });
});
