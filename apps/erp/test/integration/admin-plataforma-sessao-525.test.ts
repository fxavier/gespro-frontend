/**
 * ORÁCULO — issue #525 (nó B:admin-plataforma): a sessão do administrador de
 * plataforma, pelo fluxo REAL de login (Direct Access Grant, ADR-0029).
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (ADR-0011 §5; ADR-0049 em escrita):
 *   - o login lê `realm_access.roles` do access token e põe
 *     `plataformaAdmin: boolean` no JWT e na sessão;
 *   - com o papel e SEM `User` de tenant → entra, sessão sem `tenantId` e sem
 *     permissões de tenant;
 *   - sem o papel e sem `User` → continua recusado (`nao-provisionado`);
 *   - com o papel e com `User` → entra no tenant normalmente, e com o papel;
 *   - re-resolvido no MESMO intervalo do resto (ADR-0011): dentro do intervalo
 *     não há chamada nenhuma; na renovação, o papel lê-se do access token
 *     renovado — retirado no Keycloak, cai; a quem só tinha o papel (sem
 *     tenant) a sessão termina.
 *
 * Exercita os `authorize`/`callbacks.jwt`/`callbacks.session` REAIS de
 * `@/lib/auth`, capturados da configuração passada ao `NextAuth` (dobra-se só a
 * fábrica do Auth.js, que não resolve `next/server` fora do runtime do Next),
 * contra Postgres efémero. O Keycloak é dublado ao nível da REDE (stub de
 * `fetch`): o implementador escolhe as funções que quiser, o token que chega é
 * o que se prova aqui.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 *
 * ESTADO ESPERADO antes da implementação: RED.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RATE_LIMIT_DRIVER = 'memory';
  process.env.KEYCLOAK_ISSUER = 'http://kc-525.exemplo.mz/realms/gespro';
  delete process.env.KEYCLOAK_ISSUER_INTERNO;
  process.env.KEYCLOAK_CLIENT_ID = 'gespro-erp';
  process.env.KEYCLOAK_CLIENT_SECRET = 'segredo-de-teste-525';
  delete process.env.AUTH_SESSION_MAX_AGE;
});

const capturado = vi.hoisted(() => ({ config: null as any }));

vi.mock('next-auth', () => {
  class CredentialsSignin extends Error {
    code = 'credentials';
  }
  return {
    default: (config: unknown) => {
      capturado.config = typeof config === 'function' ? (config as () => unknown)() : config;
      return {
        handlers: {},
        auth: async () => null,
        signIn: async () => {},
        signOut: async () => {},
      };
    },
    CredentialsSignin,
  };
});
vi.mock('next-auth/providers/credentials', () => ({ default: (c: unknown) => c }));

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const PAPEL = 'plataforma-admin';

function accessToken(sub: string, papeis: string[] | null): string {
  const payload: Record<string, unknown> = { sub, email_verified: true };
  if (papeis) payload.realm_access = { roles: papeis };
  return `cab.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.ass`;
}

function resposta(status: number, corpo: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

/**
 * Keycloak dublado: `password` devolve o token da identidade pedida;
 * `refresh_token` devolve o token que o caso fixar para esse refresh.
 */
const kc = vi.hoisted(() => ({
  identidades: new Map<string, { sub: string; papeis: string[] | null }>(),
  renovacoes: new Map<string, { sub: string; papeis: string[] | null }>(),
  chamadas: [] as string[],
}));

const fetchMock = vi.fn(async (url: unknown, init?: { body?: unknown }) => {
  const u = String(url);
  const corpo = new URLSearchParams(String(init?.body ?? ''));
  const grant = corpo.get('grant_type') ?? (u.endsWith('/revoke') ? 'revoke' : 'outro');
  kc.chamadas.push(grant);
  if (u.endsWith('/revoke')) return resposta(200);
  if (grant === 'password') {
    const id = kc.identidades.get(corpo.get('username') ?? '');
    if (!id) return resposta(401, { error: 'invalid_grant', error_description: 'Invalid user credentials' });
    return resposta(200, {
      access_token: accessToken(id.sub, id.papeis),
      refresh_token: `refresh-${id.sub}`,
    });
  }
  if (grant === 'refresh_token') {
    const id = kc.renovacoes.get(corpo.get('refresh_token') ?? '');
    if (!id) return resposta(400, { error: 'invalid_grant' });
    return resposta(200, {
      access_token: accessToken(id.sub, id.papeis),
      refresh_token: corpo.get('refresh_token'),
    });
  }
  return resposta(500);
});
vi.stubGlobal('fetch', fetchMock);

