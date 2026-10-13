/**
 * Utilitário de CORS para Route Handlers específicos (webhooks/exports).
 *
 * NÃO usar em rotas autenticadas — o middleware JWT já protege.
 * A allowlist vem de ALLOWED_ORIGINS (env), separada por vírgulas.
 *
 * Uso num handler:
 *   const corsHeaders = buildCorsHeaders(req);
 *   if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
 */

const DEFAULT_METHODS = 'GET, POST, OPTIONS';
const DEFAULT_HEADERS = 'Content-Type, Authorization, X-Requested-With';

function getAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS ?? '';
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

export type CorsOptions = {
  methods?: string;
  allowedHeaders?: string;
  credentials?: boolean;
};

/**
 * Devolve cabeçalhos CORS adequados para o pedido.
 * Se a origem não estiver na allowlist, não emite o cabeçalho Allow-Origin
 * (o browser bloqueará).
 *
 * NUNCA emite `Access-Control-Allow-Origin: *` — incompatível com credenciais.
 */
export function buildCorsHeaders(
  req: Request,
  opts?: CorsOptions,
): HeadersInit {
  const origin = req.headers.get('origin') ?? '';
  const allowed = getAllowedOrigins();

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': opts?.methods ?? DEFAULT_METHODS,
    'Access-Control-Allow-Headers': opts?.allowedHeaders ?? DEFAULT_HEADERS,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    if (opts?.credentials !== false) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  }

  return headers;
}

/**
 * Resposta OPTIONS (preflight) para handlers CORS.
 *
 * Passa as MESMAS `opts` que o handler do método real: um preflight que anuncia
 * métodos ou credenciais diferentes da resposta efectiva é mentira ao browser (#197).
 */
export function corsPreflightResponse(req: Request, opts?: CorsOptions): Response {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(req, opts),
  });
}
