/**
 * #185 — «convite por concluir» não é «palavra-passe provisória».
 *
 * O Keycloak responde à palavra-passe CERTA de uma conta com acções
 * obrigatórias pendentes sempre com a mesma frase («Account is not fully set
 * up»), quer a pendência seja só `UPDATE_PASSWORD` (palavra-passe atribuída ou
 * reposta pelo administrador — ADR-0030) quer inclua `VERIFY_EMAIL` (convite
 * por e-mail ainda não concluído — ADR-0013 §5-bis). Até aqui as duas davam
 * `conta-por-activar` e levavam ao ecrã «Defina a sua palavra-passe», que no
 * caso do convite é um beco: muda-se a palavra-passe, o `VERIFY_EMAIL` fica, e
 * o *direct grant* volta a recusar.
 *
 * Contrato (orquestrador, nó C:convite-provisoria-185):
 *  - pendência com `VERIFY_EMAIL` → motivo `convite-por-concluir`;
 *  - pendência só com `UPDATE_PASSWORD` → `conta-por-activar` (inalterado);
 *  - a distinção lê as acções obrigatórias da identidade na Admin API, e SÓ
 *    depois de o Keycloak ter aceitado a palavra-passe: «credenciais erradas»
 *    nunca consulta o realm (não se enumeram contas);
 *  - se a consulta falhar, `indisponivel` — nunca o ecrã errado por omissão;
 *  - a palavra-passe não sai para a Admin API nem para os logs.
 *
 * Rede dublada por um router de `fetch` por URL/grant, para que a ordem das
 * chamadas da implementação não seja contrato.
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
import { __limparCacheAdminToken } from '../keycloak';

const ISSUER = 'http://localhost:8081/realms/gespro';
const ADMIN_BASE = 'http://localhost:8081/admin/realms/gespro';
const SEGREDO = 'palavra-passe-secretissima-185';
const EMAIL = 'convidado.185@demo.mz';
const SUB = 'sub-convidado-185';

function resposta(status: number, corpo: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

type Cenario = {
  /** Resposta do endpoint de token ao grant `password`. */
  grantPassword: () => Response;
  /** Acções obrigatórias da identidade no realm (ou `null` = Admin API em baixo). */
  requiredActions: string[] | null;
};

const chamadasAdmin: string[] = [];

function montarRede(c: Cenario) {
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u === `${ISSUER}/protocol/openid-connect/token`) {
      const corpo = new URLSearchParams(String(init?.body ?? ''));
      const grant = corpo.get('grant_type');
      if (grant === 'password') return c.grantPassword();
      if (grant === 'client_credentials') {
        if (c.requiredActions === null) return resposta(503, {});
        return resposta(200, { access_token: 'token-da-conta-de-servico', expires_in: 300 });
      }
      return resposta(400, { error: 'unsupported_grant_type' });
    }
    if (u.startsWith(`${ADMIN_BASE}/users`)) {
      chamadasAdmin.push(u + ' ' + String(init?.body ?? ''));
      if (c.requiredActions === null) return resposta(503, {});
      const utilizador = {
        id: SUB,
        username: EMAIL,
        email: EMAIL,
        enabled: true,
        emailVerified: !c.requiredActions.includes('VERIFY_EMAIL'),
        requiredActions: c.requiredActions,
      };
      // Pesquisa (`/users?…`) devolve lista; leitura por id devolve o objecto.
      return resposta(200, u.includes('?') ? [utilizador] : utilizador);
    }
    throw new Error(`fetch inesperado no teste: ${u}`);
  });
}

const naoConfigurada = () =>
  resposta(400, { error: 'invalid_grant', error_description: 'Account is not fully set up' });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  logs.length = 0;
  chamadasAdmin.length = 0;
  __limparCacheAdminToken();
  process.env.KEYCLOAK_ISSUER = ISSUER;
  delete process.env.KEYCLOAK_ISSUER_INTERNO;
  process.env.KEYCLOAK_CLIENT_ID = 'gespro-erp';
  process.env.KEYCLOAK_CLIENT_SECRET = 'segredo-do-cliente';
});