describe.skipIf(skip)('#525 — sessão do administrador de plataforma (DB efémera)', () => {
  let db: any;
  const sufixo = `adm-plat-525-${Date.now()}`;
  const tenantId = `t-${sufixo}`;

  const SUB_PLAT = `kc-plat-${sufixo}`;
  const SUB_SEM_NADA = `kc-ninguem-${sufixo}`;
  const SUB_DUPLO = `kc-duplo-${sufixo}`;
  const SUB_TENANT = `kc-tenant-${sufixo}`;
  const EMAIL_PLAT = `plataforma-${sufixo}@gespro.mz`;
  const EMAIL_SEM_NADA = `ninguem-${sufixo}@gespro.mz`;
  const EMAIL_DUPLO = `duplo-${sufixo}@test.mz`;
  const EMAIL_TENANT = `tenant-${sufixo}@test.mz`;

  function cfg() {
    expect(capturado.config, 'configuração do NextAuth não capturada').toBeTruthy();
    return capturado.config;
  }

  async function autorizar(email: string): Promise<any> {
    const provider = cfg().providers[0];
    const req = new Request('http://localhost/api/auth/callback/credentials', {
      headers: { 'x-forwarded-for': '10.52.5.1' },
    });
    return provider.authorize({ identificador: email, palavraPasse: 'demo-teste' }, req);
  }

  async function jwt(token: Record<string, unknown>, user?: unknown): Promise<any> {
    return cfg().callbacks.jwt({ token, user, trigger: user ? 'signIn' : 'update' });
  }

  async function sessao(token: Record<string, unknown>): Promise<any> {
    return cfg().callbacks.session({
      session: { user: { email: token.email ?? null }, expires: '2099-01-01T00:00:00.000Z' },
      token,
    });
  }

  /** Login completo: authorize → jwt inicial → sessão. */
  async function entrar(email: string) {
    const user = await autorizar(email);
    expect(user, `authorize devolveu ${JSON.stringify(user)}`).toBeTruthy();
    const token = await jwt({ email }, user);
    expect(token, 'o jwt inicial devolveu null (sessão recusada)').toBeTruthy();
    return { user, token, sessao: await sessao(token) };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    await import('@/lib/auth');

    await db.tenant.create({
      data: {
        id: tenantId,
        nome: `Tenant ${sufixo}`,
        slug: sufixo,
        nuit: `${Date.now()}`.slice(-9),
      },
    });
    const papel = await db.role.create({ data: { tenantId, nome: 'ADMIN' } });
    const perm = await db.permission.upsert({
      where: { code: 'vendas:criar' },
      update: {},
      create: { code: 'vendas:criar', descricao: 'vendas:criar' },
    });
    await db.rolePermission.create({ data: { roleId: papel.id, permissionId: perm.id } });
    for (const [sub, email] of [
      [SUB_DUPLO, EMAIL_DUPLO],
      [SUB_TENANT, EMAIL_TENANT],
    ] as const) {
      const u = await db.user.create({
        data: { id: `u-${sub}`, tenantId, email, nome: email, keycloakSub: sub },
      });
      await db.userRole.create({ data: { userId: u.id, roleId: papel.id } });
    }

    kc.identidades.set(EMAIL_PLAT, { sub: SUB_PLAT, papeis: ['offline_access', PAPEL] });
    kc.identidades.set(EMAIL_SEM_NADA, { sub: SUB_SEM_NADA, papeis: ['offline_access'] });
    kc.identidades.set(EMAIL_DUPLO, { sub: SUB_DUPLO, papeis: [PAPEL] });
    kc.identidades.set(EMAIL_TENANT, { sub: SUB_TENANT, papeis: ['offline_access'] });
  });

  beforeEach(() => {
    kc.renovacoes.clear();
    kc.chamadas.length = 0;
  });

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  it('com o papel e SEM User de tenant → entra; sessão sem tenant, com plataformaAdmin', async () => {
    const { token, sessao: s } = await entrar(EMAIL_PLAT);
    expect(token.plataformaAdmin).toBe(true);
    expect(token.tenantId ?? null).toBeNull();
    expect(s.user.plataformaAdmin).toBe(true);
    expect(s.user.tenantId ?? null).toBeNull();
    // Nada de tenant: nenhuma permissão de tenant na sessão.
    expect(s.user.permissions ?? []).toEqual([]);
  });

  it('sem o papel e sem User → continua recusado (nao-provisionado)', async () => {
    let erro: any = null;
    try {
      await autorizar(EMAIL_SEM_NADA);
    } catch (e) {
      erro = e;
    }
    expect(erro, 'devia ter sido recusado').toBeTruthy();
    expect(erro.code).toBe('nao-provisionado');
  });

  it('com o papel E com User de tenant → entra no tenant, com plataformaAdmin', async () => {
    const { sessao: s } = await entrar(EMAIL_DUPLO);
    expect(s.user.tenantId).toBe(tenantId);
    expect(s.user.permissions).toContain('vendas:criar');
    expect(s.user.plataformaAdmin).toBe(true);
  });

  it('controlo: utilizador de tenant sem o papel → plataformaAdmin false (presente)', async () => {
    const { sessao: s } = await entrar(EMAIL_TENANT);
    expect(s.user.tenantId).toBe(tenantId);
    expect(s.user.plataformaAdmin).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Re-resolução (ADR-0011)
  // -------------------------------------------------------------------------

  it('dentro do intervalo: nenhuma chamada ao Keycloak, o papel mantém-se', async () => {
    const { token } = await entrar(EMAIL_PLAT);
    kc.chamadas.length = 0;
    const t2 = await jwt({ ...token });
    expect(kc.chamadas).toEqual([]);
    expect(t2?.plataformaAdmin).toBe(true);
  });

  it('renovação com o papel → sessão sem tenant continua, com plataformaAdmin', async () => {
    const { token } = await entrar(EMAIL_PLAT);
    kc.renovacoes.set(`refresh-${SUB_PLAT}`, { sub: SUB_PLAT, papeis: [PAPEL] });
    const t2 = await jwt({ ...token, resolverEm: 0 });
    expect(kc.chamadas).toContain('refresh_token');
    expect(t2, 'a re-resolução terminou a sessão').toBeTruthy();
    expect(t2.plataformaAdmin).toBe(true);
    expect(t2.tenantId ?? null).toBeNull();
    expect(t2.resolverEm).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('papel retirado no Keycloak, sem tenant → a sessão termina na renovação', async () => {
    const { token } = await entrar(EMAIL_PLAT);
    kc.renovacoes.set(`refresh-${SUB_PLAT}`, { sub: SUB_PLAT, papeis: ['offline_access'] });
    const t2 = await jwt({ ...token, resolverEm: 0 });
    expect(t2).toBeNull();
  });

  it('papel retirado no Keycloak, com tenant → fica no tenant, plataformaAdmin false', async () => {
    const { token } = await entrar(EMAIL_DUPLO);
    kc.renovacoes.set(`refresh-${SUB_DUPLO}`, { sub: SUB_DUPLO, papeis: [] });
    const t2 = await jwt({ ...token, resolverEm: 0 });
    expect(t2, 'a re-resolução terminou a sessão de quem tem tenant').toBeTruthy();
    expect(t2.plataformaAdmin).toBe(false);
    expect(t2.tenantId).toBe(tenantId);
  });

  it('papel dado no Keycloak a um utilizador de tenant → aparece na renovação', async () => {
    const { token } = await entrar(EMAIL_TENANT);
    expect(token.plataformaAdmin).toBe(false);
    kc.renovacoes.set(`refresh-${SUB_TENANT}`, { sub: SUB_TENANT, papeis: [PAPEL] });
    const t2 = await jwt({ ...token, resolverEm: 0 });
    expect(t2?.plataformaAdmin).toBe(true);
    expect(t2?.tenantId).toBe(tenantId);
  });

  it('sessão terminada no Keycloak (refresh recusado) → cai, também para o administrador', async () => {
    const { token } = await entrar(EMAIL_PLAT);
    // sem renovação registada → 400 invalid_grant → `recusada`
    const t2 = await jwt({ ...token, resolverEm: 0 });
    expect(t2).toBeNull();
  });
});
