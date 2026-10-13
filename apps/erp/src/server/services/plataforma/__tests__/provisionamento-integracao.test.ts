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

import { Prisma } from '@prisma/client';
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
  // DFC (migração 22b): o mapeamento referencia ContaPGC e RubricaFluxoCaixa com
  // FK RESTRICT — sai antes das contas, e a rubrica depois do mapeamento.
  await prismaBase.mapeamentoContaFluxo.deleteMany({ where: { tenantId } });
  await prismaBase.versaoMapeamentoFluxo.deleteMany({ where: { tenantId } });
  await prismaBase.rubricaFluxoCaixa.deleteMany({ where: { tenantId } });
  // Resto do bootstrapContabilidade (#330): Consumidor Final (ADR-0041), regras de
  // sugestão e naturezas da nota de débito — as duas últimas referenciam ContaPGC.
  await prismaBase.cliente.deleteMany({ where: { tenantId } });
  await prismaBase.regraSugestaoLancamento.deleteMany({ where: { tenantId } });
  await prismaBase.contaNaturezaNotaDebito.deleteMany({ where: { tenantId } });
  // ContaPGC é auto-referenciada (contaMaeId) e o plano vai ao nível 7: folhas
  // primeiro, do nível mais fundo para cima (molde: venda-integracao.test.ts).
  const niveis = await prismaBase.contaPGC.findMany({
    where: { tenantId },
    distinct: ['nivel'],
    select: { nivel: true },
  });
  for (const nivel of niveis.map((n) => n.nivel).sort((a, b) => b - a)) {
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

// #330: todos os modelos com `tenantId`, derivados do schema — o mesmo critério da
// tenant-extension. Um modelo novo que o bootstrap passe a criar entra aqui
// sozinho, e o teste de resíduo acusa-o se `limpar` o esquecer.
const MODELOS_COM_TENANT = Prisma.dmmf.datamodel.models
  .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
  .map((m) => m.name);

async function residuoDoTenant(tenantId: string): Promise<Record<string, number>> {
  const sobras: Record<string, number> = {};
  for (const modelo of MODELOS_COM_TENANT) {
    const delegate = (prismaBase as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[
      modelo.charAt(0).toLowerCase() + modelo.slice(1)
    ];
    const n = await delegate.count({ where: { tenantId } });
    if (n > 0) sobras[modelo] = n;
  }
  const tenant = await prismaBase.tenant.count({ where: { id: tenantId } });
  if (tenant > 0) sobras.Tenant = tenant;
  return sobras;
}

// Rede de segurança para quando o caso de resíduo não chega a correr (falha a
// meio do primeiro caso). Sem `.catch`: uma limpeza que falhe tem de se ver (#330).
afterAll(async () => {
  for (const tenantId of criados.splice(0)) {
    await limpar(tenantId);
  }
});

describe.skipIf(!temDB)('provisionamento — integração com Postgres', () => {
  // Contagem antes/depois com âmbito neste ficheiro: a base local é partilhada
  // por outros processos, por isso um `tenant.count()` global seria instável.
  const DESTE_TESTE = { slug: { startsWith: 'teste-spec19-' }, nome: NOME_EMPRESA };
  let tenantsAntes = -1;
  it('regista a contagem da base antes de provisionar (#330)', async () => {
    tenantsAntes = await prismaBase.tenant.count({ where: DESTE_TESTE });
    expect(tenantsAntes).toBe(0);
  });

  // O bootstrap do PGC (503 contas + diários + séries) demora mais do que os
  // 5 s por omissão numa DB partilhada — timeout explícito, não sintoma.
  it('cria o tenant completo numa única transacção, Keycloak primeiro', { timeout: 90_000 }, async () => {
    const r = await provisionarTenant({
      empresa: { nome: NOME_EMPRESA, nuit: NUIT },
      admin: { nome: 'Ana Teste', email: EMAIL },
      planoId: 'PROFISSIONAL',
      provincia: 'Maputo Cidade',
    });
    criados.push(r.tenantId);
    expect(await prismaBase.tenant.count({ where: DESTE_TESTE })).toBe(tenantsAntes + 1);

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
    expect(contas).toBe(503); // 505 entradas no JSON, 2 duplicadas
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

  // #330 — corre por último (os casos de um ficheiro são sequenciais). Prova que
  // a limpeza apaga TUDO o que o provisionamento criou: o tenant e cada linha com
  // o seu tenantId (o plano PGC vai ao nível 7), e que a base volta às contagens
  // de antes. Sem `.catch`: se a limpeza rebentar, o caso falha.
  it('limpar() não deixa resíduo: tenant e dados apagados, contagens de antes (#330)', { timeout: 60_000 }, async () => {
    expect(criados).toHaveLength(1);
    const tenantId = criados[0];
    await limpar(tenantId);
    criados.splice(0);

    expect(await residuoDoTenant(tenantId)).toEqual({});
    expect(await prismaBase.tenant.count({ where: DESTE_TESTE })).toBe(tenantsAntes);
  });
});
