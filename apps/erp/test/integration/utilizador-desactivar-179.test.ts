/**
 * Oráculo do nó C:utilizador-desactivar-179 (issue #179) — «Desactivar» utilizador é reversível.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: `userAdminService.desactivarUtilizador` grava `{ ativo: false, deletedAt: new Date() }`.
 * Como TODAS as leituras de utilizador filtram `deletedAt: null` (`findUser`, `listarUtilizadores`),
 * o utilizador desactivado desaparece da lista e do detalhe e não há caminho de volta — e a
 * confirmação do ecrã promete «Esta acção pode ser revertida posteriormente».
 *
 * Contrato (decisão do orquestrador; os pormenores em aberto foram fixados pelo verificador na
 * opção mais conservadora):
 *   D1 `desactivarUtilizador` passa o `User` a `ativo = false`, desliga a identidade no Keycloak
 *      (`definirActivo(sub, false)`) e NÃO escreve `deletedAt` (fica `null`).
 *   D2 O desactivado continua alcançável: `obterUtilizador` devolve-o (`ativo: false`) e
 *      `listarUtilizadores` mostra-o sem filtro e com `ativo: false` (não com `ativo: true`).
 *   D3 Desactivar continua a libertar o lugar do plano de imediato (#98, ADR-0027 §4).
 *   R1 Existe `userAdminService.reactivarUtilizador(userId, ctx)`: `ativo = true` em Postgres,
 *      `definirActivo(sub, true)` no Keycloak, `deletedAt` continua `null`.
 *   R2 Reactivar respeita o limite do plano do #98: no limite recusa
 *      `BusinessRuleError('LIMITE_PLANO_UTILIZADORES')` ANTES do Keycloak, e o `User` continua
 *      inactivo.
 *   R3 Reactivar respeita o travão do ADR-0031 (`EMAIL_POR_CONFIRMAR_UTILIZADORES`), antes do
 *      Keycloak — reactivar conta como criar.
 *   R4 Keycloak primeiro: se o Keycloak falhar ao reactivar, o `User` local continua inactivo.
 *   R5 Âmbito: utilizador de outro tenant, ou eliminado (`deletedAt` preenchido — p.ex. pela
 *      versão antiga desta acção), dá `NotFoundError`; nada muda. Sem migração de dados: as linhas
 *      já apagadas pela versão antiga continuam apagadas (decisão conservadora do verificador).
 *   R6 É reversível nos dois sentidos, repetidamente: desactivar → reactivar → desactivar → reactivar.
 *   A1 Server Action `reactivarUtilizador({ id })` exportada de `plataforma.actions`, com a
 *      permissão `admin:gerir_utilizadores`: grava no caso feliz, devolve `ok:false` com o código
 *      (`LIMITE_PLANO_UTILIZADORES`) sem lançar, e recusa quem não tem a permissão.
 *   A2 A Server Action `desactivarUtilizador` (a que o ecrã consome) deixa `deletedAt` a `null`.
 *
 * #180 («Cancelar subscrição» em LEITURA/FECHADA) fica FORA deste nó: vive noutro ecrã
 * (`/definicoes/faturacao/faturacao-acoes.tsx`) e noutro serviço — não é «no mesmo sítio».
 *
 * Keycloak e sessão dobrados; Postgres real e efémero.
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

/** Keycloak em memória — regista cada escrita para provar «antes do Keycloak». */
const kc = vi.hoisted(() => ({
  garantirUtilizador: vi.fn(async () => ({ sub: `kc-ud179-${Date.now()}`, criado: true })),
  dispararEmailAccoes: vi.fn(async () => true),
  definirActivo: vi.fn(async (_sub: string, _ativo: boolean) => undefined),
  definirPalavraPasse: vi.fn(async () => undefined),
  procurarPorEmail: vi.fn(async () => null),
  eliminarUtilizador: vi.fn(async () => undefined),
}));
vi.mock('@/server/auth/keycloak', () => ({
  ErroKeycloak: class ErroKeycloak extends Error {},
  ...kc,
}));

