/**
 * Oráculo do nó B:papeis-escalada-181 (issue #181) — quem gere papéis não delega o que não tem.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: `userAdminService.criarRole` / `actualizarRole` gravam qualquer `permissionCodes`
 * pedido, e `atribuirRoles` / `criarUtilizador` ligam qualquer papel do tenant a qualquer
 * utilizador. Um GESTOR com `admin:gerir_roles` cria um papel com permissões que não tem (ou
 * atribui-se o ADMIN) — escalada de privilégio.
 *
 * Contrato (decisão do orquestrador):
 *   C1 `criarRole` recusa `BusinessRuleError('PERMISSAO_NAO_DELEGAVEL')` quando `permissionCodes`
 *      contém alguma permissão que o actor (ctx.userId) não tem; nada é gravado.
 *   C2 `actualizarRole` com `permissionCodes` idem; as permissões do papel ficam como estavam.
 *   C3 `atribuirRoles` recusa o mesmo código quando a união das permissões dos papéis pedidos
 *      contém alguma que o actor não tem (incluindo atribuir-se a si próprio, e o papel ADMIN);
 *      os papéis do utilizador-alvo ficam como estavam.
 *   C4 `criarUtilizador` com papéis assim é recusado da mesma forma — e (opção conservadora,
 *      padrão #98/ADR-0031 deste serviço) antes de tocar no Keycloak: nada escrito em lado nenhum.
 *   C5 Um subconjunto das permissões do actor passa (o travão não é «só ADMIN gere papéis»).
 *   C6 O ADMIN (todas as permissões) continua livre em criar, editar e atribuir.
 *
 * As permissões do actor são coerentes nas três fontes possíveis (BD, `ctx.permissions` que o
 * `createSafeAction` injecta, e a sessão dobrada) — o oráculo não escolhe a implementação.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

/** Keycloak em memória — conta cada escrita para provar «antes do Keycloak». */
const kc = vi.hoisted(() => {
  let n = 0;
  return {
    garantirUtilizador: vi.fn(async (input: { email: string }) => {
      n += 1;
      return { sub: `kc-pe181-${n}-${Date.now()}-${input.email}`, criado: true };
    }),
    dispararEmailAccoes: vi.fn(async () => true),
    definirActivo: vi.fn(async () => undefined),
    definirPalavraPasse: vi.fn(async () => undefined),
    procurarPorEmail: vi.fn(async () => null),
    eliminarUtilizador: vi.fn(async () => undefined),
  };
});

vi.mock('@/server/auth/keycloak', () => ({
  ErroKeycloak: class ErroKeycloak extends Error {},
  ...kc,
}));

/** Sessão mutável: aponta sempre para o actor do caso, com as permissões dele. */
const sessao = vi.hoisted(() => ({
  actual: { id: 'ninguem', tenantId: 'x', permissions: [] as string[], emailVerificado: true },
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { ...sessao.actual } })),
}));

