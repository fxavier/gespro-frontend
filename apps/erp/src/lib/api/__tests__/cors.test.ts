/**
 * Testa o utilitário de CORS explícito por handler.
 * Verifica que NUNCA emite Access-Control-Allow-Origin: * (wildcard).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildCorsHeaders, corsPreflightResponse } from '../cors';

describe('buildCorsHeaders', () => {
  beforeEach(() => {
    // Sem ALLOWED_ORIGINS configurado
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sem ALLOWED_ORIGINS não emite Access-Control-Allow-Origin', () => {
    const req = new Request('https://api.example.com/data', {
      headers: { origin: 'https://evil.example.com' },
    });
    const headers = buildCorsHeaders(req) as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('nunca emite wildcard (*)', () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://app.gespro.mz');
    const req = new Request('https://api.example.com/data', {
      headers: { origin: 'https://app.gespro.mz' },
    });
    const headers = buildCorsHeaders(req) as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('origem na allowlist é reflectida', () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://app.gespro.mz,https://parceiro.mz');
    const req = new Request('https://api.example.com/data', {
      headers: { origin: 'https://app.gespro.mz' },
    });
    const headers = buildCorsHeaders(req) as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.gespro.mz');
  });

  it('origem fora da allowlist não é reflectida', () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://app.gespro.mz');
    const req = new Request('https://api.example.com/data', {
      headers: { origin: 'https://atacante.xyz' },
    });
    const headers = buildCorsHeaders(req) as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('inclui Vary: Origin', () => {
    const req = new Request('https://api.example.com/data');
    const headers = buildCorsHeaders(req) as Record<string, string>;
    expect(headers['Vary']).toBe('Origin');
  });

  it('com credenciais activas emite Access-Control-Allow-Credentials', () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://app.gespro.mz');
    const req = new Request('https://api.example.com/data', {
      headers: { origin: 'https://app.gespro.mz' },
    });
    const headers = buildCorsHeaders(req, { credentials: true }) as Record<string, string>;
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });
});

describe('corsPreflightResponse', () => {
  it('devolve status 204', () => {
    const req = new Request('https://api.example.com/data', { method: 'OPTIONS' });
    const res = corsPreflightResponse(req);
    expect(res.status).toBe(204);
  });
});
