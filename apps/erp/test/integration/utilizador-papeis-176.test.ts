/**
 * Oráculo do nó C:utilizador-papeis-176 (issue #176) — mudar os papéis de um utilizador existente.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: `atribuirRoles` existe (serviço + Server Action) mas não tem consumidor na UI, e o
 * serviço deixa retirar o papel ADMIN ao último administrador activo do tenant — o mesmo
 * `ULTIMO_ADMIN` que `desactivarUtilizador` e `removerRole` já recusam. Com o ecrã novo, um clique
 * deixava o tenant sem ninguém que o administrasse.
 *
 * Contrato (decisão do orquestrador):
 *   P1 `atribuirRoles` recusa `BusinessRuleError('ULTIMO_ADMIN')` quando a lista nova retira o
 *      papel ADMIN a um utilizador activo e, sem ele, o tenant ficaria com zero administradores
 *      activos. Os papéis do alvo ficam como estavam. Vale para o próprio actor (auto-despromoção)
 *      e para qualquer actor que possa atribuir papéis — não é o travão de delegação.
 *   P2 Administradores inactivos ou eliminados não contam como «outro administrador».
 *   P3 Não é «nunca retirar ADMIN»: havendo outro administrador activo, retirar passa; manter o
 *      ADMIN na lista (mudando os restantes papéis) também passa.
 *   P4 O travão de delegação do #181 (`PERMISSAO_NAO_DELEGAVEL`) continua a valer neste caminho.
 *   P5 A Server Action `atribuirRoles` (a que o ecrã consome) entrega estes resultados como
 *      `ActionResult` — `ok:false` com o código, nunca uma excepção nem um 500 — e grava no caso feliz.
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

/** Keycloak em memória — atribuir papéis não lhe toca, mas o serviço importa-o. */
const kc = vi.hoisted(() => ({
  garantirUtilizador: vi.fn(async () => ({ sub: `kc-up176-${Date.now()}`, criado: true })),
  dispararEmailAccoes: vi.fn(async () => true),
  definirActivo: vi.fn(async () => undefined),
  definirPalavraPasse: vi.fn(async () => undefined),
  procurarPorEmail: vi.fn(async () => null),
  eliminarUtilizador: vi.fn(async () => undefined),
}));
vi.mock('@/server/auth/keycloak', () => ({
  ErroKeycloak: class ErroKeycloak extends Error {},
  ...kc,
}));

/** Sessão mutável: aponta sempre para o actor do caso, com as permissões dele. */
const sessao = vi.hoisted(() => ({
  actual: {
    id: 'ninguem',
    tenantId: 'x',
    permissions: [] as string[],
    emailVerificado: true,
    acesso: 'aberto' as const,
  },
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { ...sessao.actual } })),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

