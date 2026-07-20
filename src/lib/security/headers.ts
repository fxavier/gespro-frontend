/**
 * Construção dos cabeçalhos de segurança HTTP — módulo client-safe.
 *
 * Sem imports de globals Edge (crypto.getRandomValues, btoa) nem de server-only.
 * Recebe nonce e opções como parâmetros simples → testável em Vitest puro (Node).
 *
 * Importado TANTO no middleware.ts (edge) COMO nos testes, para garantir que
 * os testes exercem exactamente a mesma lógica de produção.
 */

export interface SecurityHeadersOptions {
  nonce: string;
  isDev: boolean;
  /** true → Content-Security-Policy; false/omit → Content-Security-Policy-Report-Only */
  enforceCSP: boolean;
}

export interface SecurityHeaders {
  [headerName: string]: string;
}

/**
 * Constrói a directiva CSP completa para a aplicação GestPro.
 *
 * Turbopack/dev precisa de:
 *   - 'unsafe-eval' em script-src (HMR runtime)
 *   - ws://localhost:* em connect-src (HMR WebSocket)
 */
export function buildCspPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}'`;

  const connectSrc = isDev
    ? "'self' ws://localhost:* wss://localhost:*"
    : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Next.js injeta CSS crítico inline; Tailwind usa inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Imagens: self + data URI + fontes externas declaradas em next.config.ts
    "img-src 'self' data: https://images.pexels.com https://images.unsplash.com",
    // next/font self-hosted após build
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
  ].join('; ');
}

/**
 * Devolve o Record de cabeçalhos de segurança HTTP prontos a aplicar à resposta.
 *
 * HSTS só em produção (não emitir em dev sobre HTTP local).
 * CSP em report-only por omissão; enforce via opção `enforceCSP: true`.
 */
export function buildSecurityHeaders(opts: SecurityHeadersOptions): SecurityHeaders {
  const { nonce, isDev, enforceCSP } = opts;
  const cspPolicy = buildCspPolicy(nonce, isDev);
  const cspHeaderName = enforceCSP
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';

  const headers: SecurityHeaders = {
    [cspHeaderName]: cspPolicy,
    'x-nonce': nonce,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
    ].join(', '),
  };

  // HSTS — apenas HTTPS; sem `preload` por omissão (irreversível; requer submissão manual)
  if (!isDev) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  }

  return headers;
}
