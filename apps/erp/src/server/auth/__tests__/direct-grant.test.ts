/**
 * Direct Access Grant (ADR-0029) — rede dublada com stub de `fetch`.
 *
 * Esta é a fronteira por onde as palavras-passe passam. Os testes aqui
 * cobrem sobretudo o que NÃO pode acontecer: a palavra-passe não pode sair
 * em log, e cada recusa do Keycloak tem de ser distinguida — «credenciais
 * erradas» e «conta por activar» levam o utilizador a sítios diferentes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const logs: unknown[] = [];
vi.mock('@/server/observability/logger', () => ({
  logger: {
    info: (...a: unknown[]) => logs.push(a),
    warn: (...a: unknown[]) => logs.push(a),
    error: (...a: unknown[]) => logs.push(a),
    debug: (...a: unknown[]) => logs.push(a),
  },
}));

import { autenticarPorPalavraPasse } from '../direct-grant';

function resposta(status: number, corpo: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

/** Access token com um `sub` — só a payload interessa; não se verifica assinatura. */
function tokenCom(sub: string, emailVerificado?: boolean): string {
  const payload = Buffer.from(
    JSON.stringify(emailVerificado === undefined ? { sub } : { sub, email_verified: emailVerificado }),
  ).toString('base64url');
  return `cabecalho.${payload}.assinatura`;
}

const SEGREDO = 'palavra-passe-secretissima';

beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  process.env.KEYCLOAK_ISSUER = 'http://localhost:8081/realms/gespro';
  delete process.env.KEYCLOAK_ISSUER_INTERNO;
  process.env.KEYCLOAK_CLIENT_ID = 'gespro-erp';
  process.env.KEYCLOAK_CLIENT_SECRET = 'segredo-do-cliente';
});

describe('autenticarPorPalavraPasse — caminho feliz', () => {
  it('devolve o sub extraído do access token e o refresh token', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, {
        access_token: tokenCom('sub-abc-123'),
        refresh_token: 'refresh-xyz',
        expires_in: 300,
      }),
    );

    const r = await autenticarPorPalavraPasse('admin@demo.mz', SEGREDO);

    expect(r).toEqual({
      ok: true,
      sub: 'sub-abc-123',
      refreshToken: 'refresh-xyz',
      // ADR-0031 §6: sem o claim, conta como NÃO verificado (fail-closed).
      emailVerificado: false,
    });
  });

  it('propaga `email_verified` do access token (ADR-0031 §6)', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, {
        access_token: tokenCom('sub-abc-123', true),
        refresh_token: 'refresh-xyz',
      }),
    );

    const r = await autenticarPorPalavraPasse('admin@demo.mz', SEGREDO);

    expect(r).toMatchObject({ ok: true, emailVerificado: true });
  });

  it('envia grant_type=password para o endpoint de token, com o segredo do cliente', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, { access_token: tokenCom('s'), refresh_token: 'r' }),
    );

    await autenticarPorPalavraPasse('admin@demo.mz', SEGREDO);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8081/realms/gespro/protocol/openid-connect/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('password');
    expect(body.get('username')).toBe('admin@demo.mz');
    expect(body.get('client_secret')).toBe('segredo-do-cliente');
  });
});

describe('autenticarPorPalavraPasse — a palavra-passe não escapa', () => {
  it('não aparece em nenhum log, em nenhum dos desfechos', async () => {
    const desfechos = [
      () => resposta(200, { access_token: tokenCom('s'), refresh_token: 'r' }),
      () => resposta(401, { error: 'invalid_grant', error_description: 'Invalid user credentials' }),
      () => resposta(400, { error: 'invalid_grant', error_description: 'Account is not fully set up' }),
      () => resposta(503, {}),
    ];

    for (const d of desfechos) {
      fetchMock.mockResolvedValueOnce(d());
      await autenticarPorPalavraPasse('admin@demo.mz', SEGREDO);
    }
    fetchMock.mockRejectedValueOnce(new Error('rede em baixo'));
    await autenticarPorPalavraPasse('admin@demo.mz', SEGREDO);

    expect(JSON.stringify(logs)).not.toContain(SEGREDO);
  });

  it('não vem no objecto devolvido, em nenhum dos desfechos', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(401, { error: 'invalid_grant', error_description: 'Invalid user credentials' }),
    );
    const r = await autenticarPorPalavraPasse('admin@demo.mz', SEGREDO);
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
  });
});

describe('autenticarPorPalavraPasse — cada recusa é distinguida', () => {
  it('credenciais erradas', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(401, { error: 'invalid_grant', error_description: 'Invalid user credentials' }),
    );
    expect(await autenticarPorPalavraPasse('a@b.mz', SEGREDO)).toEqual({
      ok: false,
      motivo: 'credenciais',
    });
  });

  it('conta por activar — acções obrigatórias pendentes (ADR-0013 §2)', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(400, { error: 'invalid_grant', error_description: 'Account is not fully set up' }),
    );
    expect(await autenticarPorPalavraPasse('a@b.mz', SEGREDO)).toEqual({
      ok: false,
      motivo: 'conta-por-activar',
    });
  });

  it('conta desactivada no Keycloak', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(400, { error: 'invalid_grant', error_description: 'Account disabled' }),
    );
    expect(await autenticarPorPalavraPasse('a@b.mz', SEGREDO)).toEqual({
      ok: false,
      motivo: 'conta-desactivada',
    });
  });

  it('5xx é indisponibilidade, não recusa — não se diz ao utilizador que errou a senha', async () => {
    fetchMock.mockResolvedValueOnce(resposta(503, {}));
    expect(await autenticarPorPalavraPasse('a@b.mz', SEGREDO)).toEqual({
      ok: false,
      motivo: 'indisponivel',
    });
  });

  it('falha de rede também é indisponibilidade', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await autenticarPorPalavraPasse('a@b.mz', SEGREDO)).toEqual({
      ok: false,
      motivo: 'indisponivel',
    });
  });

  it('resposta 200 sem sub no token é tratada como indisponibilidade, não como sucesso', async () => {
    const semSub = `c.${Buffer.from(JSON.stringify({ email: 'a@b.mz' })).toString('base64url')}.a`;
    fetchMock.mockResolvedValueOnce(resposta(200, { access_token: semSub, refresh_token: 'r' }));
    expect(await autenticarPorPalavraPasse('a@b.mz', SEGREDO)).toEqual({
      ok: false,
      motivo: 'indisponivel',
    });
  });
});
