import 'server-only';
import Redis from 'ioredis';
import type { RateLimiter, RateLimitResult } from './rate-limiter';
import { logger } from '@/server/observability/logger';

/**
 * Adaptador Valkey (protocolo Redis) para a porta RateLimiter.
 *
 * Algoritmo: janela deslizante exacta por sorted set.
 *   - ZADD  key score=timestamp_ms member=timestamp_ms:nonce
 *   - ZREMRANGEBYSCORE remove entradas expiradas
 *   - ZCARD conta entradas activas
 * A janela é exacta (não aproximada): cada entrada tem o timestamp real de
 * chegada, e as entradas saem exactamente após `windowMs` milissegundos.
 *
 * Modo de falha (ADR-0014 §4):
 *   failClosed=false (default) — falha aberta: se o Valkey não responder,
 *     deixa passar e regista alerta. O produto continua a funcionar. Adequado
 *     para superfícies autenticadas onde bloquear é pior que deixar passar.
 *   failClosed=true — falha fechada: se o Valkey não responder, bloqueia e
 *     regista alerta. Usado EXCLUSIVAMENTE no registo público — a única
 *     superfície não autenticada com custo real (e-mail + provisão de tenant).
 *
 * Selecção via RATE_LIMIT_DRIVER=valkey (ver rate-limiter.ts).
 */

export interface ValkeyRateLimiterOptions {
  windowMs: number;
  max: number;
  failClosed: boolean;
}

const FAIL_CLOSED_RESULT: RateLimitResult = {
  limited: true,
  remaining: 0,
  retryAfterSec: 60,
};

const FAIL_OPEN_RESULT: RateLimitResult = {
  limited: false,
  remaining: 1,
  retryAfterSec: 0,
};

/**
 * Script Lua — janela deslizante atómica.
 *
 * KEYS[1]  — chave do rate limiter (ex.: "rl:192.0.2.1::registo")
 * ARGV[1]  — timestamp actual em ms
 * ARGV[2]  — duração da janela em ms
 * ARGV[3]  — limite máximo de pedidos
 * ARGV[4]  — '1' → incrementar (consume/increment); '0' → só ler (check)
 * ARGV[5]  — nonce único gerado em Node (só relevante quando ARGV[4]='1')
 *
 * Devolve: {limited (0|1), remaining (inteiro), retryAfterMs (inteiro)}
 *
 * Compatibilidade: Redis 6+ / Valkey 7+ (usa ZRANGEBYSCORE + WITHSCORES
 * em vez de ZRANGE com WITHSCORES para manter compatibilidade alargada).
 */
const SLIDING_WINDOW_SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max    = tonumber(ARGV[3])
local doIncr = ARGV[4] == '1'
local nonce  = ARGV[5]
local windowStart = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

local count   = tonumber(redis.call('ZCARD', key))
local limited = count >= max

if doIncr and not limited then
  redis.call('ZADD', key, now, now .. ':' .. nonce)
  redis.call('PEXPIRE', key, window)
  count = count + 1
end

local remaining    = math.max(0, max - count)
local retryAfterMs = 0

if limited then
  local entries = redis.call('ZRANGEBYSCORE', key, '-inf', '+inf', 'WITHSCORES', 'LIMIT', 0, 1)
  if #entries >= 2 then
    local oldestScore = tonumber(entries[2])
    retryAfterMs = math.max(0, math.floor(oldestScore + window - now))
  end
end

return {limited and 1 or 0, remaining, retryAfterMs}
`;

// Singleton partilhado por todas as instâncias criadas pelo mesmo processo.
// A ligação é iniciada na primeira chamada; reconexão automática até 2 s.
let _client: Redis | null = null;

function getClient(): Redis {
  if (_client) return _client;

  const url = process.env.VALKEY_URL;
  if (!url) {
    throw new Error(
      'VALKEY_URL não configurado. ' +
        'Define VALKEY_URL=redis://valkey:6379 ou usa RATE_LIMIT_DRIVER=memory.',
    );
  }

  _client = new Redis(url, {
    // Não esperar pelo READY antes de aceitar comandos — o rate limiter trata
    // erros de ligação ele próprio (falha aberta ou fechada conforme a superfície).
    enableReadyCheck: false,
    // Falha rápido: o rate limiter não deve bloquear o pedido por mais de 500 ms.
    maxRetriesPerRequest: 0,
    connectTimeout: 1000,
    commandTimeout: 500,
    // Reconexão com back-off linear até 2 s (evita tempestade de reconexões).
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  });

  _client.on('error', (err: Error) => {
    logger.error({ err, component: 'valkey-rate-limiter' }, 'valkey: erro de ligação');
  });

  return _client;
}

/**
 * Repõe o cliente (apenas para testes de integração — não usar em produção).
 */
export function _resetValkeyClientForTest(): void {
  if (_client) {
    _client.disconnect();
    _client = null;
  }
}

/**
 * Cria uma instância de RateLimiter com backend Valkey.
 *
 * Aceita um cliente ioredis opcional para testes de integração
 * (evita o singleton e permite um contentor Testcontainers por suite).
 */
export function createValkeyRateLimiter(
  opts: ValkeyRateLimiterOptions,
  clientOverride?: Redis,
): RateLimiter {
  const { windowMs, max, failClosed } = opts;

  function client(): Redis {
    return clientOverride ?? getClient();
  }

  async function execute(key: string, doIncrement: boolean): Promise<RateLimitResult> {
    try {
      const nowMs = Date.now();
      const nonce = Math.random().toString(36).slice(2, 12);

      const result = (await client().eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        String(nowMs),
        String(windowMs),
        String(max),
        doIncrement ? '1' : '0',
        nonce,
      )) as [number, number, number];

      const [limitedInt, remaining, retryAfterMs] = result;
      return {
        limited: limitedInt === 1,
        remaining,
        retryAfterSec: Math.ceil(retryAfterMs / 1000),
      };
    } catch (err) {
      logger.error(
        { err, key, component: 'valkey-rate-limiter', failClosed },
        'valkey: erro ao executar script de rate limit — usando modo de falha configurado',
      );
      return failClosed ? FAIL_CLOSED_RESULT : FAIL_OPEN_RESULT;
    }
  }

  return {
    async check(key: string): Promise<RateLimitResult> {
      return execute(key, false);
    },

    async increment(key: string): Promise<void> {
      await execute(key, true);
    },

    async consume(key: string): Promise<RateLimitResult> {
      return execute(key, true);
    },
  };
}
