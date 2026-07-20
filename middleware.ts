import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ---------------------------------------------------------------------------
// Rotas públicas — não exigem autenticação.
// ---------------------------------------------------------------------------
const PUBLIC_PATHS = [
  '/auth/',
  '/api/auth/',
  '/_next/',
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// ---------------------------------------------------------------------------
// Gerador de nonce CSP (edge-safe: crypto.getRandomValues)
// ---------------------------------------------------------------------------
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// ---------------------------------------------------------------------------
// Construção da política CSP
//
// Modo report-only por omissão (CSP_ENFORCE=true activa enforce em produção).
// Turbopack (dev) precisa de:
//   - 'unsafe-eval' em script-src (HMR runtime)
//   - ws://* em connect-src (HMR WebSocket)
// ---------------------------------------------------------------------------
function buildCspPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}'`;

  const connectSrc = isDev
    ? "'self' ws://localhost:* wss://localhost:*"
    : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Next.js injeta CSS crítico inline; Tailwind também usa inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Imagens: self + data URI + fontes externas declaradas em next.config.ts
    "img-src 'self' data: https://images.pexels.com https://images.unsplash.com",
    // next/font carrega do origin próprio (self-hosted após build)
    "font-src 'self' data:",
    connectSrc !== "'self'" ? `connect-src ${connectSrc}` : "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
  ].join('; ');
}

// ---------------------------------------------------------------------------
// Middleware principal
// ---------------------------------------------------------------------------

/**
 * Middleware edge-safe:
 * 1. Aplica cabeçalhos de segurança HTTP em todas as respostas.
 * 2. Verifica JWT (via jose internamente no next-auth/jwt) para rotas privadas.
 *    Sem acesso à base de dados — edge-safe.
 * 3. Gera nonce CSP por pedido e propaga via cabeçalho `x-nonce` para o layout.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isDev = process.env.NODE_ENV === 'development';

  // Gerar nonce por pedido (usado no CSP e propagado ao layout via header)
  const nonce = generateNonce();
  const cspPolicy = buildCspPolicy(nonce, isDev);

  // CSP em report-only por omissão; enforce requer CSP_ENFORCE=true (produção).
  // Em report-only, violações são registadas mas não bloqueiam conteúdo —
  // permite validar a política sem partir a app.
  const cspHeaderName =
    process.env.CSP_ENFORCE === 'true'
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only';

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
      applySecurityHeaders(redirectResponse, cspHeaderName, cspPolicy, nonce, isDev);
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

  applySecurityHeaders(response, cspHeaderName, cspPolicy, nonce, isDev);
  return response;
}

/**
 * Aplica todos os cabeçalhos de segurança à resposta.
 * Separado para reutilização (redirect + next).
 */
function applySecurityHeaders(
  response: NextResponse,
  cspHeaderName: string,
  cspPolicy: string,
  nonce: string,
  isDev: boolean,
): void {
  // Content-Security-Policy (nonce por pedido)
  response.headers.set(cspHeaderName, cspPolicy);

  // Propaga o nonce para que o layout RSC possa injectá-lo nos <script>
  response.headers.set('x-nonce', nonce);

  // HSTS — apenas em HTTPS; sem `preload` por omissão (requer submissão manual)
  // Em dev não emitir (HTTP local)
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains',
    );
  }

  // Impede clickjacking (redundante com frame-ancestors na CSP, mas defense-in-depth)
  response.headers.set('X-Frame-Options', 'DENY');

  // Impede MIME-sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Referrer: envia só a origem em cross-origin (sem path/query)
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy: desactiva features não usadas pela aplicação
  response.headers.set(
    'Permissions-Policy',
    [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
    ].join(', '),
  );

  // Remove o cabeçalho Server (reduz fingerprinting)
  response.headers.delete('X-Powered-By');
}

export const config = {
  // Protege tudo excepto: ficheiros estáticos do Next e imagens optimizadas.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
