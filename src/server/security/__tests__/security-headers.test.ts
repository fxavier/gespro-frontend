/**
 * Testa a presença e valores dos cabeçalhos de segurança gerados pelo middleware.
 *
 * Importa a mesma lógica de src/lib/security/headers.ts que o middleware.ts usa —
 * garantia de que os testes exercem exactamente o código de produção (sem cópia).
 *
 * Validação runtime completa: smoke test autenticado ou e2e após deploy.
 */

import { describe, it, expect } from 'vitest';
import { buildCspPolicy, buildSecurityHeaders } from '@/lib/security/headers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

function sampleNonce(): string {
  // Compatível com Vitest (Node): simula o mesmo comprimento que btoa(16 bytes) produz
  return Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex').toString('base64');
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('buildCspPolicy', () => {
  const nonce = sampleNonce();

  describe('modo desenvolvimento', () => {
    const csp = buildCspPolicy(nonce, true);

    it('inclui o nonce em script-src', () => {
      expect(csp).toContain(`'nonce-${nonce}'`);
    });

    it("inclui 'unsafe-eval' para Turbopack HMR", () => {
      expect(csp).toContain("'unsafe-eval'");
    });

    it('inclui WebSocket em connect-src para HMR', () => {
      expect(csp).toContain('ws://localhost:*');
    });
  });

  describe('modo produção', () => {
    const csp = buildCspPolicy(nonce, false);

    it('inclui o nonce em script-src', () => {
      expect(csp).toContain(`'nonce-${nonce}'`);
    });

    it("NÃO inclui 'unsafe-eval'", () => {
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('NÃO inclui WebSocket em connect-src', () => {
      expect(csp).not.toContain('ws://');
    });

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

    it("script-src não contém 'unsafe-inline'", () => {
      const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it('script-src não contém wildcard *', () => {
      const scriptSrc = csp
        .split(';')
        .find((d) => d.trim().startsWith('script-src'))!
        .replace(`'nonce-${nonce}'`, '');
      expect(scriptSrc).not.toMatch(/\*/);
    });
  });
});

describe('buildSecurityHeaders', () => {
  const nonce = sampleNonce();

  describe('report-only (desenvolvimento, enforceCSP=false)', () => {
    const headers = buildSecurityHeaders({ nonce, isDev: true, enforceCSP: false });

    it('CSP em report-only, não enforce', () => {
      expect(headers['Content-Security-Policy-Report-Only']).toBeDefined();
      expect(headers['Content-Security-Policy']).toBeUndefined();
    });

    it('não emite HSTS em desenvolvimento', () => {
      expect(headers['Strict-Transport-Security']).toBeUndefined();
    });

    it('propaga o nonce via x-nonce', () => {
      expect(headers['x-nonce']).toBe(nonce);
    });
  });

  describe('enforce (produção, enforceCSP=true)', () => {
    const headers = buildSecurityHeaders({ nonce, isDev: false, enforceCSP: true });

    it('CSP em enforce, não report-only', () => {
      expect(headers['Content-Security-Policy']).toBeDefined();
      expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined();
    });

    it('HSTS presente e correcto', () => {
      const hsts = headers['Strict-Transport-Security'];
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=63072000');
      expect(hsts).toContain('includeSubDomains');
      // Sem preload por omissão (irreversível)
      expect(hsts).not.toContain('preload');
    });

    it('X-Frame-Options: DENY', () => {
      expect(headers['X-Frame-Options']).toBe('DENY');
    });

    it('X-Content-Type-Options: nosniff', () => {
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('Referrer-Policy correcto', () => {
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('Permissions-Policy desactiva features perigosas', () => {
      const pp = headers['Permissions-Policy'];
      expect(pp).toContain('camera=()');
      expect(pp).toContain('microphone=()');
      expect(pp).toContain('geolocation=()');
      expect(pp).toContain('payment=()');
      expect(pp).toContain('usb=()');
    });

    it('propaga o nonce via x-nonce', () => {
      expect(headers['x-nonce']).toBe(nonce);
    });
  });
});

describe('CORS wildcard ausente (next.config.ts)', () => {
  it('next.config não define Access-Control-Allow-Origin', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const configPath = path.resolve(dir, '../../../../next.config.ts');
    const config = readFileSync(configPath, 'utf-8');
    expect(config).not.toContain('Access-Control-Allow-Origin');
  });
});

describe('Nonce CSP', () => {
  it('cada chamada gera valor único', () => {
    const nonces = new Set(Array.from({ length: 20 }, sampleNonce));
    expect(nonces.size).toBe(20);
  });

  it('nonce tem comprimento adequado (>=16 chars)', () => {
    const nonce = sampleNonce();
    expect(nonce.length).toBeGreaterThanOrEqual(16);
  });
});
