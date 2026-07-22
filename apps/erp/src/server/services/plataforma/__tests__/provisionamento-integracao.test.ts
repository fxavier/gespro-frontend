/**
 * Teste de integração — provisionamento self-service (spec 19, task 9.1).
 *
 * Requer DB PostgreSQL activa (`DATABASE_URL` em `apps/erp/.env`) com o schema
 * do spec 19 aplicado. Salta automaticamente se não houver DB.
 *
 * Prova o que os testes com mocks não conseguem provar: que a `$transaction`
 * é mesmo atómica no Postgres e que uma falha a meio não deixa tenant parcial.
 */
import 'dotenv/config';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaBase } from '@/server/db/client';
import { provisionarTenant, verificarEmail } from '../tenant-provisioning.service';
import { consumirToken } from '../handoff.service';

const temDB = Boolean(process.env.DATABASE_URL);
const SUFIXO = String(Date.now()).slice(-9);
const NUIT = `4${SUFIXO.slice(0, 8)}`;
const EMAIL = `admin+${SUFIXO}@teste-spec19.mz`;
const NOME_EMPRESA = `Teste Spec19 ${SUFIXO}`;

const criados: string[] = [];

async function limpar(tenantId: string) {
  // Ordem inversa das FKs. `prismaBase` (sem contexto de tenant) é o cliente
  // certo: o tenant destes registos não existe em lado nenhum a não ser aqui.
  await prismaBase.tokenHandoff.deleteMany({ where: { tenantId } });
  await prismaBase.tokenVerificacaoEmail.deleteMany({ where: { tenantId } });
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

beforeAll(() => {
  process.env.HANDOFF_SIGNING_SECRET =
    process.env.HANDOFF_SIGNING_SECRET ?? 'segredo-de-teste-integracao-com-32-chars';
});

afterAll(async () => {
  for (const tenantId of criados) {
    await limpar(tenantId).catch(() => {});
  }
});

describe.skipIf(!temDB)('provisionamento — integração com Postgres', () => {
  it('cria o tenant completo numa única transacção', async () => {
    const r = await provisionarTenant({
      empresa: { nome: NOME_EMPRESA, nuit: NUIT },
      admin: { nome: 'Ana Teste', email: EMAIL, senha: 'segredo123' },
      planoId: 'PROFISSIONAL',
      provincia: 'Maputo Cidade',
    });
    criados.push(r.tenantId);

    expect(r.tenantSlug).toMatch(/^teste-spec19-/);

    const [cfg, assinatura, user, contas, series, diarios, notif, tokenVerif] = await Promise.all([
      prismaBase.configuracaoFiscal.findUnique({ where: { tenantId: r.tenantId } }),
      prismaBase.assinatura.findUnique({ where: { tenantId: r.tenantId } }),
      prismaBase.user.findFirst({ where: { tenantId: r.tenantId } }),
      prismaBase.contaPGC.count({ where: { tenantId: r.tenantId } }),
      prismaBase.serieDocumento.count({ where: { tenantId: r.tenantId } }),
      prismaBase.diario.count({ where: { tenantId: r.tenantId } }),
      prismaBase.notificacao.findFirst({ where: { tenantId: r.tenantId } }),
      prismaBase.tokenVerificacaoEmail.findFirst({ where: { tenantId: r.tenantId } }),
    ]);

    expect(cfg?.moedaBase).toBe('MZN');
    expect(cfg?.timezone).toBe('Africa/Maputo');
    expect(cfg?.statusAtivo).toBe(true);
    expect(assinatura?.estado).toBe('TRIAL');
    expect(user?.emailVerificado).toBe(false);
    expect(contas).toBe(502); // 504 entradas no JSON, 2 duplicadas
    expect(series).toBeGreaterThan(15);
    expect(diarios).toBe(9);
    expect(notif?.estadoEnvio).toBe('PENDENTE');
    expect(tokenVerif).not.toBeNull();

    // Role ADMIN atribuído
    const roles = await prismaBase.userRole.findMany({
      where: { userId: user!.id },
      include: { role: { select: { nome: true } } },
    });
    expect(roles.map((r2) => r2.role.nome)).toContain('ADMIN');
  });

  it('o token de handoff funciona uma vez e falha na segunda', async () => {
    const r = await provisionarTenant({
      empresa: { nome: `${NOME_EMPRESA} B`, nuit: `4${String(Date.now()).slice(-8)}` },
      admin: { nome: 'Beto Teste', email: `b+${Date.now()}@teste-spec19.mz`, senha: 'segredo123' },
      planoId: 'BASICO',
      provincia: 'Sofala',
    });
    criados.push(r.tenantId);

    const primeira = await consumirToken(r.handoffToken);
    expect(primeira).toEqual({
      userId: r.userId,
      tenantId: r.tenantId,
      jti: expect.any(String),
    });

    const segunda = await consumirToken(r.handoffToken);
    expect(segunda).toBeNull();
  });

  it('a verificação de email desbloqueia o login e não repete', async () => {
    const r = await provisionarTenant({
      empresa: { nome: `${NOME_EMPRESA} C`, nuit: `4${String(Date.now() + 1).slice(-8)}` },
      admin: { nome: 'Carla Teste', email: `c+${Date.now()}@teste-spec19.mz`, senha: 'segredo123' },
      planoId: 'BASICO',
      provincia: 'Sofala',
    });
    criados.push(r.tenantId);

    const ok = await verificarEmail(r.tokenVerificacaoEmail);
    expect(ok?.tenantId).toBe(r.tenantId);

    const user = await prismaBase.user.findUnique({ where: { id: r.userId } });
    expect(user?.emailVerificado).toBe(true);

    // Segundo clique no mesmo link: não verifica de novo.
    expect(await verificarEmail(r.tokenVerificacaoEmail)).toBeNull();
  });

  it('recusa NUIT duplicado sem criar um segundo tenant', async () => {
    const antes = await prismaBase.tenant.count();
    await expect(
      provisionarTenant({
        empresa: { nome: 'Outra Empresa', nuit: NUIT },
        admin: { nome: 'X', email: `x+${Date.now()}@teste-spec19.mz`, senha: 'segredo123' },
        planoId: 'BASICO',
        provincia: 'Sofala',
      }),
    ).rejects.toMatchObject({ code: 'NUIT_JA_REGISTADO' });
    expect(await prismaBase.tenant.count()).toBe(antes);
  });
});
