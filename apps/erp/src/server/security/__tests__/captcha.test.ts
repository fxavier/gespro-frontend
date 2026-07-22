import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verificarCaptcha } from '../captcha';

const ORIGINAL = { ...process.env };

/** `process.env.NODE_ENV` é readonly nos tipos do Node — escrita indirecta. */
function setNodeEnv(valor: string) {
  (process.env as Record<string, string>).NODE_ENV = valor;
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.CAPTCHA_PROVIDER;
  delete process.env.CAPTCHA_SECRET_KEY;
  setNodeEnv('test');
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

function mockFetch(resposta: unknown, ok = true) {
  const spy = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, json: async () => resposta }) as unknown as Response,
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('captcha desligado', () => {
  it('passa em dev/teste quando CAPTCHA_PROVIDER=none', async () => {
    expect(await verificarCaptcha('qualquer')).toEqual({ valido: true });
  });

  it('RECUSA em produção — um captcha desligado sem ninguém reparar é pior', async () => {
    setNodeEnv('production');
    process.env.CAPTCHA_PROVIDER = 'none';
    expect(await verificarCaptcha('qualquer')).toEqual({
      valido: false,
      motivo: 'captcha_nao_configurado',
    });
  });
});

describe('verificação junto do provedor', () => {
  it('aceita quando o provedor devolve success=true', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET_KEY = 'sk';
    const f = mockFetch({ success: true });

    expect(await verificarCaptcha('token', '1.2.3.4')).toEqual({ valido: true });
    expect(f).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('suporta hCaptcha', async () => {
    process.env.CAPTCHA_PROVIDER = 'hcaptcha';
    process.env.CAPTCHA_SECRET_KEY = 'sk';
    const f = mockFetch({ success: true });
    await verificarCaptcha('token');
    expect(f.mock.calls[0]?.[0]).toBe('https://hcaptcha.com/siteverify');
  });

  it('rejeita quando o provedor devolve success=false', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET_KEY = 'sk';
    mockFetch({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await verificarCaptcha('token')).toEqual({ valido: false, motivo: 'captcha_invalido' });
  });

  it('rejeita (fail-closed) quando o provedor está indisponível', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET_KEY = 'sk';
    mockFetch({}, false);
    expect(await verificarCaptcha('token')).toEqual({
      valido: false,
      motivo: 'captcha_indisponivel',
    });
  });

  it('rejeita (fail-closed) em erro de rede', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET_KEY = 'sk';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );
    expect(await verificarCaptcha('token')).toEqual({
      valido: false,
      motivo: 'captcha_indisponivel',
    });
  });

  it('rejeita quando o provedor é conhecido mas falta o segredo', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    expect(await verificarCaptcha('token')).toEqual({
      valido: false,
      motivo: 'captcha_nao_configurado',
    });
  });

  it('rejeita provedor desconhecido', async () => {
    process.env.CAPTCHA_PROVIDER = 'inventado';
    process.env.CAPTCHA_SECRET_KEY = 'sk';
    expect(await verificarCaptcha('token')).toEqual({
      valido: false,
      motivo: 'captcha_nao_configurado',
    });
  });
});
