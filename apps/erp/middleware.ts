import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { buildSecurityHeaders } from '@/lib/security/headers';

// ---------------------------------------------------------------------------
// Rotas públicas — não exigem autenticação.
// ---------------------------------------------------------------------------
const PUBLIC_PATHS = [
  '/auth/',
  '/api/auth/',
  // Probes de saúde/observabilidade (spec 14): acessíveis sem sessão para o
  // HEALTHCHECK do Docker e o health check do App Runner. /api/metrics tem
  // protecção própria por METRICS_SECRET no handler.
  '/api/health',
  '/api/ready',
  '/api/metrics',
  '/_next/',
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// ---------------------------------------------------------------------------
// Gerador de nonce CSP (edge-safe: crypto.getRandomValues + btoa)
// ---------------------------------------------------------------------------
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// ---------------------------------------------------------------------------
// Middleware principal
// ---------------------------------------------------------------------------

/**
 * Middleware edge-safe:
 * 1. Aplica cabeçalhos de segurança HTTP em todas as respostas (via buildSecurityHeaders).
 * 2. Verifica JWT (via jose internamente no next-auth/jwt) para rotas privadas.
 *    Sem acesso à base de dados — edge-safe.
 * 3. Gera nonce CSP por pedido e propaga via cabeçalho `x-nonce` para o layout RSC.
 *
 * A lógica de construção de headers vive em src/lib/security/headers.ts (client-safe,
 * testável em Vitest puro) e é importada aqui e nos testes — garantia de paridade.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isDev = process.env.NODE_ENV === 'development';
  const enforceCSP = process.env.CSP_ENFORCE === 'true';

  // Gerar nonce por pedido (edge-safe: crypto é global no Edge Runtime)
  const nonce = generateNonce();

  // Construir todos os cabeçalhos de segurança (mesma lógica que nos testes)
  const securityHeaders = buildSecurityHeaders({ nonce, isDev, enforceCSP });

  // --- Autenticação (rotas privadas) ----------------------------------------
  if (!isPublic(pathname)) {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
    });

    if (!token) {
      const loginUrl = new URL('/auth/login', req.url);
      loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
      const redirectResponse = NextResponse.redirect(loginUrl);
      applyHeaders(redirectResponse, securityHeaders);
      return redirectResponse;
    }
  }

  // --- Resposta com cabeçalhos de segurança -----------------------------------
  const response = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(req.headers.entries()),
        // Propaga o nonce ao layout RSC para uso em <Script nonce={nonce}>
        'x-nonce': nonce,
      }),
    },
  });

  applyHeaders(response, securityHeaders);
  return response;
}

/**
 * Aplica um Record<string, string> de headers à resposta NextResponse.
 */
function applyHeaders(response: NextResponse, headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  // Remove header de fingerprinting do servidor
  response.headers.delete('X-Powered-By');
}

export const config = {
  // Protege tudo excepto: ficheiros estáticos do Next e imagens optimizadas.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
