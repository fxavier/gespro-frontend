import 'server-only';
import { createValkeyRateLimiter } from './rate-limiter-valkey';

/**
 * Porta hexagonal de limitação de tráfego.
 *
 * A porta define três operações: `check` (lê sem incrementar), `increment`
 * (incrementa sem verificar) e `consume` (verifica + incrementa numa só
 * chamada atómica). Os adaptadores implementam-na de forma intercambiável.
 *
 * Adaptadores disponíveis (selecção por RATE_LIMIT_DRIVER):
 *   memory  — mapa em memória, por processo. Default. Adequado para testes
 *             unitários e desenvolvimento local sem pilha completa. Não
 *             partilha estado entre instâncias — em produção com duas
 *             instâncias o limite efectivo duplica.
 *   valkey  — janela deslizante em Valkey (protocolo Redis). Estado partilhado
 *             entre todas as instâncias. Requer VALKEY_URL. Modo de falha
 *             configurável por superfície (ver failClosed em RateLimiterExtendedOptions).
 *
 * Âmbito (ADR-0014, revisto pelo ADR-0010):
 *   Protegidos aqui:
 *     - Registo público (3/h por IP e por e-mail)       → registoLimiter
 *     - Convites de utilizador (20/h por tenant)         → inviteLimiter
 *     - Exportações CSV/XLSX/PDF (10/min por utilizador) → exportLimiter
 *     - Assinatura de URL de armazenamento (30/min/user) → presignLimiter
 *     - Ligação de verificação de e-mail (20/15 min por IP)  → verificacaoEmailLimiter
 *     - Reenvio da verificação (3/h por sub, ADR-0031 §5)     → reenvioVerificacaoLimiter
 *   Protegidos pelo Keycloak (force bruta nativa):
 *     - Recuperação de palavra-passe.
 *   Compatibilidade (serão removidos por w8-identidade ao fundir ADR-0010):
 *     - passwordResetLimiter, handoffLimiter
 *
 * Uso:
 *   const rl = await registoLimiter.consume(`${ip}::registo`);
 *   if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);
 */

// ---------------------------------------------------------------------------
// Interface pública da porta
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimiterOptions {
  /** Janela de tempo em milissegundos. */
  windowMs: number;
  /** Número máximo de pedidos na janela. */
  max: number;
}

export interface RateLimiterExtendedOptions extends RateLimiterOptions {
  /**
   * Comportamento quando o backend (Valkey) está inacessível.
   *
   * false (default) — falha aberta: devolve limited=false e regista alerta.
   *   O produto continua a funcionar sem limitação. Adequado para superfícies
   *   autenticadas onde a indisponibilidade do Valkey não deve causar downtime.
   *
   * true — falha fechada: devolve limited=true e regista alerta.
   *   Usado EXCLUSIVAMENTE no registo público — a única superfície não
   *   autenticada e com custo real por pedido (e-mail + provisão de tenant).
   *   Se o Valkey estiver em baixa, o registo fica bloqueado; é preferível
   *   à alternativa de deixar uma botnet registar tenants ilimitadamente.
   *
   * O adaptador em memória ignora esta opção (não tem backend remoto).
   */
  failClosed?: boolean;
}

export interface RateLimiter {
  /** Verifica o limite sem incrementar o contador. */
  check(key: string): Promise<RateLimitResult>;
  /** Incrementa o contador sem verificar o limite. */
  increment(key: string): Promise<void>;
  /** Conveniência: check + increment numa só chamada atómica. */
  consume(key: string): Promise<RateLimitResult>;
}

// ---------------------------------------------------------------------------
// Adaptador em memória (por processo)
// ---------------------------------------------------------------------------

interface Entry {
  count: number;
  resetAt: number;
}

