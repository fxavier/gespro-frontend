/**
 * #552 — em produção o limitador tem de ser partilhado entre instâncias.
 *
 * Com o adaptador em memória cada réplica conta sozinha: N réplicas, limite ×N,
 * e o `failClosed` do registo nem chega a existir. O arranque recusa-o — a
 * menos que alguém o aceite por escrito (`RATE_LIMIT_MEMORIA_EM_PRODUCAO=1`,
 * só para a instância única do perf/smoke).
 *
 * A guarda corre no arranque do servidor (`instrumentation-node.ts`), não no
 * `consume`: o `next build` corre com NODE_ENV=production e não pode cair.
 */
import { describe, it, expect } from 'vitest';
import { verificarDriverRateLimit } from '../arranque-rate-limit';

const prod = { NODE_ENV: 'production' } as const;

describe('verificarDriverRateLimit', () => {
  it('produção sem RATE_LIMIT_DRIVER lança, com mensagem que diz o que fazer', () => {
    expect(() => verificarDriverRateLimit({ ...prod })).toThrow(/RATE_LIMIT_DRIVER=valkey/);
  });

  it('produção com driver `memory` lança', () => {
    expect(() => verificarDriverRateLimit({ ...prod, RATE_LIMIT_DRIVER: 'memory' })).toThrow(/memory/);
  });

  it('produção com `valkey` passa', () => {
    expect(() =>
      verificarDriverRateLimit({ ...prod, RATE_LIMIT_DRIVER: 'valkey', VALKEY_URL: 'redis://v:6379' }),
    ).not.toThrow();
  });

  it('produção com `valkey` mas sem VALKEY_URL lança', () => {
    expect(() => verificarDriverRateLimit({ ...prod, RATE_LIMIT_DRIVER: 'valkey' })).toThrow(/VALKEY_URL/);
  });

  it('produção com memória ACEITE por escrito passa', () => {
    expect(() =>
      verificarDriverRateLimit({ ...prod, RATE_LIMIT_DRIVER: 'memory', RATE_LIMIT_MEMORIA_EM_PRODUCAO: '1' }),
    ).not.toThrow();
    expect(() => verificarDriverRateLimit({ ...prod, RATE_LIMIT_MEMORIA_EM_PRODUCAO: '1' })).not.toThrow();
  });

  it.each(['0', 'sim', 'true', ''])('o aceite só vale com «1» (não com «%s»)', (v) => {
    expect(() => verificarDriverRateLimit({ ...prod, RATE_LIMIT_MEMORIA_EM_PRODUCAO: v })).toThrow();
  });

  it('o `next build` (NEXT_PHASE=phase-production-build) não é arranque: passa', () => {
    expect(() =>
      verificarDriverRateLimit({ ...prod, NEXT_PHASE: 'phase-production-build' }),
    ).not.toThrow();
  });

  it.each(['development', 'test', undefined])('fora de produção (%s) a memória é a omissão', (nodeEnv) => {
    expect(() => verificarDriverRateLimit({ NODE_ENV: nodeEnv })).not.toThrow();
  });

  it('TRUSTED_PROXY_HOPS inválido lança no arranque, em qualquer ambiente', () => {
    expect(() => verificarDriverRateLimit({ NODE_ENV: 'development', TRUSTED_PROXY_HOPS: 'dois' })).toThrow(
      /TRUSTED_PROXY_HOPS/,
    );
  });
});
