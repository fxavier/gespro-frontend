import { NextResponse, type NextRequest } from 'next/server';
import { kcConfig } from '@/server/auth/keycloak';

/**
 * GET /api/auth/logout-keycloak — segunda metade do terminar sessão.
 *
 * O `signOut()` do Auth.js limpa a sessão LOCAL; sem este passo, o regresso a
 * `/auth/login` fazia re-login automático pela sessão SSO ainda viva no
 * Keycloak — um botão «Terminar sessão» que não termina nada.
 *
 * Isto é *RP-initiated logout* (uma navegação 302 para o `end_session`), não
 * o *front-channel/back-channel logout* que o ADR-0010 rejeita — aqueles
 * propagam o logout DE OUTROS clientes PARA nós (iframe bloqueado pelo
 * `frame-ancestors`, ou lista de negação). Aqui é o próprio utilizador, no
 * próprio browser, a encerrar a sua sessão SSO. Sem `id_token_hint` o
 * Keycloak mostra um ecrã de confirmação — aceitável, e evita guardar o
 * id_token no JWT só para o saltar.
 *
 * A CSP não é tocada: um redireccionamento de topo não é restringido por ela
 * (ADR-0010 — a mesma razão pela qual o login não a alarga).
 */
export function GET(req: NextRequest): Response {
  const cfg = kcConfig();
  const origem = (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? req.nextUrl.origin).replace(
    /\/$/,
    '',
  );
  const destino = new URL(`${cfg.issuer}/protocol/openid-connect/logout`);
  destino.searchParams.set('client_id', cfg.clientId);
  destino.searchParams.set('post_logout_redirect_uri', `${origem}/auth/login`);
  return NextResponse.redirect(destino, { status: 302 });
}