/** Sessão mutável: actor do caso, permissões e e-mail confirmado. */
const sessao = vi.hoisted(() => ({
  actual: {
    id: 'ninguem',
    tenantId: 'x',
    permissions: [] as string[],
    emailVerificado: true as boolean,
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

type PlanoId = 'BASICO' | 'PROFISSIONAL' | 'EMPRESARIAL';
type T = { tenantId: string; adminId: string; roleId: string; ctx: any };
type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

const P_USERS = 'admin:gerir_utilizadores';

describe.skipIf(skip)('#179 — desactivar utilizador é reversível — DB efémera', () => {
  let db: any;
  let svc: any; // userAdminService
  let actions: Record<string, any>;

  const sufixo = Date.now();
  let seq = 0;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ userAdminService: svc } = await import('@/server/services/plataforma/user-admin.service'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    actions = (await import('@/server/actions/plataforma.actions')) as unknown as Record<string, any>;
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    kc.definirActivo.mockImplementation(async () => undefined);
  });

  /** Ids com forma de cuid: os schemas das actions validam `id` com `.cuid()`. */
  function novoId(rotulo: string): string {
    seq += 1;
    return `cud179${rotulo}${seq}x${sufixo}`;
  }

  /** Tenant com um ADMIN activo (o chamador). `plano: null` = sem Assinatura (ilimitado). */
  async function novoTenant(rotulo: string, plano: PlanoId | null = null): Promise<T> {
    seq += 1;
    const tenantId = `tenant-ud179-${rotulo}-${sufixo}-${seq}`;
    const slug = `ud179-${rotulo}-${sufixo}-${seq}`;
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${sufixo + seq * 7}`.slice(-9) },
    });
    if (plano) {
      await db.assinatura.create({
        data: {
          tenantId,
          planoAssinatura: plano,
          estado: 'ATIVA',
          trialFim: new Date(Date.now() + 14 * 86_400_000),
        },
      });
    }
    const role = await db.role.create({ data: { tenantId, nome: 'ADMIN', isSystem: true } });
    const adminId = novoId('admin');
    await db.user.create({
      data: {
        id: adminId,
        tenantId,
        email: `${adminId}@ud179.mz`,
        nome: 'Administrador',
        keycloakSub: `kc-${adminId}`,
        roles: { create: [{ roleId: role.id }] },
      },
    });
    const t: T = { tenantId, adminId, roleId: role.id, ctx: null };
    t.ctx = ctxDe(t);
    return t;
  }

  /** Fixa a sessão do ADMIN do tenant e devolve o ctx do serviço. */
  function ctxDe(t: { tenantId: string; adminId: string }, opts: { perms?: string[]; email?: boolean } = {}) {
    const perms = opts.perms ?? [P_USERS];
    sessao.actual = {
      id: t.adminId,
      tenantId: t.tenantId,
      permissions: [...perms],
      emailVerificado: opts.email ?? true,
      acesso: 'aberto',
    };
    return { tenantId: t.tenantId, userId: t.adminId, permissions: new Set(perms) };
  }

  /** Colaborador sem papel ADMIN (não toca no ULTIMO_ADMIN). */
  async function colaborador(
    t: T,
    extra: { ativo?: boolean; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const id = novoId('colab');
    await db.user.create({
      data: {
        id,
        tenantId: t.tenantId,
        email: `${id}@ud179.mz`,
        nome: `Colaborador ${seq}`,
        keycloakSub: `kc-${id}`,
        ativo: extra.ativo ?? true,
        deletedAt: extra.deletedAt ?? null,
      },
    });
    return id;
  }

  const linha = (id: string) =>
    db.user.findUnique({ where: { id }, select: { ativo: true, deletedAt: true } });

  async function erroDe(p: Promise<unknown>): Promise<any> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    return null;
  }

  function reactivar(id: string, ctx: any): Promise<any> {
    expect(typeof svc.reactivarUtilizador, 'userAdminService.reactivarUtilizador não existe').toBe('function');
    return svc.reactivarUtilizador(id, ctx);
  }

  // ── D: desactivar ────────────────────────────────────────────────────────────

  describe('D — desactivar', () => {
    it('D1: passa a ativo=false, desliga no Keycloak e NÃO escreve deletedAt', async () => {
      const t = await novoTenant('d1');
      const u = await colaborador(t);

      await svc.desactivarUtilizador(u, ctxDe(t));

      const r = await linha(u);
      expect(r.ativo).toBe(false);
      expect(r.deletedAt, 'desactivar gravou deletedAt — a acção ficou irreversível').toBeNull();
      expect(kc.definirActivo).toHaveBeenCalledWith(`kc-${u}`, false);
    });

    it('D2: o desactivado continua alcançável — obterUtilizador devolve-o inactivo', async () => {
      const t = await novoTenant('d2-obter');
      const u = await colaborador(t);
      await svc.desactivarUtilizador(u, ctxDe(t));

      const e = await erroDe(svc.obterUtilizador(u, ctxDe(t)));
      expect(e, `obterUtilizador do desactivado falhou: ${e?.name} ${e?.message}`).toBeNull();
      const row = await svc.obterUtilizador(u, ctxDe(t));
      expect(row.id).toBe(u);
      expect(row.ativo).toBe(false);
    });

    it('D2: a listagem mostra-o sem filtro e com ativo:false, não com ativo:true', async () => {
      const t = await novoTenant('d2-lista');
      const u = await colaborador(t);
      await svc.desactivarUtilizador(u, ctxDe(t));

      const ids = async (filtro: Record<string, unknown>) =>
        (await svc.listarUtilizadores({ take: 100, ...filtro }, ctxDe(t))).items.map((x: any) => x.id);

      expect(await ids({}), 'sem filtro').toContain(u);
      expect(await ids({ ativo: false }), 'filtro Inactivos').toContain(u);
      expect(await ids({ ativo: true }), 'filtro Activos').not.toContain(u);
    });

    it('D3: desactivar continua a libertar o lugar do plano (Básico cheio → desactiva um → reactiva outro)', async () => {
      const t = await novoTenant('d3', 'BASICO');
      const a = await colaborador(t);
      await colaborador(t); // 3 activos = limite do Básico
      const inactivo = await colaborador(t, { ativo: false });

      await svc.desactivarUtilizador(a, ctxDe(t));
      await reactivar(inactivo, ctxDe(t));

      expect((await linha(inactivo)).ativo).toBe(true);
      expect(await db.user.count({ where: { tenantId: t.tenantId, ativo: true } })).toBe(3);
    });
  });

  // ── R: reactivar ─────────────────────────────────────────────────────────────

  describe('R — reactivar', () => {
    it('R1: reactivarUtilizador passa a ativo=true, liga no Keycloak e deletedAt continua null', async () => {
      const t = await novoTenant('r1');
      const u = await colaborador(t, { ativo: false });

      await reactivar(u, ctxDe(t));

      const r = await linha(u);
      expect(r.ativo).toBe(true);
      expect(r.deletedAt).toBeNull();
      expect(kc.definirActivo).toHaveBeenCalledWith(`kc-${u}`, true);
    });

    it('R2: Básico com 3 activos — reactivar recusa LIMITE_PLANO_UTILIZADORES antes do Keycloak', async () => {
      const t = await novoTenant('r2-cheio', 'BASICO');
      await colaborador(t);
      await colaborador(t); // 3 activos
      const u = await colaborador(t, { ativo: false });

      const e = await erroDe(reactivar(u, ctxDe(t)));

      expect(e, 'reactivar acima do limite do plano passou').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect(e.message).toMatch(/Básico/);
      expect(kc.definirActivo).not.toHaveBeenCalled();
      expect((await linha(u)).ativo).toBe(false);
    });

    it('R2: Básico com 2 activos — reactivar o 3.º passa (limite inclusivo)', async () => {
      const t = await novoTenant('r2-livre', 'BASICO');
      await colaborador(t); // 2 activos
      const u = await colaborador(t, { ativo: false });

      await reactivar(u, ctxDe(t));
      expect((await linha(u)).ativo).toBe(true);
    });

    it('R3: com o e-mail por confirmar, reactivar recusa EMAIL_POR_CONFIRMAR_UTILIZADORES antes do Keycloak', async () => {
      const t = await novoTenant('r3');
      const u = await colaborador(t, { ativo: false });

      const e = await erroDe(reactivar(u, ctxDe(t, { email: false })));

      expect(e, 'reactivar com e-mail por confirmar passou').not.toBeNull();
      expect(e.code).toBe('EMAIL_POR_CONFIRMAR_UTILIZADORES');
      expect(kc.definirActivo).not.toHaveBeenCalled();
      expect((await linha(u)).ativo).toBe(false);
    });

    it('R4: Keycloak primeiro — se o Keycloak falhar, o User local continua inactivo', async () => {
      const t = await novoTenant('r4');
      const u = await colaborador(t, { ativo: false });
      kc.definirActivo.mockImplementation(async () => {
        throw new Error('[keycloak] actualização de estado falhou (HTTP 503)');
      });

      const e = await erroDe(reactivar(u, ctxDe(t)));

      expect(e, 'reactivar com o Keycloak em baixo não falhou').not.toBeNull();
      expect((await linha(u)).ativo).toBe(false);
    });

    it('R5: utilizador de outro tenant → NotFoundError, e nada muda', async () => {
      const outro = await novoTenant('r5-outro');
      const alheio = await colaborador(outro, { ativo: false });
      const t = await novoTenant('r5-meu');

      const e = await erroDe(reactivar(alheio, ctxDe(t)));

      expect(e?.name).toBe('NotFoundError');
      expect(kc.definirActivo).not.toHaveBeenCalled();
      expect((await linha(alheio)).ativo).toBe(false);
    });

    it('R5: utilizador eliminado (deletedAt preenchido) → NotFoundError, continua eliminado', async () => {
      const t = await novoTenant('r5-elim');
      const quando = new Date('2026-01-15T10:00:00Z');
      const u = await colaborador(t, { ativo: false, deletedAt: quando });

      const e = await erroDe(reactivar(u, ctxDe(t)));

      expect(e?.name).toBe('NotFoundError');
      expect(kc.definirActivo).not.toHaveBeenCalled();
      const r = await linha(u);
      expect(r.ativo).toBe(false);
      expect(r.deletedAt).not.toBeNull();
    });

    it('R6: reversível nos dois sentidos, repetidamente', async () => {
      const t = await novoTenant('r6');
      const u = await colaborador(t);

      for (let volta = 1; volta <= 2; volta++) {
        await svc.desactivarUtilizador(u, ctxDe(t));
        expect((await linha(u)).ativo, `volta ${volta}: desactivar`).toBe(false);
        await reactivar(u, ctxDe(t));
        const r = await linha(u);
        expect(r.ativo, `volta ${volta}: reactivar`).toBe(true);
        expect(r.deletedAt).toBeNull();
      }
      expect(kc.definirActivo.mock.calls.map((c) => c[1])).toEqual([false, true, false, true]);
    });
  });

  // ── A: Server Actions que o ecrã consome ─────────────────────────────────────

  describe('A — Server Actions', () => {
    it('A1: reactivarUtilizador({ id }) grava e devolve ok:true', async () => {
      expect(typeof actions.reactivarUtilizador, 'reactivarUtilizador não está exportada de plataforma.actions').toBe(
        'function',
      );
      const t = await novoTenant('a1-ok');
      const u = await colaborador(t, { ativo: false });
      ctxDe(t);

      const r: Resultado = await actions.reactivarUtilizador({ id: u });

      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect((await linha(u)).ativo).toBe(true);
      expect(kc.definirActivo).toHaveBeenCalledWith(`kc-${u}`, true);
    });

    it('A1: no limite do plano devolve ok:false LIMITE_PLANO_UTILIZADORES (sem lançar) e nada muda', async () => {
      expect(typeof actions.reactivarUtilizador, 'reactivarUtilizador não está exportada de plataforma.actions').toBe(
        'function',
      );
      const t = await novoTenant('a1-limite', 'BASICO');
      await colaborador(t);
      await colaborador(t);
      const u = await colaborador(t, { ativo: false });
      ctxDe(t);

      const r: Resultado = await actions.reactivarUtilizador({ id: u });

      expect(r.ok, JSON.stringify(r)).toBe(false);
      expect(r.error?.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect((await linha(u)).ativo).toBe(false);
    });

    it('A1: sem admin:gerir_utilizadores a action recusa e nada muda', async () => {
      expect(typeof actions.reactivarUtilizador, 'reactivarUtilizador não está exportada de plataforma.actions').toBe(
        'function',
      );
      const t = await novoTenant('a1-perm');
      const u = await colaborador(t, { ativo: false });
      ctxDe(t, { perms: ['vendas:ver'] });

      const r: Resultado = await actions.reactivarUtilizador({ id: u });

      expect(r.ok, JSON.stringify(r)).toBe(false);
      expect(kc.definirActivo).not.toHaveBeenCalled();
      expect((await linha(u)).ativo).toBe(false);
    });

    it('A2: a action desactivarUtilizador deixa deletedAt a null', async () => {
      const t = await novoTenant('a2');
      const u = await colaborador(t);
      ctxDe(t);

      const r: Resultado = await actions.desactivarUtilizador({ id: u });

      expect(r.ok, JSON.stringify(r)).toBe(true);
      const l = await linha(u);
      expect(l.ativo).toBe(false);
      expect(l.deletedAt, 'a action desactivarUtilizador gravou deletedAt').toBeNull();
    });
  });
});
