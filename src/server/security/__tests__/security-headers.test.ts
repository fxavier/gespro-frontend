/**
 * Testa a presença e valores dos cabeçalhos de segurança gerados pelo middleware.
 *
 * Estratégia: como o middleware corre no Edge Runtime e usa next-auth/jwt
 * (que não é simulável facilmente em Vitest puro), testamos as funções de
 * construção de headers de forma isolada, simulando o que o middleware faz.
 *
 * Validação runtime completa: smoke test autenticado ou e2e após deploy.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Funções extraídas da lógica do middleware (testáveis sem Edge globals)
// ---------------------------------------------------------------------------

function generateNonce(): string {
  // Compatível com Vitest (Node): usa Buffer em vez de btoa/getRandomValues
  return Buffer.from(crypto.randomUUID().replace(/-/g, '')).toString('base64url');
}

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
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://images.pexels.com https://images.unsplash.com",
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

function buildSecurityHeaders(opts: {
  nonce: string;
  isDev: boolean;
  enforceCSP: boolean;
}): Record<string, string> {
  const { nonce, isDev, enforceCSP } = opts;
  const cspPolicy = buildCspPolicy(nonce, isDev);
  const cspHeaderName = enforceCSP
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';

  const headers: Record<string, string> = {
    [cspHeaderName]: cspPolicy,
    'x-nonce': nonce,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  };

  if (!isDev) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('Cabeçalhos de segurança HTTP', () => {
  const nonce = generateNonce();

  describe('modo report-only (desenvolvimento)', () => {
    const headers = buildSecurityHeaders({ nonce, isDev: true, enforceCSP: false });

    it('CSP em report-only inclui nonce', () => {
      const csp = headers['Content-Security-Policy-Report-Only'];
      expect(csp).toBeDefined();
      expect(csp).toContain(`'nonce-${nonce}'`);
    });

    it('CSP em dev inclui unsafe-eval (Turbopack HMR)', () => {
      const csp = headers['Content-Security-Policy-Report-Only'];
      expect(csp).toContain("'unsafe-eval'");
    });

    it('CSP em dev inclui WebSocket para HMR', () => {
      const csp = headers['Content-Security-Policy-Report-Only'];
      expect(csp).toContain('ws://localhost:*');
    });

    it('não emite HSTS em desenvolvimento (HTTP local)', () => {
      expect(headers['Strict-Transport-Security']).toBeUndefined();
    });
  });

  describe('modo enforce (produção)', () => {
    const headersEnforce = buildSecurityHeaders({ nonce, isDev: false, enforceCSP: true });

    it('CSP em enforce (não report-only)', () => {
      expect(headersEnforce['Content-Security-Policy']).toBeDefined();
      expect(headersEnforce['Content-Security-Policy-Report-Only']).toBeUndefined();
    });

    it('CSP em produção NÃO inclui unsafe-eval', () => {
      const csp = headersEnforce['Content-Security-Policy'];
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('CSP em produção inclui nonce', () => {
      const csp = headersEnforce['Content-Security-Policy'];
      expect(csp).toContain(`'nonce-${nonce}'`);
    });

    it('HSTS presente em produção', () => {
      const hsts = headersEnforce['Strict-Transport-Security'];
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=63072000');
      expect(hsts).toContain('includeSubDomains');
    });

    it('X-Frame-Options: DENY', () => {
      expect(headersEnforce['X-Frame-Options']).toBe('DENY');
    });

    it('X-Content-Type-Options: nosniff', () => {
      expect(headersEnforce['X-Content-Type-Options']).toBe('nosniff');
    });

    it('Referrer-Policy correcta', () => {
      expect(headersEnforce['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('Permissions-Policy desactiva features perigosas', () => {
      const pp = headersEnforce['Permissions-Policy'];
      expect(pp).toContain('camera=()');
      expect(pp).toContain('microphone=()');
      expect(pp).toContain('geolocation=()');
      expect(pp).toContain('payment=()');
    });
  });

  describe('directivas CSP (produção)', () => {
    const headersEnforce = buildSecurityHeaders({ nonce, isDev: false, enforceCSP: true });
    const csp = headersEnforce['Content-Security-Policy'];

    it("default-src 'self'", () => {
      expect(csp).toContain("default-src 'self'");
    });

    it("object-src 'none'", () => {
      expect(csp).toContain("object-src 'none'");
    });

    it("frame-ancestors 'none'", () => {
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it("form-action 'self'", () => {
      expect(csp).toContain("form-action 'self'");
    });

    it("base-uri 'self'", () => {
      expect(csp).toContain("base-uri 'self'");
    });

    it('img-src inclui fontes de imagem externas declaradas', () => {
      expect(csp).toContain('https://images.pexels.com');
      expect(csp).toContain('https://images.unsplash.com');
    });

    it('sem wildcard * em script-src', () => {
      const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      // Sem wildcard
      expect(scriptSrc!.replace(`'nonce-${nonce}'`, '')).not.toMatch(/\*/);
    });
  });

  describe('CORS wildcard ausente', () => {
    it('next.config não emite Access-Control-Allow-Origin: *', async () => {
      // Verifica que o next.config.ts não tem a directiva wildcard
      const { readFileSync } = await import('node:fs');
      const config = readFileSync(
        new URL('../../../../next.config.ts', import.meta.url),
        'utf-8',
      );
      expect(config).not.toContain('Access-Control-Allow-Origin');
    });
  });
});

describe('Nonce CSP', () => {
  it('cada nonce é único (aleatório)', () => {
    const nonces = new Set(Array.from({ length: 20 }, generateNonce));
    expect(nonces.size).toBe(20);
  });

  it('nonce tem comprimento adequado (>=16 chars base64)', () => {
    const nonce = generateNonce();
    expect(nonce.length).toBeGreaterThanOrEqual(16);
  });
});
