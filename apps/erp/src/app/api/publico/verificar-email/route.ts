import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { verificacaoEmailLimiter } from '@/server/security/rate-limiter';
import { verificarEmail } from '@/server/services/plataforma/tenant-provisioning.service';

/**
 * GET /api/publico/verificar-email?token=… — confirma o email do administrador
 * criado no registo self-service (público, sem sessão).
 *
 * O consumo do token é atómico (ver `verificarEmail`): dois cliques no link do
 * email não verificam duas vezes nem lançam erro ao utilizador.
 *
 * Responde com um **redirect** para o ecrã de login, com um parâmetro de estado:
 * quem clica no link é uma pessoa no browser, não um cliente de API — devolver
 * JSON aqui seria mostrar-lhe chavetas.
 */
export const runtime = 'nodejs';

function urlBase(req: NextRequest): string {
  const configurada = process.env.APP_URL ?? process.env.NEXTAUTH_URL;
  return (configurada ?? req.nextUrl.origin).replace(/\/$/, '');
}

export const GET = withApi(
  async (req: NextRequest) => {
    const base = urlBase(req);
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    const rl = await verificacaoEmailLimiter.consume(`${ip}::verificar-email`);
    if (rl.limited) {
      return NextResponse.redirect(`${base}/auth/login?verificacao=limite`, { status: 303 });
    }

    const token = req.nextUrl.searchParams.get('token');
    if (!token || token.length < 16) {
      return NextResponse.redirect(`${base}/auth/login?verificacao=invalida`, { status: 303 });
    }

    const resultado = await verificarEmail(token);
    if (!resultado) {
      // Token inválido, expirado ou já usado — não distinguimos: revelá-lo daria
      // a um atacante um oráculo sobre tokens existentes.
      return NextResponse.redirect(`${base}/auth/login?verificacao=invalida`, { status: 303 });
    }

    const destino = new URL(`${base}/auth/login`);
    destino.searchParams.set('verificacao', 'ok');
    if (resultado.tenantSlug) destino.searchParams.set('tenant', resultado.tenantSlug);
    return NextResponse.redirect(destino.toString(), { status: 303 });
  },
  { public: true },
);