describe.skipIf(skip)('#181 — gerir papéis não delega permissões que o actor não tem — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // userAdminService

  const sufixo = Date.now();
  const TENANT = `tenant-pe181-${sufixo}`;

  // Catálogo global de permissões (Permission não tem tenant): códigos próprios do teste
  // + os dois de gestão. `upsert` porque outro teste pode já ter criado os de gestão.
  const P_ROLES = 'admin:gerir_roles';
  const P_USERS = 'admin:gerir_utilizadores';
  const P_A = `pe181:a:${sufixo}`;
  const P_B = `pe181:b:${sufixo}`;
  const P_C = `pe181:c:${sufixo}`;

  const GESTOR_PERMS = [P_ROLES, P_USERS, P_A];
  let adminPerms: string[] = [];

  let gestorId: string;
  let adminId: string;
  let alvoId: string;
  let roleGestor: string;
  let roleAdmin: string;
  let roleAlheio: string; // [P_B] — o gestor não tem
  let roleProprio: string; // [P_A] — o gestor tem

  type Actor = 'gestor' | 'admin';
  function ctxDe(actor: Actor): any {
    const userId = actor === 'gestor' ? gestorId : adminId;
    const perms = actor === 'gestor' ? GESTOR_PERMS : adminPerms;
    sessao.actual = { id: userId, tenantId: TENANT, permissions: [...perms], emailVerificado: true };
    // Forma do ActionCtx do createSafeAction (tenantId, userId, permissions).
    return { tenantId: TENANT, userId, permissions: new Set(perms) };
  }

  async function como(actor: Actor, fn: (svc: any, ctx: any) => Promise<any>): Promise<any> {
    const ctx = ctxDe(actor);
    return runCtx({ tenantId: ctx.tenantId, userId: ctx.userId }, () => fn(svc, ctx));
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function esperaRecusa(erro: any, contexto: string) {
    expect(erro, `${contexto}: tinha de ser recusado`).toBeDefined();
    expect(erro?.name, `${contexto}: erro de regra de negócio, não 500`).toBe('BusinessRuleError');
    expect(erro?.code, contexto).toBe('PERMISSAO_NAO_DELEGAVEL');
  }

  const codigosDoPapel = async (roleId: string): Promise<string[]> =>
    (
      await db.rolePermission.findMany({ where: { roleId }, include: { permission: true } })
    )
      .map((rp: any) => rp.permission.code)
      .sort();

  const papeisDe = async (userId: string): Promise<string[]> =>
    (await db.userRole.findMany({ where: { userId } })).map((ur: any) => ur.roleId).sort();

  async function novoPapel(nome: string, codes: string[], isSystem = false): Promise<string> {
    const perms = await db.permission.findMany({ where: { code: { in: codes } } });
    const r = await db.role.create({ data: { tenantId: TENANT, nome, isSystem } });
    if (perms.length) {
      await db.rolePermission.createMany({
        data: perms.map((p: any) => ({ roleId: r.id, permissionId: p.id })),
      });
    }
    return r.id;
  }

  async function novoUser(rotulo: string, roleIds: string[]): Promise<string> {
    const u = await db.user.create({
      data: {
        id: `user-pe181-${rotulo}-${sufixo}`,
        tenantId: TENANT,
        email: `pe181-${rotulo}-${sufixo}@test.mz`,
        nome: rotulo,
        keycloakSub: `kc-pe181-${rotulo}-${sufixo}`,
      },
    });
    await db.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: u.id, roleId })) });
    return u.id;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ userAdminService: svc } = await import('@/server/services/plataforma/user-admin.service'));

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant #181', slug: `pe181-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    for (const code of [P_ROLES, P_USERS, P_A, P_B, P_C]) {
      await db.permission.upsert({ where: { code }, update: {}, create: { code, descricao: code } });
    }
    // ADMIN = todas as permissões do catálogo (como o seed faz).
    adminPerms = (await db.permission.findMany({ select: { code: true } })).map((p: any) => p.code);

    roleAdmin = await novoPapel('ADMIN', adminPerms, true);
    roleGestor = await novoPapel('GESTOR', GESTOR_PERMS, true);
    roleAlheio = await novoPapel('PAPEL_ALHEIO', [P_B]);
    roleProprio = await novoPapel('PAPEL_PROPRIO', [P_A]);

    adminId = await novoUser('admin', [roleAdmin]);
    gestorId = await novoUser('gestor', [roleGestor]);
    alvoId = await novoUser('alvo', [roleProprio]);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── C1 criar papel ─────────────────────────────────────────────────────────

  it('C1: GESTOR cria papel com uma permissão que não tem → PERMISSAO_NAO_DELEGAVEL e nada gravado', async () => {
    const nome = `ESCALADA_CRIAR_${sufixo}`;
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) => s.criarRole({ nome, permissionCodes: [P_A, P_B] }, ctx)),
    );
    esperaRecusa(erro, 'criarRole com P_B');
    expect(await db.role.count({ where: { tenantId: TENANT, nome } }), 'papel não pode ter nascido').toBe(0);
  });

  it('C1: GESTOR cria papel com o ADMIN inteiro (permissões vedadas incluídas) → recusado', async () => {
    const nome = `ESCALADA_ADMIN_${sufixo}`;
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) => s.criarRole({ nome, permissionCodes: adminPerms }, ctx)),
    );
    esperaRecusa(erro, 'criarRole com todas as permissões');
    expect(await db.role.count({ where: { tenantId: TENANT, nome } })).toBe(0);
  });

  it('C5: GESTOR cria papel com um subconjunto das suas permissões → passa', async () => {
    const nome = `SUBCONJUNTO_${sufixo}`;
    const row = await como('gestor', (s, ctx) => s.criarRole({ nome, permissionCodes: [P_A, P_USERS] }, ctx));
    expect(row.nome).toBe(nome);
    expect(await codigosDoPapel(row.id)).toEqual([P_A, P_USERS].sort());
  });

  // ── C2 editar papel ────────────────────────────────────────────────────────

  it('C2: GESTOR acrescenta a um papel uma permissão que não tem → recusado e permissões intactas', async () => {
    const roleId = await novoPapel(`EDITAR_${sufixo}`, [P_A]);
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) => s.actualizarRole(roleId, { permissionCodes: [P_A, P_C] }, ctx)),
    );
    esperaRecusa(erro, 'actualizarRole com P_C');
    expect(await codigosDoPapel(roleId)).toEqual([P_A]);
  });

  it('C2: GESTOR dá-se mais poder editando o próprio papel → recusado', async () => {
    const antes = await codigosDoPapel(roleGestor);
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) =>
        s.actualizarRole(roleGestor, { permissionCodes: [...GESTOR_PERMS, P_B] }, ctx),
      ),
    );
    esperaRecusa(erro, 'actualizarRole do próprio papel');
    expect(await codigosDoPapel(roleGestor)).toEqual(antes);
  });

  it('C5: GESTOR edita um papel dentro das suas permissões → passa', async () => {
    const roleId = await novoPapel(`EDITAR_OK_${sufixo}`, [P_A]);
    await como('gestor', (s, ctx) => s.actualizarRole(roleId, { permissionCodes: [P_A, P_USERS] }, ctx));
    expect(await codigosDoPapel(roleId)).toEqual([P_A, P_USERS].sort());
  });

  // ── C3 atribuir papéis ─────────────────────────────────────────────────────

  it('C3: GESTOR atribui a outro um papel com permissões que não tem → recusado e papéis intactos', async () => {
    const antes = await papeisDe(alvoId);
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) => s.atribuirRoles({ userId: alvoId, roleIds: [roleAlheio] }, ctx)),
    );
    esperaRecusa(erro, 'atribuirRoles PAPEL_ALHEIO');
    expect(await papeisDe(alvoId)).toEqual(antes);
  });

  it('C3: GESTOR atribui o ADMIN a outro → recusado', async () => {
    const antes = await papeisDe(alvoId);
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) => s.atribuirRoles({ userId: alvoId, roleIds: [roleProprio, roleAdmin] }, ctx)),
    );
    esperaRecusa(erro, 'atribuirRoles ADMIN');
    expect(await papeisDe(alvoId)).toEqual(antes);
  });

  it('C3: GESTOR atribui-se a si próprio um papel com mais permissões → recusado', async () => {
    const antes = await papeisDe(gestorId);
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) => s.atribuirRoles({ userId: gestorId, roleIds: [roleGestor, roleAlheio] }, ctx)),
    );
    esperaRecusa(erro, 'auto-atribuição');
    expect(await papeisDe(gestorId)).toEqual(antes);
  });

  it('C5: GESTOR atribui um papel dentro das suas permissões → passa', async () => {
    const alvo2 = await novoUser('alvo2', []);
    await como('gestor', (s, ctx) => s.atribuirRoles({ userId: alvo2, roleIds: [roleProprio] }, ctx));
    expect(await papeisDe(alvo2)).toEqual([roleProprio]);
  });

  // ── C4 convidar com papéis ─────────────────────────────────────────────────

  it('C4: GESTOR convida alguém com um papel que não pode delegar → recusado antes do Keycloak, nada escrito', async () => {
    const email = `pe181-convite-${sufixo}@test.mz`;
    const erro = await capturarErro(() =>
      como('gestor', (s, ctx) =>
        s.criarUtilizador({ nome: 'Convidado', email, roleIds: [roleAlheio], ativo: true, metodoAcesso: 'convite' }, ctx),
      ),
    );
    esperaRecusa(erro, 'criarUtilizador com PAPEL_ALHEIO');
    expect(kc.garantirUtilizador, 'nenhuma identidade no realm').not.toHaveBeenCalled();
    expect(kc.dispararEmailAccoes).not.toHaveBeenCalled();
    expect(await db.user.count({ where: { email } }), 'nenhum User local').toBe(0);
  });

  it('C5: GESTOR convida alguém com um papel que pode delegar → passa', async () => {
    const email = `pe181-convite-ok-${sufixo}@test.mz`;
    const { utilizador } = await como('gestor', (s, ctx) =>
      s.criarUtilizador({ nome: 'Convidado OK', email, roleIds: [roleProprio], ativo: true, metodoAcesso: 'convite' }, ctx),
    );
    expect(utilizador.email).toBe(email);
    expect(kc.garantirUtilizador).toHaveBeenCalledOnce();
  });

  // ── C6 o ADMIN continua livre ──────────────────────────────────────────────

  it('C6: ADMIN cria, edita e atribui papéis com quaisquer permissões', async () => {
    const nome = `ADMIN_LIVRE_${sufixo}`;
    const row = await como('admin', (s, ctx) => s.criarRole({ nome, permissionCodes: [P_B, P_C, P_ROLES] }, ctx));
    expect(await codigosDoPapel(row.id)).toEqual([P_B, P_C, P_ROLES].sort());

    await como('admin', (s, ctx) => s.actualizarRole(row.id, { permissionCodes: [P_A, P_B, P_C] }, ctx));
    expect(await codigosDoPapel(row.id)).toEqual([P_A, P_B, P_C].sort());

    const alvo3 = await novoUser('alvo3', []);
    await como('admin', (s, ctx) => s.atribuirRoles({ userId: alvo3, roleIds: [roleAlheio, roleAdmin] }, ctx));
    expect(await papeisDe(alvo3)).toEqual([roleAlheio, roleAdmin].sort());
  });
});
