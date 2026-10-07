/**
 * Oráculo — issue #299: o OPERADOR deixa de exportar mapas financeiros, e os tenants que já
 * existem são corrigidos por uma migração de dados (o `pnpm db:seed` é aditivo, não retira).
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contra Postgres real (Testcontainers), com o `bootstrapRbac` real:
 *   (B) Um tenant novo nasce com o papel de sistema OPERADOR SEM `financas:exportar`
 *       (e o LEITURA continua com ela).
 *   (M) A migração — o único `prisma/migrations/<ts>_<nome>/migration.sql` que menciona
 *       `financas:exportar` — corrida sobre um tenant ANTIGO (OPERADOR de sistema com
 *       `financas:exportar`, como o seed antigo o deixava):
 *         - retira `financas:exportar` ao OPERADOR de sistema e nada mais;
 *         - não toca nos outros papéis de sistema (LEITURA, FINANCEIRO, GESTOR, ADMIN);
 *         - não toca em papéis personalizados (`isSystem = false`), nem num personalizado
 *           que se chame «OPERADOR» noutro tenant;
 *         - não toca no catálogo global `Permission`;
 *         - é idempotente.
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
const EXPORTAR = 'financas:exportar';

/** O SQL da migração que retira `financas:exportar`, partido em instruções (sem comentários). */
function instrucoesDaMigracao(): string[] {
  const dirs = readdirSync(MIGRATIONS).filter((d) => {
    const f = path.join(MIGRATIONS, d, 'migration.sql');
    return existsSync(f) && readFileSync(f, 'utf8').includes(EXPORTAR);
  });
  expect(dirs, 'existe exactamente uma migração em prisma/migrations que menciona financas:exportar').toHaveLength(1);
  const sql = readFileSync(path.join(MIGRATIONS, dirs[0]!, 'migration.sql'), 'utf8');
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

describe.skipIf(skip)('#299 — OPERADOR sem financas:exportar — DB efémera (Testcontainers)', () => {
  let db: any;
  let bootstrap: any;

  const sufixo = Date.now();
  const NOVO = `tenant-opx299-novo-${sufixo}`;
  const ANTIGO = `tenant-opx299-antigo-${sufixo}`;
  const PERSONALIZADO = `tenant-opx299-pers-${sufixo}`;

  /** Mapa `nomeDoPapel → códigos ordenados` de um tenant (inclui isSystem na chave). */
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
        data: { id, nome: `Tenant opx 299 ${n}`, slug: `opx299-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
    }
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, NOVO), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, ANTIGO), { timeout: 60_000 });

    // Tenant ANTIGO: o OPERADOR de sistema como o seed antigo o deixava (com financas:exportar),
    // e um papel personalizado do cliente que também a tem.
    await ligar(ANTIGO, 'OPERADOR', EXPORTAR);
    await db.role.create({ data: { tenantId: ANTIGO, nome: 'Operador de loja', isSystem: false } });
    await ligar(ANTIGO, 'Operador de loja', EXPORTAR);
    await ligar(ANTIGO, 'Operador de loja', 'inventario:exportar');

    // Tenant PERSONALIZADO: um papel do cliente que se chama «OPERADOR» mas não é de sistema.
    await db.role.create({ data: { tenantId: PERSONALIZADO, nome: 'OPERADOR', isSystem: false } });
    await ligar(PERSONALIZADO, 'OPERADOR', EXPORTAR);
  });

  it('(B) tenant novo: o OPERADOR de sistema nasce sem financas:exportar; o LEITURA tem-na', async () => {
    const p = await papeis(NOVO);
    expect(p['OPERADOR']).toBeDefined();
    expect(p['OPERADOR']).not.toContain(EXPORTAR);
    expect(p['LEITURA']).toContain(EXPORTAR);
    expect(p['FINANCEIRO']).toContain(EXPORTAR);
  });

  it('(M) a migração retira financas:exportar só ao OPERADOR de sistema, e é idempotente', async () => {
    const instrucoes = instrucoesDaMigracao();
    const antes = await papeis(ANTIGO);
    const antesPers = await papeis(PERSONALIZADO);
    const catalogoAntes = (await db.permission.count()) as number;
    expect(antes['OPERADOR'], 'pré-condição: o tenant antigo tem a permissão no OPERADOR').toContain(EXPORTAR);

    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    const depois = await papeis(ANTIGO);

    // 1. OPERADOR de sistema: perdeu financas:exportar e só ela.
    expect(depois['OPERADOR']).not.toContain(EXPORTAR);
    expect(depois['OPERADOR']).toEqual(antes['OPERADOR']!.filter((c) => c !== EXPORTAR));

    // 2. Todos os outros papéis do tenant (de sistema e personalizados) ficaram iguais.
    const semOperador = (m: Record<string, string[]>) => {
      const { OPERADOR: _o, ...resto } = m;
      return resto;
    };
    expect(semOperador(depois)).toEqual(semOperador(antes));
    expect(depois['Operador de loja (personalizado)']).toContain(EXPORTAR);
    expect(depois['LEITURA']).toContain(EXPORTAR);

    // 3. Um papel personalizado chamado «OPERADOR» noutro tenant não é tocado.
    expect(await papeis(PERSONALIZADO)).toEqual(antesPers);
    expect((await papeis(PERSONALIZADO))['OPERADOR (personalizado)']).toContain(EXPORTAR);

    // 4. O catálogo global fica intacto (a permissão continua a existir para os outros papéis).
    expect(await db.permission.count()).toBe(catalogoAntes);
    expect(await db.permission.findUnique({ where: { code: EXPORTAR } })).not.toBeNull();

    // 5. Idempotente.
    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    expect(await papeis(ANTIGO)).toEqual(depois);
  });

  it('(M) a migração não desfaz um tenant já correcto (o tenant novo fica igual)', async () => {
    const instrucoes = instrucoesDaMigracao();
    const antes = await papeis(NOVO);
    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    expect(await papeis(NOVO)).toEqual(antes);
  });
});
