/**
 * Sessão autenticada via NextAuth Credentials (fase 1, pré-Keycloak).
 *
 * Fluxo HTTP real do login: GET /api/auth/csrf → POST
 * /api/auth/callback/credentials. O pedido de login é etiquetado
 * `operation:login` e EXCLUÍDO das métricas dos cenários — na fase 1 o login
 * não é objecto de medição (conflito 7 do handoff: o cenário de autenticação
 * só existe com Keycloak).
 *
 * NOTA TÉCNICA: o JWT de sessão (com o catálogo de permissões) excede 4 KB e
 * o Auth.js divide-o em chunks `authjs.session-token.0/.1/.2`. O Auth.js
 * reconstrói o token pela ORDEM dos cookies no header — e a ordem do cookie
 * jar do k6 não é estável entre pedidos (verificado empiricamente: sessão
 * aceite no 1.º pedido, 307 no 2.º). Por isso o login devolve um header
 * `Cookie` explícito, ordenado, e remove os chunks do jar do VU.
 */
import http from 'k6/http';
import { check, fail } from 'k6';
import { BASE_URL } from './util.js';

function login(email, senha, tenantSlug) {
  const tags = { operation: 'login' };

  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, { tags });
  if (!check(csrfRes, { 'csrf 200': (r) => r.status === 200 })) fail('csrf falhou');
  const csrfToken = csrfRes.json('csrfToken');

  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    { csrfToken, email, password: senha, tenant: tenantSlug, redirect: 'false' },
    { tags, redirects: 0 },
  );
  const ok = res.status === 302 || res.status === 200;
  if (!check(res, { 'login aceite': () => ok })) fail(`login falhou: ${res.status}`);

  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE_URL);
  const chunks = Object.keys(cookies)
    .filter((n) => n.indexOf('session-token') !== -1)
    .sort(); // .0 < .1 < .2 — a ordem que o Auth.js espera
  if (chunks.length === 0) {
    fail('login sem cookie de sessão — credenciais ou verificação de email?');
  }
  const header = chunks.map((n) => `${n}=${cookies[n][0]}`).join('; ');
  // Retira os chunks do jar: a partir daqui a sessão viaja só no header ordenado.
  for (const n of chunks) jar.delete(BASE_URL, n);
  return header;
}

/** Autentica na primeira iteração do VU; devolve headers com a sessão. */
let sessaoHeader = null;
export function garantirSessao(tenant) {
  if (!sessaoHeader) {
    sessaoHeader = login(tenant.adminEmail, tenant.senha, tenant.slug);
  }
  return { Cookie: sessaoHeader };
}
