/**
 * Sessão autenticada pelo login real: Direct Access Grant contra o Keycloak
 * (ADR-0029), atrás do provider Credentials do Auth.js.
 *
 * Fluxo HTTP: GET /api/auth/csrf → POST /api/auth/callback/credentials com
 * `identificador`/`palavraPasse` (os campos do `authorize` em
 * apps/erp/src/lib/auth.ts). O utilizador tem de existir no realm com o `sub`
 * que o seed de volume grava — ver infra/keycloak/perf-users.json (#240). O
 * pedido de login é etiquetado `operation:login` e fica fora das métricas dos
 * cenários: é feito uma vez por corrida, no `setup()`, e não é o que se mede.
 *
 * NOTA TÉCNICA: o JWT de sessão (com o catálogo de permissões) excede 4 KB e
 * o Auth.js divide-o em chunks `authjs.session-token.0/.1/.2`. O Auth.js
 * reconstrói o token pela ORDEM dos cookies no header — e a ordem do cookie
 * jar do k6 não é estável entre pedidos (verificado empiricamente: sessão
 * aceite no 1.º pedido, 307 no 2.º). Por isso o login devolve um header
 * `Cookie` explícito, ordenado, e remove os chunks do jar.
 */
import http from 'k6/http';
import { check, fail } from 'k6';
import { BASE_URL } from './util.js';

function login(email, senha) {
  const tags = { operation: 'login' };

  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, { tags });
  if (!check(csrfRes, { 'csrf 200': (r) => r.status === 200 })) fail('csrf falhou');
  const csrfToken = csrfRes.json('csrfToken');

  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    { csrfToken, identificador: email, palavraPasse: senha, redirect: 'false' },
    { tags, redirects: 0 },
  );
  // O Auth.js responde 302 também à recusa — para /auth/erro ou com `?error=`.
  const destino = res.headers.Location || '';
  const ok = (res.status === 302 || res.status === 200) && destino.indexOf('error=') === -1;
  if (!check(res, { 'login aceite': () => ok })) fail(`login falhou: ${res.status} ${destino}`);

  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE_URL);
  const chunks = Object.keys(cookies)
    .filter((n) => n.indexOf('session-token') !== -1)
    .sort(); // .0 < .1 < .2 — a ordem que o Auth.js espera
  if (chunks.length === 0) {
    fail('login sem cookie de sessão — utilizador no Keycloak? `sub` igual ao do seed?');
  }
  const header = chunks.map((n) => `${n}=${cookies[n][0]}`).join('; ');
  // Retira os chunks do jar: a partir daqui a sessão viaja só no header ordenado.
  for (const n of chunks) jar.delete(BASE_URL, n);
  return header;
}

/**
 * Uma sessão para a corrida inteira: chama-se no `setup()` do cenário e os
 * VUs recebem-na pelo `data`.
 *
 * Não é um login por VU, de propósito. Todos os VUs entram com o mesmo
 * utilizador, e logins concorrentes do mesmo utilizador disparam a detecção
 * de força bruta do Keycloak: fica `user_temporarily_disabled` e o ERP, que
 * conta a recusa como falha, fecha também o seu limitador (10 em 15 min).
 * Verificado contra o 26.7 com 10 VUs, também com os logins espaçados 1,5 s
 * por VU (a latência dos pedidos desfaz o espaçamento). Não se afrouxa a
 * protecção do realm.
 *
 * O JWT é auto-contido, por isso partilhá-lo entre VUs não muda o que o
 * servidor faz por pedido. Limite: passado o `AUTH_SESSION_MAX_AGE` (15 min)
 * o token pede re-resolução em cada pedido — corridas mais longas medem isso.
 */
export function iniciarSessao(tenant) {
  return { sessao: login(tenant.adminEmail, tenant.senha) };
}

/** Headers com a sessão aberta no `setup()`. */
export function garantirSessao(data) {
  return { Cookie: data.sessao };
}
