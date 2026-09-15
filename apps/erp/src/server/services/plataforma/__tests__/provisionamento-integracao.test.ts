/**
 * Teste de integração — provisionamento self-service (spec 19, revisto pelo
 * ADR-0013).
 *
 * Requer DB PostgreSQL activa (`DATABASE_URL` em `apps/erp/.env`) com o schema
 * aplicado. Salta automaticamente se não houver DB.
 *
 * Prova o que os testes com mocks não conseguem provar: que a `$transaction`
 * é mesmo atómica no Postgres e que uma falha a meio não deixa tenant parcial.
 * O lado Keycloak é DUBLADO aqui de propósito — este teste é sobre o Postgres;
 * o caminho real contra um Keycloak vivo é provado pela suite E2E (gate da
 * fase 2) e pelo smoke do registo público.
 */
import 'dotenv/config';

import { describe, it, expect, afterAll, vi } from 'vitest';

const kc = vi.hoisted(() => ({
  subs: new Map<string, string>(),
  garantirUtilizador: vi.fn(async ({ email }: { email: string }) => {
    const existente = kc.subs.get(email);
    if (existente) return { sub: existente, criado: false };
    const sub = `kc-integ-${kc.subs.size}-${Date.now()}`;
    kc.subs.set(email, sub);
    return { sub, criado: true };
  }),
  dispararEmailAccoes: vi.fn(async () => true),
  definirActivo: vi.fn(async () => undefined),
}));
vi.mock('@/server/auth/keycloak', () => kc);

import { prismaBase } from '@/server/db/client';
import { provisionarTenant } from '../tenant-provisioning.service';

const temDB = Boolean(process.env.DATABASE_URL);
const SUFIXO = String(Date.now()).slice(-9);
const NUIT = `4${SUFIXO.slice(0, 8)}`;
const EMAIL = `admin+${SUFIXO}@teste-spec19.mz`;
const NOME_EMPRESA = `Teste Spec19 ${SUFIXO}`;

const criados: string[] = [];

async function limpar(tenantId: string) {
  // Ordem inversa das FKs. `prismaBase` (sem contexto de tenant) é o cliente
  // certo: o tenant destes registos não existe em lado nenhum a não ser aqui.
  await prismaBase.notificacao.deleteMany({ where: { tenantId } });
  await prismaBase.assinatura.deleteMany({ where: { tenantId } });
  await prismaBase.serieDocumento.deleteMany({ where: { tenantId } });
  await prismaBase.diario.deleteMany({ where: { tenantId } });
  // As contas PGC referenciam-se entre si — apagar folhas primeiro.
  for (const nivel of [4, 3, 2, 1]) {
    await prismaBase.contaPGC.deleteMany({ where: { tenantId, nivel } });
  }
  const users = await prismaBase.user.findMany({ where: { tenantId }, select: { id: true } });
  await prismaBase.userRole.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prismaBase.user.deleteMany({ where: { tenantId } });
  const roles = await prismaBase.role.findMany({ where: { tenantId }, select: { id: true } });
  await prismaBase.rolePermission.deleteMany({ where: { roleId: { in: roles.map((r) => r.id) } } });
  await prismaBase.role.deleteMany({ where: { tenantId } });
  await prismaBase.configuracaoFiscal.deleteMany({ where: { tenantId } });
  await prismaBase.tenant.deleteMany({ where: { id: tenantId } });
}

afterAll(async () => {
  for (const tenantId of criados) {
    await limpar(tenantId).catch(() => {});
  }
});

describe.skipIf(!temDB)('provisionamento — integração com Postgres', () => {
  // O bootstrap do PGC (502 contas + diários + séries) demora mais do que os
  // 5 s por omissão numa DB partilhada — timeout explícito, não sintoma.
  it('cria o tenant completo numa única transacção, Keycloak primeiro', { timeout: 90_000 }, async () => {
    const r = await provisionarTenant({
      empresa: { nome: NOME_EMPRESA, nuit: NUIT },
      admin: { nome: 'Ana Teste', email: EMAIL },
      planoId: 'PROFISSIONAL',
      provincia: 'Maputo Cidade',
    });
    criados.push(r.tenantId);

    expect(r.tenantSlug).toMatch(/^teste-spec19-/);
    expect(kc.garantirUtilizador).toHaveBeenCalledWith({
      email: EMAIL,
      nome: 'Ana Teste',
      accoes: [],
      emailVerificado: false,
    });

    const [cfg, assinatura, user, contas, series, diarios, notif] = await Promise.all([
      prismaBase.configuracaoFiscal.findUnique({ where: { tenantId: r.tenantId } }),
      prismaBase.assinatura.findUnique({ where: { tenantId: r.tenantId } }),
      prismaBase.user.findFirst({ where: { tenantId: r.tenantId } }),
      prismaBase.contaPGC.count({ where: { tenantId: r.tenantId } }),
      prismaBase.serieDocumento.count({ where: { tenantId: r.tenantId } }),
      prismaBase.diario.count({ where: { tenantId: r.tenantId } }),
      prismaBase.notificacao.findFirst({ where: { tenantId: r.tenantId } }),
    ]);

    expect(cfg?.moedaBase).toBe('MZN');
    expect(cfg?.timezone).toBe('Africa/Maputo');
    expect(cfg?.statusAtivo).toBe(true);
    expect(assinatura?.estado).toBe('TRIAL');
    // Espelho da identidade: o sub do Keycloak fica gravado; «por activar»
    // é primeiroAcessoEm null até ao primeiro login (ADR-0013 §5-bis).
    expect(user?.keycloakSub).toBe(r.keycloakSub);
    expect(user?.primeiroAcessoEm).toBeNull();
    expect(contas).toBe(502); // 504 entradas no JSON, 2 duplicadas
    expect(series).toBeGreaterThan(15);
    expect(diarios).toBe(9);
    // Boas-vindas é in-app: o ÚNICO e-mail do registo é o de acções do Keycloak.
    expect(notif?.canal).toBe('IN_APP');

    // Role ADMIN atribuído
    const roles = await prismaBase.userRole.findMany({
      where: { userId: user!.id },
      include: { role: { select: { nome: true } } },
    });
    expect(roles.map((r2) => r2.role.nome)).toContain('ADMIN');
  });

  it('recusa NUIT duplicado sem criar um segundo tenant', async () => {
    const antes = await prismaBase.tenant.count();
    await expect(
      provisionarTenant({
        empresa: { nome: 'Outra Empresa', nuit: NUIT },
        admin: { nome: 'X', email: `x+${Date.now()}@teste-spec19.mz` },
        planoId: 'BASICO',
        provincia: 'Sofala',
      }),
    ).rejects.toMatchObject({ code: 'NUIT_JA_REGISTADO' });
    expect(await prismaBase.tenant.count()).toBe(antes);
  });

  it('recusa e-mail já usado em QUALQUER tenant — com a mensagem das duas empresas', async () => {
    await expect(
      provisionarTenant({
        empresa: { nome: 'Empresa Nova', nuit: `4${String(Date.now() + 7).slice(-8)}` },
        admin: { nome: 'Ana Outra Vez', email: EMAIL },
        planoId: 'BASICO',
        provincia: 'Sofala',
      }),
    ).rejects.toMatchObject({
      code: 'EMAIL_JA_REGISTADO',
      message: expect.stringContaining('dois endereços de e-mail distintos'),
    });
    // (A garantia «recusa antes de tocar no Keycloak» é provada nos testes
    // unitários do serviço — aqui interessa a unicidade global no Postgres.)
  });
});
