/**
 * Oráculo — issue #124: `inventario:admin` sai do OPERADOR e entra no GESTOR; o OPERADOR
 * ganha `ativos:write`. Os tenants que já existem são corrigidos por uma migração de dados
 * (o `pnpm db:seed` só acrescenta, e não chega a tenants de produção).
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contra Postgres real (Testcontainers), com o `bootstrapRbac` real:
 *   (B) Um tenant novo nasce com: OPERADOR sem `inventario:admin` e com `ativos:write`;
 *       GESTOR com `inventario:admin`; ADMIN com as duas.
 *   (M) A migração — o único `prisma/migrations/<ts>_<nome>/migration.sql` que menciona
 *       `inventario:admin` — corrida sobre um tenant ANTIGO (como o seed antigo o deixava:
 *       OPERADOR com `inventario:admin` e sem `ativos:write`; GESTOR sem `inventario:admin`):
 *         - OPERADOR de sistema: perde `inventario:admin`, ganha `ativos:write`, e nada mais;
 *         - GESTOR de sistema: ganha `inventario:admin`, e nada mais;
 *         - ADMIN, FINANCEIRO e LEITURA de sistema ficam iguais;
 *         - papéis personalizados (`isSystem = false`) não são tocados — nem os que se chamam
 *           «OPERADOR»/«GESTOR» noutro tenant (e não nascem papéis de sistema onde não há);
 *         - é idempotente e não mexe no catálogo global `Permission`.
 *
 * O container já aplicou TODAS as migrations antes de haver tenants (setup.ts), por isso o
 * efeito sobre um tenant existente prova-se reexecutando o SQL do ficheiro. Uma migração em
 * falta põe os casos (M) vermelhos com mensagem, não o ficheiro inteiro.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

const MIGRATIONS = path.resolve(process.cwd(), 'prisma/migrations');
const MARCADOR = 'inventario:admin';
const INV_ADMIN = 'inventario:admin';
const ATIVOS_WRITE = 'ativos:write';

/** O SQL da migração de #124, partido em instruções (sem comentários). */
function instrucoesDaMigracao(): string[] {
  const dirs = readdirSync(MIGRATIONS).filter((d) => {
    const f = path.join(MIGRATIONS, d, 'migration.sql');
    return existsSync(f) && readFileSync(f, 'utf8').includes(MARCADOR);
  });
  expect(dirs, `existe exactamente uma migração em prisma/migrations que menciona ${MARCADOR}`).toHaveLength(1);
  const sql = readFileSync(path.join(MIGRATIONS, dirs[0]!, 'migration.sql'), 'utf8');
  expect(sql, 'a migração trata também ativos:write').toContain(ATIVOS_WRITE);
  const instrucoes = sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  expect(instrucoes.length, 'a migração tem pelo menos uma instrução').toBeGreaterThan(0);
  return instrucoes;
}

