import 'server-only';

/**
 * Abstracção de rate limiting — porta hexagonal.
 *
 * Backend de memória em desenvolvimento; em produção substitui-se por um
 * adaptador Redis (ou tabela DB como o login já tem).
 *
 * Uso:
 *   const limiter = createRateLimiter({ windowMs: 15*60*1000, max: 5 });
 *   const result = await limiter.check('ip::email');
 *   if (result.limited) return new Response(null, { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } });
 */

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimiterOptions {
  /** Janela de tempo em milissegundos. Default: 15 min. */
  windowMs?: number;
  /** Número máximo de pedidos na janela. Default: 5. */
  max?: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
  increment(key: string): Promise<void>;
  /** Conveniência: check + increment numa só chamada. */
  consume(key: string): Promise<RateLimitResult>;
}

/**
 * Cria uma instância de RateLimiter com backend em memória.
 * Adequado para desenvolvimento e testes unitários.
 * Em produção, usar o adaptador Redis (spec 16/17).
 */
export function createRateLimiter(opts?: RateLimiterOptions): RateLimiter {
  const windowMs = opts?.windowMs ?? 15 * 60 * 1000;
  const max = opts?.max ?? 5;
  const store = new Map<string, Entry>();

  function getOrCreate(key: string): Entry {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || entry.resetAt < now) {
      const fresh: Entry = { count: 0, resetAt: now + windowMs };
      store.set(key, fresh);
      return fresh;
    }
    return entry;
  }

  return {
    async check(key: string): Promise<RateLimitResult> {
      const entry = getOrCreate(key);
      const limited = entry.count >= max;
      const retryAfterSec = limited
        ? Math.ceil((entry.resetAt - Date.now()) / 1000)
        : 0;
      return { limited, remaining: Math.max(0, max - entry.count), retryAfterSec };
    },

    async increment(key: string): Promise<void> {
      const entry = getOrCreate(key);
      entry.count += 1;
    },

    async consume(key: string): Promise<RateLimitResult> {
      const entry = getOrCreate(key);
      const limited = entry.count >= max;
      if (!limited) entry.count += 1;
      const retryAfterSec = limited
        ? Math.ceil((entry.resetAt - Date.now()) / 1000)
        : 0;
      return { limited, remaining: Math.max(0, max - entry.count), retryAfterSec };
    },
  };
}

// ---------------------------------------------------------------------------
// Instâncias pré-configuradas para cada endpoint sensível
// ---------------------------------------------------------------------------

/** Reset de palavra-passe: 5 tentativas em 15 min por IP+email. */
export const passwordResetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

/** Convite de utilizador: 10 convites em 1 hora por utilizador. */
export const inviteLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

/** Exportações (CSV/PDF): 20 pedidos em 1 hora por utilizador. */
export const exportLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

/** Webhooks de entrada: 100 pedidos em 1 min por IP. */
export const webhookLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 100 });

// --- Onboarding self-service (spec 19) --------------------------------------

/**
 * Registo público: 5 tentativas em 1 hora por IP e por email.
 * O trial é sem cartão — sem este limite (mais o captcha) o custo de criar
 * tenants em massa é zero.
 */
export const registoLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

/** Consumo do token de handoff: 20 tentativas em 15 min por IP. */
export const handoffLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

/** Verificação de email: 20 tentativas em 15 min por IP. */
export const verificacaoEmailLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

/**
 * Conveniência: devolve Response 429 pronta com cabeçalho `Retry-After`.
 */
export function rateLimitedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiados pedidos. Tente mais tarde.' } }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, retryAfterSec)),
      },
    },
  );
}