describe.skipIf(skip)('#176 — mudar os papéis de um utilizador existente — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // userAdminService
  let atribuirAction: (input: unknown) => Promise<Resultado>;

  const sufixo = Date.now();
  const TENANT = `tenant-up176-${sufixo}`;

  const P_ROLES = 'admin:gerir_roles';
  const P_USERS = 'admin:gerir_utilizadores';
  const P_A = `up176:a:${sufixo}`;
  const P_B = `up176:b:${sufixo}`;

  const GESTOR_PERMS = [P_USERS, P_A];
  let adminPerms: string[] = [];

  let roleAdmin: string;
  let roleGestor: string;
  let roleProprio: string; // [P_A] — o gestor tem
  let roleAlheio: string; // [P_B] — o gestor não tem
  let adminId: string; // o único administrador activo, salvo quando o caso cria outro
  let gestorId: string;

  /** Ids com forma de cuid: o AssignRoleSchema valida `userId` com `.cuid()`. */
  let seq = 0;
  async function novoUser(
    rotulo: string,
    roleIds: string[],
    extra: { ativo?: boolean; deletedAt?: Date | null } = {},
  ): Promise<string> {
    seq += 1;
    const id = `cup176${rotulo}${seq}x${sufixo}`;
    await db.user.create({
      data: {
        id,
        tenantId: TENANT,
        email: `up176-${rotulo}-${seq}-${sufixo}@test.mz`,
        nome: `${rotulo} ${seq}`,
        keycloakSub: `kc-up176-${rotulo}-${seq}-${sufixo}`,
        ativo: extra.ativo ?? true,
        deletedAt: extra.deletedAt ?? null,
      },
    });
    if (roleIds.length) {
      await db.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
    }
    return id;
  }

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

  type Actor = { id: string; perms: string[] };
  const ADMIN = (): Actor => ({ id: adminId, perms: adminPerms });
  const GESTOR = (): Actor => ({ id: gestorId, perms: GESTOR_PERMS });

  function ctxDe(actor: Actor): any {
    sessao.actual = {
      id: actor.id,
      tenantId: TENANT,
      permissions: [...actor.perms],
      emailVerificado: true,
      acesso: 'aberto',
    };
    return { tenantId: TENANT, userId: actor.id, permissions: new Set(actor.perms) };
  }

  async function atribuir(actor: Actor, userId: string, roleIds: string[]): Promise<any> {
    const ctx = ctxDe(actor);
    return runCtx({ tenantId: TENANT, userId: actor.id }, () => svc.atribuirRoles({ userId, roleIds }, ctx));
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function esperaRecusa(erro: any, codigo: string, contexto: string) {
    expect(erro, `${contexto}: tinha de ser recusado`).toBeDefined();
    expect(erro?.name, `${contexto}: erro de regra de negócio, não 500 (${erro?.message})`).toBe('BusinessRuleError');
    expect(erro?.code, contexto).toBe(codigo);
  }

  const papeisDe = async (userId: string): Promise<string[]> =>
    (await db.userRole.findMany({ where: { userId } })).map((ur: any) => ur.roleId).sort();

  /** Retira o ADMIN a todos os administradores criados pelos casos, deixando só `adminId`. */
  async function soUmAdmin(): Promise<void> {
    await db.userRole.deleteMany({ where: { roleId: roleAdmin, userId: { not: adminId } } });
    await db.userRole.deleteMany({ where: { userId: adminId } });
    await db.userRole.createMany({ data: [{ userId: adminId, roleId: roleAdmin }] });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ userAdminService: svc } = await import('@/server/services/plataforma/user-admin.service'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/plataforma.actions')) as unknown as Record<string, any>;
    atribuirAction = actions.atribuirRoles;

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant #176', slug: `up176-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    for (const code of [P_ROLES, P_USERS, P_A, P_B]) {
      await db.permission.upsert({ where: { code }, update: {}, create: { code, descricao: code } });
    }
    adminPerms = (await db.permission.findMany({ select: { code: true } })).map((p: any) => p.code);

    roleAdmin = await novoPapel('ADMIN', adminPerms, true);
    roleGestor = await novoPapel('GESTOR', GESTOR_PERMS, true);
    roleProprio = await novoPapel('PAPEL_PROPRIO', [P_A]);
    roleAlheio = await novoPapel('PAPEL_ALHEIO', [P_B]);

    adminId = await novoUser('admin', [roleAdmin]);
    gestorId = await novoUser('gestor', [roleGestor]);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await soUmAdmin();
  });

  // ── P1 o último ADMIN não perde o papel ──────────────────────────────────────

  it('P1: o único ADMIN retira a si próprio o papel ADMIN → ULTIMO_ADMIN e papéis intactos', async () => {
    const antes = await papeisDe(adminId);
    const erro = await capturarErro(() => atribuir(ADMIN(), adminId, [roleProprio]));
    esperaRecusa(erro, 'ULTIMO_ADMIN', 'auto-despromoção do último ADMIN');
    expect(await papeisDe(adminId)).toEqual(antes);
  });

  it('P1: GESTOR (pode atribuir e delegar P_A) troca o papel do último ADMIN → ULTIMO_ADMIN, não PERMISSAO_NAO_DELEGAVEL', async () => {
    const antes = await papeisDe(adminId);
    const erro = await capturarErro(() => atribuir(GESTOR(), adminId, [roleProprio]));
    esperaRecusa(erro, 'ULTIMO_ADMIN', 'GESTOR despromove o último ADMIN');
    expect(await papeisDe(adminId)).toEqual(antes);
  });

  // ── P2 administradores inactivos/eliminados não contam ───────────────────────

  it('P2: outro ADMIN inactivo não conta → ULTIMO_ADMIN', async () => {
    await novoUser('admininactivo', [roleAdmin], { ativo: false });
    const erro = await capturarErro(() => atribuir(ADMIN(), adminId, [roleProprio]));
    esperaRecusa(erro, 'ULTIMO_ADMIN', 'só há um ADMIN activo');
    expect(await papeisDe(adminId)).toEqual([roleAdmin]);
  });

  it('P2: outro ADMIN eliminado (deletedAt) não conta → ULTIMO_ADMIN', async () => {
    await novoUser('admineliminado', [roleAdmin], { deletedAt: new Date() });
    const erro = await capturarErro(() => atribuir(ADMIN(), adminId, [roleProprio]));
    esperaRecusa(erro, 'ULTIMO_ADMIN', 'só há um ADMIN não eliminado');
    expect(await papeisDe(adminId)).toEqual([roleAdmin]);
  });

  // ── P3 não é «nunca retirar ADMIN» ───────────────────────────────────────────

  it('P3: com outro ADMIN activo, retirar o ADMIN a um deles passa', async () => {
    const segundo = await novoUser('admin2', [roleAdmin]);
    await atribuir(ADMIN(), segundo, [roleProprio]);
    expect(await papeisDe(segundo)).toEqual([roleProprio]);
  });

  it('P3: com outro ADMIN activo, o ADMIN pode despromover-se a si próprio', async () => {
    await novoUser('admin3', [roleAdmin]);
    await atribuir(ADMIN(), adminId, [roleProprio]);
    expect(await papeisDe(adminId)).toEqual([roleProprio]);
  });

  it('P3: o último ADMIN mantém o ADMIN e ganha outro papel → passa', async () => {
    await atribuir(ADMIN(), adminId, [roleAdmin, roleProprio]);
    expect(await papeisDe(adminId)).toEqual([roleAdmin, roleProprio].sort());
  });

  it('P3: despromover sucessivamente até sobrar um — o segundo pedido é recusado', async () => {
    const segundo = await novoUser('admin4', [roleAdmin]);
    await atribuir(ADMIN(), segundo, [roleProprio]); // passa: ainda há o adminId
    const erro = await capturarErro(() => atribuir(ADMIN(), adminId, [roleProprio]));
    esperaRecusa(erro, 'ULTIMO_ADMIN', 'o segundo já não é ADMIN');
    expect(await papeisDe(adminId)).toEqual([roleAdmin]);
  });

  it('P3: mudar os papéis de quem não é ADMIN não toca no travão', async () => {
    const alvo = await novoUser('alvo', [roleProprio]);
    await atribuir(ADMIN(), alvo, [roleAlheio, roleGestor]);
    expect(await papeisDe(alvo)).toEqual([roleAlheio, roleGestor].sort());
  });

  // ── P4 o travão de delegação do #181 continua ────────────────────────────────

  it('P4: GESTOR troca os papéis de outro para um que não pode delegar → PERMISSAO_NAO_DELEGAVEL', async () => {
    const alvo = await novoUser('alvodeleg', [roleProprio]);
    const erro = await capturarErro(() => atribuir(GESTOR(), alvo, [roleAlheio]));
    esperaRecusa(erro, 'PERMISSAO_NAO_DELEGAVEL', 'delegação');
    expect(await papeisDe(alvo)).toEqual([roleProprio]);
  });

  // ── P5 a Server Action que o ecrã consome ────────────────────────────────────

  it('P5: a action atribuirRoles devolve ok:false ULTIMO_ADMIN (sem lançar) e nada muda', async () => {
    expect(typeof atribuirAction, 'atribuirRoles não está exportada de plataforma.actions').toBe('function');
    ctxDe(ADMIN());
    const r = await atribuirAction({ userId: adminId, roleIds: [roleProprio] });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('ULTIMO_ADMIN');
    expect(await papeisDe(adminId)).toEqual([roleAdmin]);
  });

  it('P5: a action atribuirRoles devolve ok:false PERMISSAO_NAO_DELEGAVEL para o GESTOR', async () => {
    const alvo = await novoUser('alvoaction', [roleProprio]);
    ctxDe(GESTOR());
    const r = await atribuirAction({ userId: alvo, roleIds: [roleAlheio] });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('PERMISSAO_NAO_DELEGAVEL');
    expect(await papeisDe(alvo)).toEqual([roleProprio]);
  });

  it('P5: a action atribuirRoles grava a lista nova e devolve o utilizador com os papéis novos', async () => {
    const alvo = await novoUser('alvook', [roleProprio]);
    ctxDe(ADMIN());
    const r = await atribuirAction({ userId: alvo, roleIds: [roleGestor, roleAlheio] });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((r.data?.roles ?? []).map((x: any) => x.id).sort()).toEqual([roleGestor, roleAlheio].sort());
    expect(await papeisDe(alvo)).toEqual([roleGestor, roleAlheio].sort());
  });
});