describe.skipIf(skip)('#124 — RBAC de inventário/activos — DB efémera (Testcontainers)', () => {
  let db: any;
  let bootstrap: any;

  const sufixo = Date.now();
  const NOVO = `tenant-rbi124-novo-${sufixo}`;
  const ANTIGO = `tenant-rbi124-antigo-${sufixo}`;
  const PERSONALIZADO = `tenant-rbi124-pers-${sufixo}`;

  /** Mapa `nomeDoPapel → códigos ordenados` de um tenant (marca os personalizados). */
  async function papeis(tenantId: string): Promise<Record<string, string[]>> {
    const roles = (await db.role.findMany({
      where: { tenantId },
      select: { nome: true, isSystem: true, permissions: { select: { permission: { select: { code: true } } } } },
    })) as Array<{ nome: string; isSystem: boolean; permissions: Array<{ permission: { code: string } }> }>;
    const out: Record<string, string[]> = {};
    for (const r of roles) {
      out[`${r.nome}${r.isSystem ? '' : ' (personalizado)'}`] = r.permissions.map((p) => p.permission.code).sort();
    }
    return out;
  }

  async function desligar(tenantId: string, nome: string, codes: string[]) {
    const role = await db.role.findFirst({ where: { tenantId, nome } });
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permission: { code: { in: codes } } },
    });
  }

  async function ligar(tenantId: string, nome: string, code: string) {
    const role = await db.role.findFirst({ where: { tenantId, nome } });
    const perm = await db.permission.findUnique({ where: { code } });
    await db.rolePermission.createMany({ data: [{ roleId: role.id, permissionId: perm.id }], skipDuplicates: true });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    bootstrap = await import('@/server/provisioning/tenant-bootstrap');
    await bootstrap.garantirCatalogoPermissoes(db);

    for (const [id, n] of [
      [NOVO, 0],
      [ANTIGO, 1],
      [PERSONALIZADO, 2],
    ] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant rbi 124 ${n}`, slug: `rbi124-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
    }
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, NOVO), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, ANTIGO), { timeout: 60_000 });

    // Tenant ANTIGO: como o seed antigo o deixava.
    await ligar(ANTIGO, 'OPERADOR', INV_ADMIN);
    await desligar(ANTIGO, 'OPERADOR', [ATIVOS_WRITE]);
    await desligar(ANTIGO, 'GESTOR', [INV_ADMIN]);
    // …e um papel personalizado do cliente com inventario:admin (o cliente decide os seus papéis).
    await db.role.create({ data: { tenantId: ANTIGO, nome: 'Armazém', isSystem: false } });
    await ligar(ANTIGO, 'Armazém', INV_ADMIN);

    // Tenant PERSONALIZADO: papéis do cliente com os nomes dos de sistema, mas não de sistema.
    await db.role.create({ data: { tenantId: PERSONALIZADO, nome: 'OPERADOR', isSystem: false } });
    await ligar(PERSONALIZADO, 'OPERADOR', INV_ADMIN);
    await db.role.create({ data: { tenantId: PERSONALIZADO, nome: 'GESTOR', isSystem: false } });
    await ligar(PERSONALIZADO, 'GESTOR', 'inventario:ver');
  });

  it('(B) tenant novo: OPERADOR sem inventario:admin e com ativos:write; GESTOR com inventario:admin', async () => {
    const p = await papeis(NOVO);
    expect(p['OPERADOR']).toBeDefined();
    expect(p['OPERADOR'], 'OPERADOR não tem inventario:admin').not.toContain(INV_ADMIN);
    expect(p['OPERADOR'], 'OPERADOR tem ativos:write').toContain(ATIVOS_WRITE);
    expect(p['GESTOR'], 'GESTOR tem inventario:admin').toContain(INV_ADMIN);
    expect(p['GESTOR'], 'GESTOR tem ativos:write').toContain(ATIVOS_WRITE);
    expect(p['ADMIN']).toEqual(expect.arrayContaining([INV_ADMIN, ATIVOS_WRITE]));
    for (const papel of ['FINANCEIRO', 'LEITURA']) {
      expect(p[papel], `${papel} não tem inventario:admin`).not.toContain(INV_ADMIN);
      expect(p[papel], `${papel} não tem ativos:write`).not.toContain(ATIVOS_WRITE);
    }
  });

  it('(M) a migração corrige só OPERADOR e GESTOR de sistema, e é idempotente', async () => {
    const instrucoes = instrucoesDaMigracao();
    const antes = await papeis(ANTIGO);
    const antesPers = await papeis(PERSONALIZADO);
    const catalogoAntes = (await db.permission.count()) as number;
    expect(antes['OPERADOR'], 'pré-condição: OPERADOR antigo com inventario:admin').toContain(INV_ADMIN);
    expect(antes['OPERADOR'], 'pré-condição: OPERADOR antigo sem ativos:write').not.toContain(ATIVOS_WRITE);
    expect(antes['GESTOR'], 'pré-condição: GESTOR antigo sem inventario:admin').not.toContain(INV_ADMIN);

    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    const depois = await papeis(ANTIGO);

    // 1. OPERADOR de sistema: −inventario:admin, +ativos:write, e só isso.
    expect(depois['OPERADOR']).toEqual(
      [...antes['OPERADOR']!.filter((c) => c !== INV_ADMIN), ATIVOS_WRITE].sort(),
    );
    // 2. GESTOR de sistema: +inventario:admin, e só isso.
    expect(depois['GESTOR']).toEqual([...antes['GESTOR']!, INV_ADMIN].sort());

    // 3. Os outros papéis do tenant (de sistema e personalizados) ficaram iguais.
    const semOsDois = (m: Record<string, string[]>) => {
      const { OPERADOR: _o, GESTOR: _g, ...resto } = m;
      return resto;
    };
    expect(semOsDois(depois)).toEqual(semOsDois(antes));
    expect(depois['Armazém (personalizado)']).toEqual([INV_ADMIN]);

    // 4. Papéis personalizados chamados «OPERADOR»/«GESTOR» noutro tenant não são tocados, e
    //    não nasce nenhum papel de sistema onde não havia.
    expect(await papeis(PERSONALIZADO)).toEqual(antesPers);
    expect(Object.keys(await papeis(PERSONALIZADO)).sort()).toEqual(
      ['GESTOR (personalizado)', 'OPERADOR (personalizado)'],
    );

    // 5. O catálogo global fica intacto.
    expect(await db.permission.count()).toBe(catalogoAntes);

    // 6. Idempotente (sem duplicados nem erro de unicidade).
    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    expect(await papeis(ANTIGO)).toEqual(depois);
  });

  it('(M) a migração não altera um tenant já correcto (o tenant novo fica igual)', async () => {
    const instrucoes = instrucoesDaMigracao();
    const antes = await papeis(NOVO);
    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    expect(await papeis(NOVO)).toEqual(antes);
  });
});