describe('#185 — conta por configurar: convite por concluir vs palavra-passe provisória', () => {
  it('convite por e-mail por concluir (VERIFY_EMAIL + UPDATE_PASSWORD) → `convite-por-concluir`', async () => {
    montarRede({ grantPassword: naoConfigurada, requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'] });

    const r = await autenticarPorPalavraPasse(EMAIL, SEGREDO);

    expect(r).toEqual({ ok: false, motivo: 'convite-por-concluir' });
  });

  it('só VERIFY_EMAIL pendente (palavra-passe já definida, e-mail por confirmar) → `convite-por-concluir`', async () => {
    montarRede({ grantPassword: naoConfigurada, requiredActions: ['VERIFY_EMAIL'] });

    const r = await autenticarPorPalavraPasse(EMAIL, SEGREDO);

    expect(r).toEqual({ ok: false, motivo: 'convite-por-concluir' });
  });

  it('palavra-passe provisória (só UPDATE_PASSWORD) continua a ser `conta-por-activar`', async () => {
    montarRede({ grantPassword: naoConfigurada, requiredActions: ['UPDATE_PASSWORD'] });

    const r = await autenticarPorPalavraPasse(EMAIL, SEGREDO);

    expect(r).toEqual({ ok: false, motivo: 'conta-por-activar' });
  });

  it('consulta a identidade na Admin API para decidir — a distinção vem do realm', async () => {
    montarRede({ grantPassword: naoConfigurada, requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'] });

    await autenticarPorPalavraPasse(EMAIL, SEGREDO);

    expect(chamadasAdmin.length).toBeGreaterThan(0);
  });

  it('Admin API indisponível → `indisponivel`, nunca o ecrã da provisória por omissão', async () => {
    montarRede({ grantPassword: naoConfigurada, requiredActions: null });

    const r = await autenticarPorPalavraPasse(EMAIL, SEGREDO);

    expect(r).toEqual({ ok: false, motivo: 'indisponivel' });
  });
});

describe('#185 — o que a distinção não pode estragar', () => {
  it('credenciais erradas NÃO consultam o realm (não se enumeram contas) e continuam `credenciais`', async () => {
    montarRede({
      grantPassword: () =>
        resposta(401, { error: 'invalid_grant', error_description: 'Invalid user credentials' }),
      requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
    });

    const r = await autenticarPorPalavraPasse(EMAIL, SEGREDO);

    expect(r).toEqual({ ok: false, motivo: 'credenciais' });
    expect(chamadasAdmin).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('conta desactivada NÃO consulta o realm e continua `conta-desactivada`', async () => {
    montarRede({
      grantPassword: () =>
        resposta(400, { error: 'invalid_grant', error_description: 'Account disabled' }),
      requiredActions: ['VERIFY_EMAIL'],
    });

    const r = await autenticarPorPalavraPasse(EMAIL, SEGREDO);

    expect(r).toEqual({ ok: false, motivo: 'conta-desactivada' });
    expect(chamadasAdmin).toEqual([]);
  });

  it('a palavra-passe não vai para a Admin API, nem para os logs, nem no resultado', async () => {
    for (const accoes of [['VERIFY_EMAIL', 'UPDATE_PASSWORD'], ['UPDATE_PASSWORD'], null]) {
      __limparCacheAdminToken();
      montarRede({ grantPassword: naoConfigurada, requiredActions: accoes });
      const r = await autenticarPorPalavraPasse(EMAIL, SEGREDO);
      expect(JSON.stringify(r)).not.toContain(SEGREDO);
    }

    expect(chamadasAdmin.join('\n')).not.toContain(SEGREDO);
    expect(JSON.stringify(logs)).not.toContain(SEGREDO);
    // A palavra-passe só viaja no grant `password`, e uma vez por tentativa.
    const comSegredo = fetchMock.mock.calls.filter(([, init]) =>
      String((init as RequestInit | undefined)?.body ?? '').includes(SEGREDO),
    );
    expect(comSegredo).toHaveLength(3);
    for (const [url] of comSegredo) {
      expect(String(url)).toBe(`${ISSUER}/protocol/openid-connect/token`);
    }
  });
});
