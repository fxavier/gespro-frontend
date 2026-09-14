import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { buildCorsHeaders } from '@/lib/api/cors';
import { getRequestContext } from '@/server/observability/context';
import {
  CORPO_ILEGIVEL,
  registarTenant,
  type ResultadoRegisto,
} from '@/server/provisioning/registo-publico';

/**
 * POST /api/publico/registo — registo self-service (público, sem sessão).
 *
 * **Adaptador HTTP e nada mais** (ADR-0031 §Decisão 3, spec 21 tarefa 1.2): lê
 * o corpo, delega em `registarTenant()` e traduz o resultado discriminado em
 * 201/4xx/5xx. Captcha, limitação de tráfego, Zod, idempotência, Keycloak e
 * transacção vivem em `src/server/provisioning/registo-publico.ts`, partilhados
 * com o ecrã `/registo` do ERP — que é onde o registo passa a acontecer.
 *
 * Os códigos de erro publicados em `docs/handoff/site-provisionamento.md` §2
 * são contrato: resposta 201 `{ tenantSlug, mensagem }`, erros
 * `{ traceId, erro, error: { code, message, details? } }` — sem stack. O 429
 * mantém-se sem `error` (nunca teve código publicado), com `Retry-After`.
 */

export const runtime = 'nodejs';

function ipDe(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function traceId(): string {
  return getRequestContext()?.requestId ?? 'sem-trace';
}

/** Traduz a falha da função partilhada no envelope publicado. */
function respostaDeFalha(
  resultado: Extract<ResultadoRegisto, { ok: false }>,
  cors: Record<string, string>,
): Response {
  if (resultado.estado === 429) {
    return NextResponse.json(
      { traceId: traceId(), erro: resultado.mensagem },
      {
        status: 429,
        headers: { ...cors, 'Retry-After': String(resultado.retryAfterSec ?? 60) },
      },
    );
  }
  return NextResponse.json(
    {
      traceId: traceId(),
      erro: resultado.mensagem,
      error: {
        code: resultado.code,
        message: resultado.mensagem,
        ...(resultado.detalhes !== undefined ? { details: resultado.detalhes } : {}),
      },
    },
    { status: resultado.estado, headers: cors },
  );
}

export const POST = withApi(
  async (req: NextRequest) => {
    const cors = buildCorsHeaders(req, {
      methods: 'POST, OPTIONS',
      allowedHeaders: 'Content-Type, Idempotency-Key',
      credentials: false,
    }) as Record<string, string>;

    // O corpo lê-se aqui (só o adaptador tem o `Request`), mas um corpo
    // ilegível não responde aqui: segue como sentinela para ser recusado no
    // seu lugar na ordem das defesas — depois do limite por IP e da chave.
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      corpo = CORPO_ILEGIVEL;
    }

    const resultado = await registarTenant(corpo, {
      ip: ipDe(req),
      idempotencyKey: req.headers.get('idempotency-key') ?? '',
    });

    if (!resultado.ok) return respostaDeFalha(resultado, cors);

    // Corpo montado campo a campo: `sub` e `email` viajam no resultado (e na
    // chave de idempotência) para quem provisiona a partir do ERP, e **não**
    // pertencem à resposta pública.
    return NextResponse.json(
      { tenantSlug: resultado.tenantSlug, mensagem: resultado.mensagem },
      { status: 201, headers: cors },
    );
  },
  { public: true },
);

/**
 * Preflight. Tem de anunciar `Idempotency-Key` em `Access-Control-Allow-Headers`
 * — sem isso o browser recusa o POST antes sequer de o enviar, porque o header
 * obrigatório deste endpoint não consta da lista de omissão de `cors.ts`.
 */
export function OPTIONS(req: NextRequest): Response {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(req, {
      methods: 'POST, OPTIONS',
      allowedHeaders: 'Content-Type, Idempotency-Key',
      credentials: false,
    }),
  });
}
