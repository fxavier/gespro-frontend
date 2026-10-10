/**
 * Oráculo #373 — a limpeza do tenant que o E2E 36 regista (`e2e/helpers/db.ts`) não deixa resíduo
 * e não toca em mais ninguém.
 *
 * O E2E 36 regista um tenant por `/registo` e percorre o ciclo do exercício; antes de #373 cada
 * corrida deixava «Ciclo E2E 366 <stamp>» na base. O `afterAll` do spec passa a chamar
 * `limparTenant`. Aqui prova-se esse helper contra um Postgres efémero, com um tenant feito pelo
 * MESMO caminho do E2E — `registarTenant` (Keycloak dobrado, como em `registo-publico.test.ts`) —
 * mais lançamentos confirmados, para cobrir as FKs do domínio contabilístico (partidas → lançamento
 * → período → exercício; plano PGC auto-referenciado até ao nível 7).
 *
 * O resíduo é medido aqui por conta própria — modelos com `tenantId` do `Prisma.dmmf` (o critério
 * da tenant-extension) e as junções `UserRole`/`RolePermission` pelos ids lidos ANTES —, não pelo
 * `residuoDoTenant` do helper: quem é testado não se avalia a si próprio.
 *
 * Requer Docker. Com `SKIP_INTEGRATION=true` todos os casos saltam.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

const kc = vi.hoisted(() => {
  const identidades = new Map<string, { sub: string; senha?: string }>();
  return {
    identidades,
    procurarPorEmail: vi.fn(async (email: string) => {
      const u = identidades.get(email);
      return u ? { id: u.sub, email } : null;
    }),
    garantirUtilizador: vi.fn(async (input: { email: string }) => {
      const existente = identidades.get(input.email);
      if (existente) return { sub: existente.sub, criado: false };
      const sub = `kc-373-${identidades.size + 1}-${Date.now()}`;
      identidades.set(input.email, { sub });
      return { sub, criado: true };
    }),
    definirPalavraPasse: vi.fn(async (sub: string, senha: string) => {
      for (const [, u] of identidades) if (u.sub === sub) u.senha = senha;
    }),
    eliminarUtilizador: vi.fn(async (sub: string) => {
      for (const [email, u] of identidades) if (u.sub === sub) identidades.delete(email);
    }),
  };
});

vi.mock('@/server/auth/keycloak', () => ({
  ErroKeycloak: class ErroKeycloak extends Error {},
  procurarPorEmail: kc.procurarPorEmail,
  garantirUtilizador: kc.garantirUtilizador,
  definirPalavraPasse: kc.definirPalavraPasse,
  eliminarUtilizador: kc.eliminarUtilizador,
}));

vi.mock('@/server/services/plataforma/assinatura.service', () => ({
  criarSubscricaoTrial: vi.fn(async () => ({ criada: false })),
}));

const TS = Date.now();
const SENHA = 'Ciclo-373-Segura!';
let seq = 0;

type Helper = typeof import('../../e2e/helpers/db');
type AnyDb = any;

describe.skipIf(skip)('#373 — limparTenant (helper dos E2E) contra Postgres real', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let registarTenant: typeof import('@/server/provisioning/registo-publico').registarTenant;
  let helper: Helper;
  let modelosComTenant: string[];
  const url = () => process.env.INTEGRATION_DB_URL as string;

  beforeAll(async () => {
    process.env.CAPTCHA_PROVIDER = 'none';
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    ({ registarTenant } = await import('@/server/provisioning/registo-publico'));
    helper = await import('../../e2e/helpers/db');
    const { Prisma } = await import('@prisma/client');
    modelosComTenant = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
      .map((m) => m.name);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  /** Regista um tenant pelo caminho do E2E e confirma dois lançamentos nele. */
  async function tenantRegistado(): Promise<{ tenantId: string; email: string }> {
    seq += 1;
    const nuit = String(400_000_000 + ((TS + seq) % 99_999_999)).slice(0, 9);
    const email = `e2e-36-ciclo-exercicio-373.${TS}.${seq}@exemplo.mz`;
    const r = await registarTenant(
      {
        empresa: { nome: `Ciclo E2E 373 ${TS}-${seq}`, nuit },
        admin: { nome: 'Admin 373', email },
        senha: SENHA,
        confirmacao: SENHA,
        planoId: 'PROFISSIONAL',
        provincia: 'Maputo Cidade',
        captchaToken: 'dev',
      },
      { ip: `41.37.3.${seq}`, idempotencyKey: `chave-373-${TS}-${seq}` },
    );
    expect(r.ok, `registo: ${JSON.stringify(r)}`).toBe(true);

    const user = await db.user.findFirst({ where: { email }, select: { id: true, tenantId: true } });
    expect(user, 'o registo cria o utilizador').toBeTruthy();
    const ctx = { tenantId: user.tenantId as string, userId: user.id as string };

    let doc = 0;
    for (const [debito, credito, valor] of [
      ['111', '711', '1000'],
      ['622', '111', '300'],
    ] as const) {
      await runCtx(ctx, () =>
        db.$transaction((tx: AnyDb) =>
          contab.registarLancamentoContabilistico(
            tx,
            {
              data: new Date(),
              diarioTipo: 'OPERACOES',
              origem: 'AJUSTE',
              documentoOrigemId: `doc-373-${seq}-${++doc}`,
              documentoOrigemTipo: 'Teste373',
              historico: `Teste 373 ${debito}/${credito} ${valor}`,
              partidas: [
                { contaCodigo: debito, tipo: 'DEBITO', valor },
                { contaCodigo: credito, tipo: 'CREDITO', valor },
              ],
            },
            ctx,
          ),
        ),
      );
    }
    return { tenantId: ctx.tenantId, email };
  }

  /** Contagem por modelo com `tenantId` + junções sem `tenantId` (pelos ids dados) + o Tenant. */
  async function contagens(tenantId: string, users: string[], roles: string[]) {
    const n: Record<string, number> = {};
    for (const m of modelosComTenant) {
      const c = await db[m.charAt(0).toLowerCase() + m.slice(1)].count({ where: { tenantId } });
      if (c > 0) n[m] = c;
    }
    const ur = await db.userRole.count({ where: { userId: { in: users } } });
    if (ur > 0) n.UserRole = ur;
    const rp = await db.rolePermission.count({ where: { roleId: { in: roles } } });
    if (rp > 0) n.RolePermission = rp;
    const t = await db.tenant.count({ where: { id: tenantId } });
    if (t > 0) n.Tenant = t;
    return n;
  }

  async function idsDe(tenantId: string) {
    const users = (await db.user.findMany({ where: { tenantId }, select: { id: true } })).map((u: AnyDb) => u.id);
    const roles = (await db.role.findMany({ where: { tenantId }, select: { id: true } })).map((r: AnyDb) => r.id);
    return { users, roles };
  }

  it('apaga o tenant registado inteiro — zero linhas em qualquer tabela — e deixa o vizinho igual', async () => {
    const alvo = await tenantRegistado();
    const vizinho = await tenantRegistado();

    const idsAlvo = await idsDe(alvo.tenantId);
    const idsVizinho = await idsDe(vizinho.tenantId);
    const antesAlvo = await contagens(alvo.tenantId, idsAlvo.users, idsAlvo.roles);
    // Pré-condições: o cenário tem mesmo o que a limpeza tem de vencer.
    expect(antesAlvo.ContaPGC, 'plano de contas do bootstrap').toBeGreaterThan(400);
    expect(antesAlvo.Lancamento, 'lançamentos confirmados').toBeGreaterThanOrEqual(2);
    expect(antesAlvo.PartidaLancamento ?? 0, 'partidas').toBeGreaterThanOrEqual(4);
    expect(antesAlvo.UserRole, 'papel do admin').toBeGreaterThan(0);
    expect(antesAlvo.RolePermission, 'permissões dos papéis').toBeGreaterThan(0);
    const antesVizinho = await contagens(vizinho.tenantId, idsVizinho.users, idsVizinho.roles);

    const apagadas = await helper.limparTenant(alvo.tenantId, url());

    const total = Object.values(antesAlvo).reduce((a, b) => a + b, 0);
    expect(apagadas, 'linhas apagadas = linhas que o tenant tinha').toBe(total);
    expect(await contagens(alvo.tenantId, idsAlvo.users, idsAlvo.roles)).toEqual({});
    expect(await helper.tenantIdDoUtilizador(alvo.email, url())).toBeNull();
    expect(await contagens(vizinho.tenantId, idsVizinho.users, idsVizinho.roles)).toEqual(antesVizinho);
    expect(await helper.residuoDoTenant(alvo.tenantId, url())).toEqual({});
  });

  it('tenantIdDoUtilizador encontra o tenant pelo e-mail do admin registado', async () => {
    const t = await tenantRegistado();
    expect(await helper.tenantIdDoUtilizador(t.email, url())).toBe(t.tenantId);
    await helper.limparTenant(t.tenantId, url());
  });

  it('é idempotente: limpar um tenant que já não existe não falha e não apaga nada', async () => {
    const t = await tenantRegistado();
    await helper.limparTenant(t.tenantId, url());
    expect(await helper.limparTenant(t.tenantId, url())).toBe(0);
  });

  it.each(['demo', 'perf-373-carga'])('recusa um tenant partilhado (slug «%s») e não apaga nada', async (slug) => {
    const tenantId = `tenant-373-${slug}-${TS}`;
    await db.tenant.create({ data: { id: tenantId, nome: `Partilhado ${slug}`, slug, nuit: `${TS}`.slice(-9) } });
    await db.user.create({
      data: { tenantId, email: `${slug}-${TS}@test.mz`, nome: 'Alguém', keycloakSub: `kc-373-${slug}-${TS}` },
    });

    await expect(helper.limparTenant(tenantId, url())).rejects.toThrow(/recusa/);
    expect(await db.tenant.count({ where: { id: tenantId } })).toBe(1);
    expect(await db.user.count({ where: { tenantId } })).toBe(1);

    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
  });
});
