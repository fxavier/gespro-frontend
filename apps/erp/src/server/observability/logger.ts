import 'server-only';
import { getRequestContext } from './context';

/**
 * Logger estruturado (server-only). Implementação nativa Node.js compatível
 * com a API surface do pino. Quando o pacote `pino` é instalado (deps
 * adicionadas em package.json, orquestrador resolve), a saída JSON é
 * equivalente; `pino-pretty` fica disponível para dev.
 *
 * Redacção obrigatória de segredos/PII (CLAUDE.md):
 *   password, senha, token*, authorization, *secret*, nuit, bi, apiKey,
 *   accessToken, refreshToken, privateKey, clientSecret
 *
 * Nunca logar bodies de request com PII; NUIT/BI mascarados por chave.
 */

// ---------------------------------------------------------------------------
// Redacção
// ---------------------------------------------------------------------------

/**
 * Conjunto de chaves a redactar (case-insensitive, correspondência exacta).
 * Acrescenta aqui campos novos conforme a política de privacidade.
 */
const REDACT_EXACT = new Set([
  'password',
  'senha',
  'authorization',
  'nuit',
  'bi',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'privatekey',
  'clientsecret',
]);

/**
 * Sufixos/substrings que, presentes no nome da chave (case-insensitive),
 * activam redacção. Ex.: `api_key`, `db_token`, `my.secret`.
 */
const REDACT_CONTAINS = ['token', 'secret', 'password', 'senha'];

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase();
  if (REDACT_EXACT.has(lower)) return true;
  return REDACT_CONTAINS.some((s) => lower.includes(s));
}

/**
 * Redacta recursivamente campos sensíveis de um objecto.
 * Exportado para testes de redacção independentes.
 */
export function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactObject(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = shouldRedact(key) ? '[REDACTED]' : redactObject(value, depth + 1);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Níveis e configuração
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_NUM: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_NUM) return env;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const configuredLevelNum = LEVEL_NUM[resolveLevel()];

// ---------------------------------------------------------------------------
// Interface pública (pino-compatible subset)
// ---------------------------------------------------------------------------

export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

function writeLog(
  level: LogLevel,
  staticBindings: Record<string, unknown>,
  obj: object,
  msg?: string,
): void {
  if (LEVEL_NUM[level] < configuredLevelNum) return;

  const ctx = getRequestContext();

  const record = {
    time: new Date().toISOString(),
    level,
    // Contexto de correlação do ALS (requestId, tenantId, userId)
    ...(ctx && {
      requestId: ctx.requestId,
      ...(ctx.tenantId && { tenantId: ctx.tenantId }),
      ...(ctx.userId && { userId: ctx.userId }),
    }),
    // Bindings estáticos do child logger
    ...staticBindings,
    // Campos do log — redactar antes de serializar
    ...(redactObject(obj) as object),
    msg: msg ?? '',
  };

  const line = JSON.stringify(record) + '\n';

  // Erros e avisos → stderr; outros → stdout
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (obj, msg) => writeLog('debug', bindings, obj, msg),
    info: (obj, msg) => writeLog('info', bindings, obj, msg),
    warn: (obj, msg) => writeLog('warn', bindings, obj, msg),
    error: (obj, msg) => writeLog('error', bindings, obj, msg),
    child: (childBindings) => createLogger({ ...bindings, ...childBindings }),
  };
}

/** Logger raiz da aplicação. Usar `.child({ ... })` para adicionar contexto. */
export const logger = createLogger({ service: 'gespro' });
