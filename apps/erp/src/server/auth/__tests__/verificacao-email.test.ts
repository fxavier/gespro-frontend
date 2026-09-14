/**
 * Testes de `marcarEmailVerificado` e `enviarEmailVerificacao` (ADR-0031 §5).
 * Rede e transporte dublados — o contrato com um Keycloak REAL é do E2E.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const enviar = vi.hoisted(() => vi.fn());
vi.mock('@/server/email', () => ({ emailProvider: { enviar } }));

import { marcarEmailVerificado, enviarEmailVerificacao, __limparCacheAdminToken } from '../keycloak';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function resposta(status: number, corpo: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

function aceitaAdminToken() {
  fetchMock.mockResolvedValueOnce(resposta(200, { access_token: 'admin-token', expires_in: 60 }));
}

const SUB = '33333333-3333-4333-8333-333333333333';
const EMAIL = 'ana@padaria.mz';

beforeEach(() => {
  vi.clearAllMocks();
  __limparCacheAdminToken();
  process.env.KEYCLOAK_ISSUER = 'http://localhost:8081/realms/gespro';
  process.env.EMAIL_VERIFY_SECRET = 'segredo-de-teste-distinto-do-auth';
  process.env.APP_URL = 'https://app.gestpro.co.mz';
});

afterEach(() => {
  delete process.env.KEYCLOAK_ISSUER;
  delete process.env.EMAIL_VERIFY_SECRET;
  delete process.env.APP_URL;
});

describe('marcarEmailVerificado', () => {
  it('faz PUT parcial com emailVerified — não apaga o resto do utilizador', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(204));

    await marcarEmailVerificado(SUB);

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`http://localhost:8081/admin/realms/gespro/users/${SUB}`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ emailVerified: true });
  });

  it('a segunda chamada é igual à primeira — pôr true num true é 204', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValue(resposta(204));
    await expect(marcarEmailVerificado(SUB)).resolves.toBeUndefined();
    await expect(marcarEmailVerificado(SUB)).resolves.toBeUndefined();
  });

  it('lança quando o Keycloak recusa — quem chama decide o que mostrar', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(404));
    await expect(marcarEmailVerificado(SUB)).rejects.toThrow(/404/);
  });
});

describe('enviarEmailVerificacao', () => {
  it('envia para o endereço com uma ligação assinada para a rota pública', async () => {
    enviar.mockResolvedValueOnce(undefined);

    await expect(enviarEmailVerificacao(SUB, EMAIL)).resolves.toBe(true);

    const dto = enviar.mock.calls[0]![0] as { para: string; html: string; texto: string };
    expect(dto.para).toBe(EMAIL);
    expect(dto.texto).toContain(
      'https://app.gestpro.co.mz/api/publico/verificar-email?t=',
    );
    // Assinatura presente: a carga e a assinatura separadas por ponto.
    const url = /verificar-email\?t=([^\s"]+)/.exec(dto.texto)![1]!;
    expect(decodeURIComponent(url)).toContain('.');
  });

  it('falha do transporte devolve false e NÃO lança — o tenant já existe', async () => {
    enviar.mockRejectedValueOnce(new Error('SMTP em baixo'));
    await expect(enviarEmailVerificacao(SUB, EMAIL)).resolves.toBe(false);
  });

  it('escapa HTML vindo do endereço — o registo é público', async () => {
    enviar.mockResolvedValueOnce(undefined);
    await enviarEmailVerificacao(SUB, '<script>alerta</script>@x.mz');

    const dto = enviar.mock.calls[0]![0] as { html: string };
    expect(dto.html).not.toContain('<script>alerta</script>');
    expect(dto.html).toContain('&lt;script&gt;');
  });
});
