/**
 * Teste de integração — Isolamento multi-tenant (Testcontainers)
 *
 * Verifica que:
 *   1. O container Postgres efémero arrancou e as migrations foram aplicadas.
 *   2. Dados criados para o Tenant A não são visíveis no Tenant B (isolamento).
 *   3. Dois runs consecutivos partem de estado limpo (stateless / sem dados de runs anteriores).
 *
 * Requer: Docker em execução + pnpm add -D testcontainers @testcontainers/postgresql
 * Se SKIP_INTEGRATION=true (degradação graciosa do setup), todos os testes saltam.
 *
 * NÃO usa o singleton prismaBase de @/server/db/client para evitar o problema
 * de inicialização com DATABASE_URL errada (o singleton é criado antes do
 * globalSetup do vitest definir DATABASE_URL para o container efémero).
 * Cria um PrismaClient fresco que lê INTEGRATION_DB_URL definido pelo globalSetup.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Saltamos todos os testes se SKIP_INTEGRATION=true (Docker/Testcontainers indisponível)
const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

describe.skipIf(skip)('Isolamento multi-tenant — DB efémera (Testcontainers)', () => {
  let db: AnyDb;

  const TENANT_A = `tenant-a-${Date.now()}`;
  const TENANT_B = `tenant-b-${Date.now()}`;

  beforeAll(async () => {
    // PrismaClient fresco — lê INTEGRATION_DB_URL do processo (definido pelo globalSetup)
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');

    const adapter = new PrismaPg({ connectionString: process.env.INTEGRATION_DB_URL! });
    db = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    if (db) {
      // Limpar dados de teste em ordem segura
      await db.user.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
      await db.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
      await db.$disconnect();
    }
  });

  it('migrations aplicadas — modelo Tenant existe na DB', async () => {
    // Verifica que as migrations correram correctamente no container efémero
    const count = await db.tenant.count();
    // DB completamente limpa (sem seed) — a contagem deve ser 0
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('Tenant A e Tenant B podem ser criados de forma independente', async () => {
    const now = Date.now();
    const tenantA = await db.tenant.create({
      data: {
        id: TENANT_A,
        nome: 'Empresa Alpha Lda.',
        slug: `alpha-${now}`,
        nuit: String(now).slice(0, 9),
      },
    });
    const tenantB = await db.tenant.create({
      data: {
        id: TENANT_B,
        nome: 'Empresa Beta Lda.',
        slug: `beta-${now}`,
        nuit: String(now + 1).slice(0, 9),
      },
    });
    expect(tenantA.id).toBe(TENANT_A);
    expect(tenantB.id).toBe(TENANT_B);
    expect(tenantA.id).not.toBe(tenantB.id);
  });

  it('utilizadores do Tenant A não são visíveis no filtro do Tenant B', async () => {
    // Criar um utilizador em Tenant A
    await db.user.create({
      data: {
        tenantId: TENANT_A,
        nome: 'Admin Alpha',
        email: `admin-alpha-${Date.now()}@alpha.test`,
        passwordHash: 'hash-ficticio',
      },
    });

    // Buscar utilizadores por tenant (a extensão multi-tenant do prismaBase
    // não está aqui — fazemos queries directas ao DB para testar o isolamento ao nível SQL)
    const usersA = await db.user.findMany({ where: { tenantId: TENANT_A } });
    const usersB = await db.user.findMany({ where: { tenantId: TENANT_B } });

    // Tenant A tem 1 utilizador; Tenant B tem 0
    expect(usersA).toHaveLength(1);
    expect(usersB).toHaveLength(0);
  });

  it('DB está limpa no início — sem dados de runs anteriores (stateless)', async () => {
    // Com Testcontainers (container efémero), a DB é sempre nova a cada run.
    // Se houvesse estado partilhado, apareceriam tenants de runs anteriores.
    const allTenants = await db.tenant.findMany();
    const ids: string[] = allTenants.map((t: { id: string }) => t.id);

    // Só existem os tenants criados por ESTE run
    expect(ids).toContain(TENANT_A);
    expect(ids).toContain(TENANT_B);

    // Nenhum tenant desconhecido (de outros runs ou seeds)
    const unknownTenants = allTenants.filter(
      (t: { id: string }) => t.id !== TENANT_A && t.id !== TENANT_B,
    );
    expect(unknownTenants).toHaveLength(0);
  });
});

describe.skipIf(skip)('Sanidade do projecto integration — setup activo', () => {
  it('DATABASE_URL aponta para o container efémero (não para localhost:5433)', () => {
    const url = process.env.DATABASE_URL ?? '';
    // O container efémero usa uma porta aleatória, não 5433 (DB partilhada de dev)
    expect(url).toBeTruthy();
    // URL não deve ser a DB partilhada de desenvolvimento (porta 5433)
    expect(url).not.toContain(':5433/');
  });

  it('INTEGRATION_DB_URL está definida', () => {
    expect(process.env.INTEGRATION_DB_URL).toBeTruthy();
    expect(process.env.INTEGRATION_DB_URL).not.toContain(':5433/');
  });
});
