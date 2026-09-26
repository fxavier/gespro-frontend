/**
 * Teste de integração — séries de documento (#149, ticket 4.4)
 *
 * Contra Postgres real (Testcontainers), prova o que o duplo em memória não pode:
 *   (a) o índice parcial `SerieDocumento_activa_unica` recusa uma segunda série
 *       activa por (tenantId, tipo, ano) — é a rede de S1 por baixo do serviço;
 *   (b) duas `criarSerie` concorrentes do mesmo tipo+ano (prefixos diferentes):
 *       exactamente uma passa e a outra falha com SERIE_ACTIVA_EXISTENTE — a
 *       tranca `pg_advisory_xact_lock` serializa-as e a segunda vê a primeira.
 *       Sem a tranca, ambas passariam a verificação e a segunda cairia no
 *       índice parcial como P2002 (⇒ SERIE_DUPLICADA ou erro cru): código errado.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// A sessão é fronteira, não domínio — o módulo de faturação importa-a.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

/** Ano civil corrente em Africa/Maputo (UTC+2, sem hora de Verão) — oráculo próprio. */
function anoCorrenteMaputo(): number {
  return new Date(Date.now() + 2 * 3_600_000).getUTCFullYear();
}

describe.skipIf(skip)('Séries de documento — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: typeof import('@/server/services/financas/faturacao.service');

  const sufixo = Date.now();
  const TENANT_A = `tenant-series-a-${sufixo}`;
  const TENANT_B = `tenant-series-b-${sufixo}`;
  const ANO = anoCorrenteMaputo();

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');

    await db.tenant.create({
      data: { id: TENANT_A, nome: 'Tenant Séries A', slug: `series-a-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.tenant.create({
      data: { id: TENANT_B, nome: 'Tenant Séries B', slug: `series-b-${sufixo}`, nuit: `${sufixo + 1}`.slice(-9) },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.serieDocumento.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await db.auditLog.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await db.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
  });

  // -------------------------------------------------------------------------
  // (a) índice parcial
  // -------------------------------------------------------------------------

  it('(a) o índice parcial recusa uma 2.ª activa por tenant+tipo+ano; inactiva e outro tenant passam', async () => {
    const base = { tipo: 'NOTA_DEBITO', ano: 2024 };
    await db.serieDocumento.create({ data: { ...base, tenantId: TENANT_A, prefixo: 'ND', ativo: true } });

    // Segunda activa, prefixo diferente (o @@unique com prefixo não a apanha): só o índice parcial.
    let erro: unknown;
    try {
      await db.serieDocumento.create({ data: { ...base, tenantId: TENANT_A, prefixo: 'ND2', ativo: true } });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeDefined();
    expect((erro as { code?: string }).code).toBe('P2002');

    // Inactiva no mesmo tipo+ano: permitida.
    await db.serieDocumento.create({ data: { ...base, tenantId: TENANT_A, prefixo: 'ND3', ativo: false } });
    // Activa no mesmo tipo+ano noutro tenant: permitida.
    await db.serieDocumento.create({ data: { ...base, tenantId: TENANT_B, prefixo: 'ND', ativo: true } });

    // Reactivar a inactiva com outra activa: o índice recusa também no UPDATE.
    let erroUpdate: unknown;
    try {
      await db.serieDocumento.updateMany({
        where: { tenantId: TENANT_A, tipo: 'NOTA_DEBITO', ano: 2024, prefixo: 'ND3' },
        data: { ativo: true },
      });
    } catch (e) {
      erroUpdate = e;
    }
    expect(erroUpdate).toBeDefined();

    const activas = await db.serieDocumento.count({
      where: { tenantId: TENANT_A, tipo: 'NOTA_DEBITO', ano: 2024, ativo: true },
    });
    expect(activas).toBe(1);
  });

  // -------------------------------------------------------------------------
  // (b) concorrência no serviço
  // -------------------------------------------------------------------------

  it('(b) duas criarSerie concorrentes do mesmo tipo+ano: exactamente uma passa, a outra SERIE_ACTIVA_EXISTENTE', async () => {
    const ctx = { tenantId: TENANT_A, userId: `user-series-${sufixo}` };
    const criar = (prefixo: string) =>
      runCtx(ctx, () => fat.criarSerie({ tipo: 'PROFORMA', prefixo, ano: ANO, numeroInicial: 1 }, ctx));

    const resultados = await Promise.allSettled([criar('PRA'), criar('PRB')]);

    const cumpridas = resultados.filter((r) => r.status === 'fulfilled');
    const rejeitadas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(cumpridas).toHaveLength(1);
    expect(rejeitadas).toHaveLength(1);
    expect((rejeitadas[0].reason as { code?: string }).code).toBe('SERIE_ACTIVA_EXISTENTE');

    const linhas = await db.serieDocumento.findMany({
      where: { tenantId: TENANT_A, tipo: 'PROFORMA', ano: ANO },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ ativo: true, numeroInicial: 1, proximoNumero: 1, formatoNumero: '{prefixo}/{ano}/{numero:06}' });
  });
});
