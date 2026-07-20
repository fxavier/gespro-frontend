/**
 * Testes de redacção do logger.
 *
 * Verifica que segredos/PII nunca aparecem nos logs:
 *   - password/senha
 *   - token, accessToken, refreshToken
 *   - authorization header
 *   - secret, clientSecret, apiKey
 *   - nuit, bi (identificadores moçambicanos)
 * E que campos inofensivos não são redactados.
 */
import { describe, expect, it } from 'vitest';
import { redactObject } from '../logger';

describe('redactObject — campos sensíveis', () => {
  it('redacta password', () => {
    const out = redactObject({ password: 'super-secret-123' }) as Record<string, unknown>;
    expect(out['password']).toBe('[REDACTED]');
  });

  it('redacta senha', () => {
    const out = redactObject({ senha: 'abc123' }) as Record<string, unknown>;
    expect(out['senha']).toBe('[REDACTED]');
  });

  it('redacta authorization', () => {
    const out = redactObject({ authorization: 'Bearer eyJhbGci...' }) as Record<string, unknown>;
    expect(out['authorization']).toBe('[REDACTED]');
  });

  it('redacta token (exact)', () => {
    const out = redactObject({ token: 'abc' }) as Record<string, unknown>;
    expect(out['token']).toBe('[REDACTED]');
  });

  it('redacta accessToken', () => {
    const out = redactObject({ accessToken: 'xyz' }) as Record<string, unknown>;
    expect(out['accessToken']).toBe('[REDACTED]');
  });

  it('redacta refreshToken', () => {
    const out = redactObject({ refreshToken: 'xyz' }) as Record<string, unknown>;
    expect(out['refreshToken']).toBe('[REDACTED]');
  });

  it('redacta apiKey', () => {
    const out = redactObject({ apiKey: 'key123' }) as Record<string, unknown>;
    expect(out['apiKey']).toBe('[REDACTED]');
  });

  it('redacta campos que contêm "secret"', () => {
    const out = redactObject({ clientSecret: 'shhh', mySecret: 'val' }) as Record<string, unknown>;
    expect(out['clientSecret']).toBe('[REDACTED]');
    expect(out['mySecret']).toBe('[REDACTED]');
  });

  it('redacta nuit (identificador fiscal moçambicano)', () => {
    const out = redactObject({ nuit: '123456789' }) as Record<string, unknown>;
    expect(out['nuit']).toBe('[REDACTED]');
  });

  it('redacta bi (bilhete de identidade)', () => {
    const out = redactObject({ bi: 'ABCDE123MZ' }) as Record<string, unknown>;
    expect(out['bi']).toBe('[REDACTED]');
  });

  it('redacta campos contendo "token" no nome', () => {
    const out = redactObject({ csrfToken: 'abc', db_token: 'xyz' }) as Record<string, unknown>;
    expect(out['csrfToken']).toBe('[REDACTED]');
    expect(out['db_token']).toBe('[REDACTED]');
  });

  it('NÃO redacta campos inofensivos', () => {
    const out = redactObject({
      tenantId: 't1',
      userId: 'u1',
      requestId: 'req-123',
      status: 200,
      duration: 42,
      method: 'GET',
      url: '/api/health',
      msg: 'request start',
    }) as Record<string, unknown>;

    expect(out['tenantId']).toBe('t1');
    expect(out['userId']).toBe('u1');
    expect(out['requestId']).toBe('req-123');
    expect(out['status']).toBe(200);
    expect(out['duration']).toBe(42);
    expect(out['method']).toBe('GET');
    expect(out['url']).toBe('/api/health');
    expect(out['msg']).toBe('request start');
  });

  it('redacta recursivamente em objectos aninhados', () => {
    const out = redactObject({
      user: { email: 'user@example.com', password: 'abc123' },
    }) as Record<string, { email: string; password: string }>;

    expect(out['user'].email).toBe('user@example.com');
    expect(out['user'].password).toBe('[REDACTED]');
  });

  it('redacta em arrays', () => {
    const out = redactObject([
      { name: 'Alice', password: 'p1' },
      { name: 'Bob', password: 'p2' },
    ]) as Array<{ name: string; password: string }>;

    expect(out[0].name).toBe('Alice');
    expect(out[0].password).toBe('[REDACTED]');
    expect(out[1].password).toBe('[REDACTED]');
  });

  it('preserva primitivos (string, number, null, undefined)', () => {
    expect(redactObject('hello')).toBe('hello');
    expect(redactObject(42)).toBe(42);
    expect(redactObject(null)).toBeNull();
    expect(redactObject(undefined)).toBeUndefined();
  });
});

describe('redactObject — output não contém segredos', () => {
  it('log de request não vaza password', () => {
    const logData = {
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'user@test.mz', password: 'demo1234', nuit: '123456789' },
      headers: { authorization: 'Basic dXNlcjpwYXNz', 'content-type': 'application/json' },
    };

    const out = JSON.stringify(redactObject(logData));

    expect(out).not.toContain('demo1234');
    expect(out).not.toContain('123456789');
    expect(out).not.toContain('Basic dXNlcjpwYXNz');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('user@test.mz'); // email não é redactado por chave
    expect(out).toContain('/api/auth/login');
  });
});
