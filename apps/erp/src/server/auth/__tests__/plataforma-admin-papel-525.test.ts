/**
 * ORÁCULO — issue #525 (nó B:admin-plataforma): o papel de realm
 * `plataforma-admin` lido do access token do Keycloak.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (ADR-0011 §5; ADR-0049 em escrita):
 *   - `src/server/auth/direct-grant.ts` exporta `plataformaAdminDoToken(accessToken)`
 *     → `true` SÓ se `realm_access.roles` do token contém `plataforma-admin`;
 *     ausente, mal formado, papel de CLIENTE com o mesmo nome, ou token
 *     ilegível → `false` (fail-closed, como `emailVerificadoDoToken`);
 *   - `autenticarPorPalavraPasse` devolve, no ramo `ok: true`, o campo
 *     `plataformaAdmin: boolean` lido do access token.
 *
 * Lido dinamicamente (`as any`) para que cada caso falhe pela asserção e não o
 * ficheiro inteiro.
 *
 * ESTADO ESPERADO antes da implementação: RED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/server/observability/logger', () => {
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => logger,
  };
  return { logger };
});

import * as directGrant from '../direct-grant';
import { __limparCacheAdminToken } from '../keycloak';

const mod = directGrant as any;

function token(payload: Record<string, unknown>): string {
  return `cabecalho.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.assinatura`;
}

function resposta(status: number, corpo: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

function extrair(accessToken: string): unknown {
  expect(
    typeof mod.plataformaAdminDoToken,
    '`plataformaAdminDoToken` tem de ser exportado de src/server/auth/direct-grant.ts (#525)',
  ).toBe('function');
  return mod.plataformaAdminDoToken(accessToken);
}

beforeEach(() => {
  fetchMock.mockReset();
  __limparCacheAdminToken();
  process.env.KEYCLOAK_ISSUER = 'http://localhost:8081/realms/gespro';
  delete process.env.KEYCLOAK_ISSUER_INTERNO;
  process.env.KEYCLOAK_CLIENT_ID = 'gespro-erp';
  process.env.KEYCLOAK_CLIENT_SECRET = 'segredo-do-cliente';
});

describe('plataformaAdminDoToken — leitura de realm_access.roles', () => {
  it('com o papel no realm → true', () => {
    expect(
      extrair(token({ sub: 's', realm_access: { roles: ['offline_access', 'plataforma-admin'] } })),
    ).toBe(true);
  });

  it('sem realm_access → false', () => {
    expect(extrair(token({ sub: 's' }))).toBe(false);
  });

  it('realm_access com outros papéis → false', () => {
    expect(
      extrair(token({ sub: 's', realm_access: { roles: ['offline_access', 'uma_authorization'] } })),
    ).toBe(false);
  });

  it('realm_access sem `roles`, ou `roles` que não é lista → false', () => {
    expect(extrair(token({ sub: 's', realm_access: {} }))).toBe(false);
    expect(extrair(token({ sub: 's', realm_access: { roles: 'plataforma-admin' } }))).toBe(false);
  });

  it('o mesmo nome como papel de CLIENTE não conta — só o papel de realm', () => {
    expect(
      extrair(
        token({
          sub: 's',
          resource_access: { 'gespro-erp': { roles: ['plataforma-admin'] } },
        }),
      ),
    ).toBe(false);
  });

  it('nome parecido não conta (comparação exacta)', () => {
    expect(
      extrair(token({ sub: 's', realm_access: { roles: ['Plataforma-Admin', 'plataforma-admin-x'] } })),
    ).toBe(false);
  });

  it('token ilegível → false, sem lançar', () => {
    expect(extrair('nao-e-um-jwt')).toBe(false);
    expect(extrair('a.%%%.c')).toBe(false);
  });
});

describe('autenticarPorPalavraPasse propaga `plataformaAdmin`', () => {
  it('token com o papel → plataformaAdmin: true', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, {
        access_token: token({ sub: 'sub-plat', realm_access: { roles: ['plataforma-admin'] } }),
        refresh_token: 'r',
      }),
    );
    const r = await directGrant.autenticarPorPalavraPasse('plataforma@gespro.mz', 'x');
    expect(r).toMatchObject({ ok: true, sub: 'sub-plat', plataformaAdmin: true });
  });

  it('token sem o papel → plataformaAdmin: false (presente, não ausente)', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, {
        access_token: token({ sub: 'sub-t', realm_access: { roles: ['offline_access'] } }),
        refresh_token: 'r',
      }),
    );
    const r = await directGrant.autenticarPorPalavraPasse('admin@demo.mz', 'x');
    expect(r.ok).toBe(true);
    expect((r as Record<string, unknown>).plataformaAdmin).toBe(false);
  });
});
