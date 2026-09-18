import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { buildSecurityHeaders } from '@/lib/security/headers';
import { cspRegisto } from '@/app/registo/csp';

// ---------------------------------------------------------------------------
// Rotas públicas — não exigem autenticação.
// ---------------------------------------------------------------------------
const PUBLIC_PATHS = [
  // '/auth/' cobre /auth/login (redireccionamento para o Keycloak — ADR-0012
  // §8) e /auth/erro (recusas explícitas do callbacks.signIn — ADR-0011).
  '/auth/',
  // Rotas do Auth.js (signin/callback/session/csrf). Sem isto, o regresso do
  // Keycloak recebe 307 e o login nunca fecha.
  '/api/auth/',
  // Probes de saúde/observabilidade (spec 14): acessíveis sem sessão para o
  // HEALTHCHECK do Docker e o health check do App Runner. /api/metrics tem
  // protecção própria por METRICS_SECRET no handler.
  '/api/health',
  '/api/ready',
  '/api/metrics',
  // Fronteiras públicas do onboarding self-service (spec 19). Sem estes, o site
  // de marketing e o Stripe recebem 307 → /auth/login em vez de 2xx.
  // A protecção destes endpoints é própria: rate-limit + captcha no registo,
  // verificação da assinatura HMAC no webhook e na ligação de verificação.
  //
  // O ADR-0013 §4 tinha removido /api/publico/verificar-email (a verificação
  // era do Keycloak); o ADR-0031 §5 inverteu-o — a ligação volta a ser nossa,
  // assinada com EMAIL_VERIFY_SECRET e sem estado. /auth/registo-callback
  // continua removido: o handoff não voltou (ADR-0031, alternativas).
  '/api/publico/registo',
  '/api/publico/planos',
  '/api/publico/verificar-email',
  '/api/webhooks/stripe',
  // Ecrã de registo servido pelo ERP (ADR-0031): é o formulário público que
  // emite o cookie na origem que lhe pertence. Sem sessão, por definição.
  '/registo',
  // Crons: cada rota impõe `Authorization: Bearer <CRON_SECRET>` e devolve 401
  // sem ele. Sem esta entrada, o agendador recebia 307 → /auth/login antes de
  // a credencial própria ser sequer lida (defeito latente que afectava também
  // o cron de transporte).
  '/api/cron/',
  // Página pública de contacto/suporte, ligada a partir do ecrã de login.
  '/contactos',
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

  // `/registo` é a única rota que carrega o Turnstile, e o widget precisa do
  // script e do <iframe> da Cloudflare que a política geral proíbe. A excepção
  // é DA ROTA: abrir `challenges.cloudflare.com` nas rotas autenticadas para
  // servir um ecrã anónimo seria pagar em toda a aplicação o preço de uma
  // página. Tem de ser aqui e não no `next.config.ts` — o middleware escreve o
  // mesmo nome de cabeçalho por último e um CSP substitui-se, não se acrescenta
  // (medido; ver o cabeçalho de `src/app/registo/csp.ts`).
  if (pathname === '/registo') {
    const nome = enforceCSP
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only';
    securityHeaders[nome] = cspRegisto(nonce, isDev);
  }

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
