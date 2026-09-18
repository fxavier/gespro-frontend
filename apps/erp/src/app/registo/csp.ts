/**
 * Política de segurança de conteúdo da rota pública `/registo`
 * (ADR-0031 §Consequências, Requisito 2.5; spec 21 tarefa 3.4).
 *
 * O ecrã de registo é a ÚNICA rota do ERP que carrega o widget Turnstile, e o
 * widget precisa de duas coisas que a política geral proíbe: o script da
 * Cloudflare e um `<iframe>`. A excepção é **da rota**, nunca do ERP — abrir
 * `challenges.cloudflare.com` nas rotas autenticadas para servir um ecrã
 * anónimo seria pagar em toda a aplicação o preço de uma página.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTA POLÍTICA AINDA NÃO ESTÁ APLICADA. LER ANTES DE ASSUMIR QUE ESTÁ.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * O `design.md` §3 punha a excepção no `next.config.ts`. **Não funciona**, e a
 * verificação é directa: com o cabeçalho declarado em `headers()` para
 * `source: '/registo'`, um `next build && next start` seguido de
 * `curl -D - /registo` devolve a política do `middleware.ts`, não esta — o
 * middleware escreve o mesmo nome de cabeçalho por último e um CSP
 * substitui-se, não se acrescenta. O `X-Robots-Tag` da mesma entrada aparece,
 * porque esse nome o middleware não escreve; o CSP não.
 *
 * Emitir na mesma um cabeçalho que nunca chega ao browser seria pior do que
 * não emitir nada: quem o lesse daqui a um ano acreditaria nele. Portanto o
 * `next.config.ts` deixou de o declarar e a política vive aqui, pronta e
 * guardada por teste (`src/server/security/__tests__/csp-registo.test.ts`), à
 * espera do único sítio que a pode aplicar.
 *
 * QUEM A APLICA: o `middleware.ts` — dono único dos cabeçalhos de segurança
 * (CLAUDE.md) e o único com o `pathname` E o nonce por pedido. Não é ficheiro
 * desta lane (ver `docs/handoff/execucao-paralela-21.md`). A alteração é de
 * três linhas, dentro de `middleware()`, depois de `buildSecurityHeaders`:
 *
 *     if (pathname === '/registo') {
 *       const nome = enforceCSP
 *         ? 'Content-Security-Policy'
 *         : 'Content-Security-Policy-Report-Only';
 *       securityHeaders[nome] = cspRegisto(nonce, isDev);
 *     }
 *
 * Enquanto não for aplicada, o Turnstile funciona à mesma: a CSP do ERP está
 * em report-only por omissão e não bloqueia nada. O dia em que
 * `CSP_ENFORCE=true` for ligado — e é outra lane que o liga — o widget deixa
 * de carregar. É esse o gap, e está no handoff com o dono.
 *
 * O que a política muda face à geral, e só isto:
 *   · `script-src` ganha `https://challenges.cloudflare.com` (o widget);
 *   · `frame-src` passa de `'none'` para a mesma origem (o desafio é um
 *     `<iframe>`).
 * Tudo o resto é idêntico — e é o teste que o garante, directiva a directiva.
 */

export const TURNSTILE_ORIGEM = 'https://challenges.cloudflare.com';

/**
 * Espelha `buildCspPolicy` (`src/lib/security/headers.ts`) com as duas
 * directivas acima alteradas. Os parâmetros são os mesmos por construção: o
 * dia em que o middleware a aplicar, aplica-a com o nonce do pedido, sem
 * perder o que a política geral já dava.
 */
export function cspRegisto(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval' ${TURNSTILE_ORIGEM}`
    : `'self' 'nonce-${nonce}' ${TURNSTILE_ORIGEM}`;

  const connectSrc = isDev
    ? "'self' ws://localhost:* wss://localhost:*"
    : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://images.pexels.com https://images.unsplash.com",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    `frame-src ${TURNSTILE_ORIGEM}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
  ].join('; ');
}