/**
 * Cria um RateLimiter com backend em memória.
 * Adequado para testes unitários e desenvolvimento sem pilha completa.
 * Não partilha estado entre processos — não usar em produção com múltiplas
 * instâncias.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = opts;
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
      const retryAfterSec = limited ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
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
      const retryAfterSec = limited ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
      return { limited, remaining: Math.max(0, max - entry.count), retryAfterSec };
    },
  };
}

// ---------------------------------------------------------------------------
// Selecção de adaptador por variável de ambiente (padrão STORAGE_DRIVER)
// ---------------------------------------------------------------------------

export type RateLimitDriver = 'memory' | 'valkey';

function resolverDriver(): RateLimitDriver {
  const d = (process.env.RATE_LIMIT_DRIVER ?? 'memory').trim();
  if (d !== 'memory' && d !== 'valkey') {
    throw new Error(`RATE_LIMIT_DRIVER inválido: "${d}" (usa "memory" ou "valkey")`);
  }
  return d;
}

/**
 * Cria um RateLimiter escolhendo o adaptador conforme RATE_LIMIT_DRIVER:
 *   memory (default) → adaptador em memória (createRateLimiter)
 *   valkey            → adaptador Valkey (createValkeyRateLimiter)
 *
 * As instâncias pré-configuradas abaixo usam esta função — não chamar
 * createRateLimiter directamente em código de produção.
 */
export function createRateLimiterFromEnv(opts: RateLimiterExtendedOptions): RateLimiter {
  const driver = resolverDriver();
  if (driver === 'valkey') {
    return createValkeyRateLimiter({
      windowMs: opts.windowMs,
      max: opts.max,
      failClosed: opts.failClosed ?? false,
    });
  }
  return createRateLimiter({ windowMs: opts.windowMs, max: opts.max });
}

// ---------------------------------------------------------------------------
// Instâncias pré-configuradas — âmbito ADR-0014 (revisto pelo ADR-0010)
// ---------------------------------------------------------------------------

/**
 * Registo público: 3 pedidos/hora por IP e por e-mail (ADR-0014 §3).
 *
 * FALHA FECHADA: se o Valkey estiver em baixa, bloqueia o registo.
 * Justificação: é a única superfície não autenticada com custo real por
 * pedido (e-mail enviado + provisão de tenant com 504 contas PGC). Deixar
 * passar sem limitação em caso de falha do Valkey é uma porta escancarada.
 */
export const registoLimiter = createRateLimiterFromEnv({
  windowMs: 60 * 60 * 1000,
  max: 3,
  failClosed: true,
});

/**
 * Início de sessão: 10 tentativas/15 min por IP e 5/15 min por identificador
 * (ADR-0029 §4).
 *
 * Existe porque o Direct Access Grant tirou o IP de quem tenta ao Keycloak:
 * todas as tentativas lhe chegam com o IP do servidor, e a detecção de força
 * bruta dele deixa de distinguir um atacante de toda a gente. Este limite é o
 * que repõe essa distinção.
 *
 * Duas chaves, de propósito: a do identificador trava quem martela uma conta
 * a partir de muitos IPs; a do IP trava quem varre muitas contas a partir de
 * um.
 *
 * **Conta FALHAS, não tentativas.** O chamador faz `check` antes e
 * `increment` só quando a autenticação é recusada. Contar entradas com êxito
 * trancaria o escritório inteiro atrás de um NAT — e foi o que aconteceu à
 * suite E2E na primeira versão disto.
 *
 * **Falha ABERTA**, ao contrário do registo. Uma interrupção do Valkey com
 * `failClosed: true` aqui seria uma paragem total do produto — ninguém
 * entraria. O que sobra nesse intervalo é a protecção do próprio Keycloak:
 * degradada pelo IP único, mas viva.
 */
export const loginLimiter = createRateLimiterFromEnv({
  windowMs: 15 * 60 * 1000,
  max: 10,
  failClosed: false,
});

/**
 * Convites de utilizador: 20 convites/hora por tenant (ADR-0014 §3).
 * Chave a usar no handler: `${ctx.tenantId}::invite`
 *
 * Falha aberta: uma interrupção do Valkey não deve impedir a gestão de equipa.
 */
export const inviteLimiter = createRateLimiterFromEnv({
  windowMs: 60 * 60 * 1000,
  max: 20,
  failClosed: false,
});

/**
 * Exportações CSV/XLSX/PDF: 10 pedidos/minuto por utilizador (ADR-0014 §3).
 * Chave a usar no handler: `${ctx.userId}::export`
 *
 * Falha aberta: uma exportação não limitada é indesejável mas não catastrófica.
 */
