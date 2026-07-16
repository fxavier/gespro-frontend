import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Rotas públicas — não exigem autenticação.
const PUBLIC_PATHS = [
  '/auth/',
  '/api/auth/',
  '/_next/',
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Middleware edge-safe: verifica o JWT (via jose internamente no next-auth/jwt)
 * sem qualquer acesso à base de dados. Redirecciona não autenticados para
 * /auth/login preservando callbackUrl.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Deixar passar rotas públicas.
  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL('/auth/login', req.url);
    // callbackUrl com o URL completo do pedido original.
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Protege tudo excepto: ficheiros estáticos do Next e imagens optimizadas.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
