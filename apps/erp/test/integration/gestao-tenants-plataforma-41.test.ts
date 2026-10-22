/**
 * Issue #41 — escalada cross-tenant na gestão de tenants.
 *
 * `criarTenant`/`actualizarTenant`/`desactivarTenant`/`reactivarTenant` (plataforma.actions.ts)
 * recebem o `id` do tenant do cliente e estavam atrás de `core_tenancy:configurar` — permissão
 * que o papel ADMIN de QUALQUER tenant tem (`ADMIN: allCodes()`). O ADMIN de A desactivava B.
 *
 * Contrato (ADR-0049 §5 e adenda #549):
 *   G1 sessão ADMIN do tenant A → as quatro recusam com NAO_ENCONTRADO e B fica como estava;
 *   G2 sessão com tenant E o papel `plataforma-admin` → recusada da mesma forma (#549);
 *   G3 administrador de plataforma (sessão sem tenant) → consegue, e cada escrita deixa linha
 *      no trilho global `AuditoriaPlataforma` com o `sub` de quem agiu.
 *
 * Só `@/lib/auth` (sessão mutável) e `next/cache` são dobrados.
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

const sessao = vi.hoisted(() => ({ actual: {} as Record<string, unknown> }));
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
type Accao = (input: unknown) => Promise<Resultado>;

describe.skipIf(skip)('#41 — gestão de tenants só pelo administrador de plataforma', () => {
  let db: any;
  let actions: Record<string, Accao>;

  const sufixo = `${Date.now()}`;
  const s8 = sufixo.slice(-8);
  const TENANT_A = `cga41a${sufixo}`;
  const TENANT_B = `cgb41b${sufixo}`;
  const USER_A = `user-g41-${sufixo}`;
  const SUB_PLAT = `kc-plat-g41-${sufixo}`;
  const SLUGS_CRIADOS = [`g41-adm-${s8}`, `g41-duplo-${s8}`, `g41-plat-${s8}`];
  const TODAS_PERMS = ['core_tenancy:configurar', 'core_tenancy:ver', 'admin:gerir_utilizadores'];

  const sessaoAdminDeA = () => {
    sessao.actual = {
      id: USER_A,
      tenantId: TENANT_A,
      permissions: TODAS_PERMS,
      emailVerificado: true,
      acesso: 'aberto',
    };
  };
  const sessaoDuplo = () => {
    sessaoAdminDeA();
    sessao.actual.plataformaAdmin = true;
  };
  const sessaoPlataforma = () => {
    sessao.actual = { id: SUB_PLAT, plataformaAdmin: true, permissions: [], acesso: 'aberto' };
  };

  const lerB = async () => {
    const t = await db.tenant.findFirst({ where: { id: TENANT_B } });
    const cfg = await db.configuracaoFiscal.findFirst({ where: { tenantId: TENANT_B } });
    const ass = await db.assinatura.findFirst({ where: { tenantId: TENANT_B } });
    return {
      nome: t.nome,
      deletedAt: t.deletedAt,
      statusAtivo: cfg.statusAtivo,
      regimeIva: cfg.regimeIva,
      taxa: cfg.taxaIvaDefault.toString(),
      plano: ass.planoAssinatura,
    };
  };

  const novoTenant = (slug: string, n: string) => ({
    nome: `Tenant ${slug}`,
    slug,
    nuit: `${n}${s8}`,
    planoAssinatura: 'BASICO',
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/plataforma.actions')) as unknown as Record<string, Accao>;

    for (const [id, n] of [
      [TENANT_A, '1'],
      [TENANT_B, '2'],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${id}`, slug: `g41-${id}`, nuit: `${n}${s8}` } });
      await db.configuracaoFiscal.create({ data: { tenantId: id, regimeIva: 'NORMAL', taxaIvaDefault: 0.16 } });
      await db.assinatura.create({
        data: {
          tenantId: id,
          planoAssinatura: 'PROFISSIONAL',
          estado: 'ATIVA',
          trialInicio: new Date('2026-01-01'),
          trialFim: new Date('2026-01-31'),
        },
      });
    }
    await db.user.create({
      data: {
        id: USER_A,
        tenantId: TENANT_A,
        email: `admin-g41-${sufixo}@a.mz`,
        nome: 'Admin A',
        keycloakSub: `kc-a-g41-${sufixo}`,
      },
    });
  });

  afterAll(async () => {
    if (!db) return;
    const criados = await db.tenant.findMany({ where: { slug: { in: SLUGS_CRIADOS } }, select: { id: true } });
    const ids = [TENANT_A, TENANT_B, ...criados.map((t: { id: string }) => t.id)];
    await db.auditoriaPlataforma.deleteMany({ where: { keycloakSub: SUB_PLAT } });
    await db.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await db.user.deleteMany({ where: { tenantId: { in: ids } } });
    await db.assinatura.deleteMany({ where: { tenantId: { in: ids } } });
    await db.configuracaoFiscal.deleteMany({ where: { tenantId: { in: ids } } });
    await db.tenant.deleteMany({ where: { id: { in: ids } } });
  });

  for (const [nome, entrar] of [
    ['G1 ADMIN do tenant A', sessaoAdminDeA],
    ['G2 sessão com tenant e papel plataforma-admin (#549)', sessaoDuplo],
  ] as const) {
    describe(nome, () => {
      it('desactivar/actualizar/reactivar B → NAO_ENCONTRADO e B inalterado', async () => {
        entrar();
        const antes = await lerB();

        const r1 = await actions.desactivarTenant({ id: TENANT_B });
        const r2 = await actions.actualizarTenant({
          id: TENANT_B,
          data: { nome: 'Sequestrado', regimeIva: 'ISENTO', taxaIvaDefault: 0, planoAssinatura: 'BASICO' },
        });
        await db.tenant.update({ where: { id: TENANT_B }, data: { deletedAt: new Date('2026-01-01') } });
        const r3 = await actions.reactivarTenant({ id: TENANT_B });
        const aindaApagado = (await db.tenant.findFirst({ where: { id: TENANT_B } })).deletedAt;
        await db.tenant.update({ where: { id: TENANT_B }, data: { deletedAt: null } });

        for (const r of [r1, r2, r3]) {
          expect(r.ok, JSON.stringify(r)).toBe(false);
          expect(r.error?.code).toBe('NAO_ENCONTRADO');
        }
        expect(aindaApagado, 'reactivar mexeu em B').not.toBeNull();
        expect(await lerB()).toEqual(antes);
      });

      it('criarTenant → NAO_ENCONTRADO e nada criado', async () => {
        entrar();
        const slug = entrar === sessaoDuplo ? SLUGS_CRIADOS[1] : SLUGS_CRIADOS[0];
        const r = await actions.criarTenant(novoTenant(slug, entrar === sessaoDuplo ? '4' : '3'));
        expect(r.ok, JSON.stringify(r)).toBe(false);
        expect(r.error?.code).toBe('NAO_ENCONTRADO');
        expect(await db.tenant.findFirst({ where: { slug } })).toBeNull();
      });
    });
  }

  describe('G3 administrador de plataforma (sem tenant)', () => {
    it('actualiza, desactiva e reactiva B, e o trilho guarda cada escrita', async () => {
      sessaoPlataforma();

      const r1 = await actions.actualizarTenant({ id: TENANT_B, data: { nome: 'Nome novo B' } });
      expect(r1.ok, JSON.stringify(r1)).toBe(true);
      expect((await lerB()).nome).toBe('Nome novo B');

      const r2 = await actions.desactivarTenant({ id: TENANT_B });
      expect(r2.ok, JSON.stringify(r2)).toBe(true);
      expect((await lerB()).deletedAt).not.toBeNull();

      const r3 = await actions.reactivarTenant({ id: TENANT_B });
      expect(r3.ok, JSON.stringify(r3)).toBe(true);
      expect((await lerB()).deletedAt).toBeNull();

      const trilho = await db.auditoriaPlataforma.findMany({
        where: { keycloakSub: SUB_PLAT, entidade: 'Tenant', codigo: `g41-${TENANT_B}` },
        orderBy: { createdAt: 'asc' },
      });
      expect(trilho.map((l: { acao: string }) => l.acao)).toEqual(['ACTUALIZAR', 'ARQUIVAR', 'DESARQUIVAR']);
    });

    it('cria um tenant, com linha CRIAR no trilho', async () => {
      sessaoPlataforma();
      const slug = SLUGS_CRIADOS[2];
      const r = await actions.criarTenant(novoTenant(slug, '5'));
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(await db.tenant.findFirst({ where: { slug } })).not.toBeNull();
      const linha = await db.auditoriaPlataforma.findFirst({
        where: { keycloakSub: SUB_PLAT, entidade: 'Tenant', codigo: slug },
      });
      expect(linha?.acao).toBe('CRIAR');
    });
  });
});