export const exportLimiter = createRateLimiterFromEnv({
  windowMs: 60 * 1000,
  max: 10,
  failClosed: false,
});

/**
 * Importação de extracto bancário (ADR-0038): 10 ficheiros/minuto por utilizador.
 * Chave: `${ctx.userId}::extracto`. O tecto de 5 MB é do ficheiro comprimido — um
 * XLSX expande em memória no parse —, por isso o ritmo também conta.
 *
 * Falha aberta: como as exportações, indesejável mas não catastrófico sem Valkey.
 */
export const extractoLimiter = createRateLimiterFromEnv({
  windowMs: 60 * 1000,
  max: 10,
  failClosed: false,
});

/**
 * Assinatura de URL de armazenamento (presign): 30 pedidos/minuto por
 * utilizador (ADR-0014 §3).
 * Chave a usar no handler: `${ctx.userId}::presign`
 *
 * Falha aberta: o upload de documentos não deve ser bloqueado por indisponibilidade
 * do Valkey.
 */
export const presignLimiter = createRateLimiterFromEnv({
  windowMs: 60 * 1000,
  max: 30,
  failClosed: false,
});

/**
 * Ligação de verificação de e-mail: 20 visitas/15 min por IP.
 *
 * Deixou de ser um limitador de compatibilidade: o ADR-0031 §5 devolveu-nos a
 * verificação de e-mail (o ADR-0013 §4 tinha-a dado ao Keycloak), portanto
 * `GET /api/publico/verificar-email` é outra vez superfície pública nossa e a
 * detecção de força bruta do Keycloak não a cobre.
 *
 * Falha ABERTA, ao contrário do registo: a ligação não concede sessão nenhuma
 * e o seu efeito é idempotente. Quem a protege é a assinatura HMAC-SHA256;
 * este limite só trava o ruído de quem a tenta adivinhar. Bloquear
 * confirmações legítimas durante uma avaria do Valkey custaria mais.
 */
export const verificacaoEmailLimiter = createRateLimiterFromEnv({
  windowMs: 15 * 60 * 1000,
  max: 20,
  failClosed: false,
});

/**
 * Reenvio da ligação de verificação: 3 pedidos/hora **por `sub`** (ADR-0031 §5).
 *
 * A chave é o `sub` e não o IP de propósito: quem carrega no botão está
 * autenticado, e o que se limita aqui é o nosso servidor a mandar correio
 * para um endereço — amplificação, o mesmo risco que pôs o captcha antes do
 * Keycloak no registo público.
 */
export const reenvioVerificacaoLimiter = createRateLimiterFromEnv({
  windowMs: 60 * 60 * 1000,
  max: 3,
  failClosed: false,
});

// ---------------------------------------------------------------------------
// Compatibilidade — serão removidos por w8-identidade (ADR-0010)
// ---------------------------------------------------------------------------
// Estas superfícies passam a ser geridas pela detecção de força bruta nativa
// do Keycloak. As instâncias mantêm-se até ao merge do w8-identidade para
// não quebrar o código que as importa.
//
// Os limitadores de compatibilidade usam SEMPRE o adaptador em memória
// (createRateLimiter), não o adaptador Valkey, porque vão ser removidos.
// Distribuir um limitador que está prestes a desaparecer não traz valor.

/** @deprecated Keycloak trata força bruta nativa. Remover com w8-identidade. */
export const passwordResetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

/** @deprecated TokenHandoff é removido pelo ADR-0013 §5. Remover com w8-identidade. */
export const handoffLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

/** Webhooks de entrada: 100 pedidos/minuto por IP. Mantido — não é Keycloak. */
export const webhookLimiter = createRateLimiterFromEnv({
  windowMs: 60 * 1000,
  max: 100,
  failClosed: false,
});

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/**
 * Devolve uma Response 429 pronta com cabeçalho `Retry-After`.
 */
export function rateLimitedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiados pedidos. Tente mais tarde.' },
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, retryAfterSec)),
      },
    },
  );
}
