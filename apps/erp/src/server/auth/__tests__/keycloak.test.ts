/**
 * Testes unitários do cliente Keycloak (`src/server/auth/keycloak.ts`) —
 * rede dublada com stub de `fetch`. O contrato com um Keycloak REAL é provado
 * pela suite E2E (gate da fase 2, ADR-0013 §6).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  kcConfig,
  intervaloResolucaoSegundos,
  tectoSessaoSegundos,
  renovarTokens,
  garantirUtilizador,
  procurarPorEmail,
  definirActivo,
  __limparCacheAdminToken,
} from '../keycloak';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function resposta(status: number, corpo: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as Response;
}

/** O 1.º fetch de qualquer chamada admin é o client_credentials. */
function aceitaAdminToken() {
  fetchMock.mockResolvedValueOnce(
    resposta(200, { access_token: 'admin-token', expires_in: 60 }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __limparCacheAdminToken();
  process.env.KEYCLOAK_ISSUER = 'http://localhost:8081/realms/gespro';
  delete process.env.KEYCLOAK_ISSUER_INTERNO;
  delete process.env.AUTH_SESSION_MAX_AGE;
  delete process.env.KEYCLOAK_SSO_MAX_SECONDS;
});

afterEach(() => {
  delete process.env.KEYCLOAK_ISSUER;
});

describe('kcConfig', () => {
  it('deriva realm e base da Admin API do issuer interno', () => {
    process.env.KEYCLOAK_ISSUER_INTERNO = 'http://keycloak:8080/realms/gespro';
    const cfg = kcConfig();
    expect(cfg.realm).toBe('gespro');
    expect(cfg.adminBase).toBe('http://keycloak:8080/admin/realms/gespro');
    expect(cfg.issuer).toBe('http://localhost:8081/realms/gespro');
  });

  it('sem issuer interno, o backchannel usa o issuer público', () => {
    const cfg = kcConfig();
    expect(cfg.issuerInterno).toBe(cfg.issuer);
  });
});

describe('durações de sessão por ambiente (ADR-0011/0013 §6)', () => {
  it('omissões: 900 s de re-resolução, 43 200 s de tecto', () => {
    expect(intervaloResolucaoSegundos()).toBe(900);
    expect(tectoSessaoSegundos()).toBe(43_200);
  });

  it('o E2E pode pô-las em segundos', () => {
    process.env.AUTH_SESSION_MAX_AGE = '8';
    expect(intervaloResolucaoSegundos()).toBe(8);
  });

  it('valores inválidos caem na omissão, nunca em NaN', () => {
    process.env.AUTH_SESSION_MAX_AGE = 'batata';
    expect(intervaloResolucaoSegundos()).toBe(900);
  });
});

describe('renovarTokens — renovação silenciosa', () => {
  it('devolve os tokens novos quando o Keycloak aceita', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, { access_token: 'novo', refresh_token: 'refresh-novo', expires_in: 300 }),
    );
    const r = await renovarTokens('refresh-antigo');
    expect(r).toEqual({
      ok: true,
      accessToken: 'novo',
      refreshToken: 'refresh-novo',
      expiresIn: 300,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:8081/realms/gespro/protocol/openid-connect/token');
    expect(String(init.body)).toContain('grant_type=refresh_token');
  });

  it('4xx = recusada — a sessão SSO terminou e a do ERP tem de cair', async () => {
    fetchMock.mockResolvedValueOnce(resposta(400, { error: 'invalid_grant' }));
    expect(await renovarTokens('morto')).toEqual({ ok: false, motivo: 'recusada' });
  });

  it('5xx/rede = indisponível — quem tem sessão NÃO é expulso (ADR-0010)', async () => {
    fetchMock.mockResolvedValueOnce(resposta(503));
    expect(await renovarTokens('x')).toEqual({ ok: false, motivo: 'indisponivel' });

    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await renovarTokens('x')).toEqual({ ok: false, motivo: 'indisponivel' });
  });
});

describe('garantirUtilizador — idempotência por e-mail (ADR-0013 §5-bis)', () => {
  it('reutiliza o sub quando o e-mail já existe no realm', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(200, [{ id: 'sub-existente' }]));
    expect(await garantirUtilizador({ email: 'a@b.mz', nome: 'Ana' })).toEqual({
      sub: 'sub-existente',
      criado: false,
    });
    // Nenhum POST de criação.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cria com VERIFY_EMAIL + UPDATE_PASSWORD pendentes e SEM credencial', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(200, [])); // procura: vazio
    fetchMock.mockResolvedValueOnce(resposta(201)); // criação
    fetchMock.mockResolvedValueOnce(resposta(200, [{ id: 'sub-novo' }])); // releitura
    // `criado: true` só com o 201 do Keycloak — é o que desempata corridas
    // (ADR-0031 §2-bis); uma leitura prévia diria `true` aos dois pedidos.
    expect(await garantirUtilizador({ email: 'a@b.mz', nome: 'Ana Sitoe' })).toEqual({
      sub: 'sub-novo',
      criado: true,
    });

    const corpo = JSON.parse(String(fetchMock.mock.calls[2][1].body));
    expect(corpo.requiredActions).toEqual(['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
    expect(corpo.enabled).toBe(true);
    expect(corpo).not.toHaveProperty('credentials');
  });

  it('numa corrida (409), reutiliza o sub de quem ganhou', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(200, [])); // procura: vazio
    fetchMock.mockResolvedValueOnce(resposta(409)); // criação: já existe
    fetchMock.mockResolvedValueOnce(resposta(200, [{ id: 'sub-do-outro' }])); // reprocura
    // Quem apanha o 409 NÃO é o criador — e é isso que o impede de apagar ou
    // reescrever a identidade de quem ganhou a corrida.
    expect(await garantirUtilizador({ email: 'a@b.mz', nome: 'Ana' })).toEqual({
      sub: 'sub-do-outro',
      criado: false,
    });
  });
});

describe('procurarPorEmail', () => {
  it('propaga falha da Admin API como erro (não devolve null enganador)', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(500));
    await expect(procurarPorEmail('a@b.mz')).rejects.toThrow('procura por e-mail falhou');
  });
});

describe('definirActivo', () => {
  it('desactivar também encerra as sessões SSO', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(204)); // PUT enabled=false
    fetchMock.mockResolvedValueOnce(resposta(204)); // POST logout
    await definirActivo('sub-1', false);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[1]).toContain('/users/sub-1');
    expect(urls[2]).toContain('/users/sub-1/logout');
  });

  it('reactivar não faz logout', async () => {
    aceitaAdminToken();
    fetchMock.mockResolvedValueOnce(resposta(204));
    await definirActivo('sub-1', true);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).join(' ')).not.toContain('/logout');
  });
});
