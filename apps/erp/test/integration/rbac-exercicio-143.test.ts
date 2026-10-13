/**
 * Oráculo — issue #143: o FINANCEIRO passa a poder abrir o exercício contabilístico
 * (`financas:exercicio:abrir`), e os tenants que já existem são corrigidos por uma migração de
 * dados (o `pnpm db:seed` não chega a tenants de produção). Reabrir período continua só do ADMIN.
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contra Postgres real (Testcontainers), com o `bootstrapRbac` real:
 *   (B) Um tenant novo nasce com o FINANCEIRO de sistema COM `financas:exercicio:abrir`; o GESTOR,
 *       OPERADOR e LEITURA sem ela; `financas:periodo:reabrir` só no ADMIN.
 *   (M) A migração — o único `prisma/migrations/<ts>_<nome>/migration.sql` que menciona
 *       `financas:exercicio:abrir` E `'FINANCEIRO'` (a do #366 só fala do GESTOR) — corrida sobre
 *       um tenant ANTIGO (FINANCEIRO de sistema sem a permissão, como o seed antigo o deixava):
 *         - liga `financas:exercicio:abrir` ao FINANCEIRO de sistema e nada mais;
 *         - não toca nos outros papéis de sistema (o GESTOR continua sem ela);
 *         - não toca em papéis personalizados (`isSystem = false`), nem num personalizado
 *           que se chame «FINANCEIRO» noutro tenant (e não cria papéis de sistema onde não há);
 *         - não duplica nada e é idempotente; não mexe no catálogo global `Permission`.
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
const ABRIR = 'financas:exercicio:abrir';
const CODIGOS = [ABRIR];

/** O SQL da migração que liga a permissão ao FINANCEIRO, partido em instruções (sem comentários). */
function instrucoesDaMigracao(): string[] {
  const semComentarios = (sql: string) =>
    sql
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n');
  const dirs = readdirSync(MIGRATIONS).filter((d) => {
    const f = path.join(MIGRATIONS, d, 'migration.sql');
    if (!existsSync(f)) return false;
    const sql = semComentarios(readFileSync(f, 'utf8'));
    return sql.includes(ABRIR) && sql.includes("'FINANCEIRO'");
  });
  expect(
    dirs,
    `existe exactamente uma migração em prisma/migrations que menciona ${ABRIR} e 'FINANCEIRO'`,
  ).toHaveLength(1);
  const instrucoes = semComentarios(readFileSync(path.join(MIGRATIONS, dirs[0]!, 'migration.sql'), 'utf8'))
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  expect(instrucoes.length, 'a migração tem pelo menos uma instrução').toBeGreaterThan(0);
  return instrucoes;
}

describe.skipIf(skip)('#143 — FINANCEIRO abre exercício — DB efémera (Testcontainers)', () => {
  let db: any;
  let bootstrap: any;

  const sufixo = Date.now();
  const NOVO = `tenant-rbac143-novo-${sufixo}`;
  const ANTIGO = `tenant-rbac143-antigo-${sufixo}`;
  const PERSONALIZADO = `tenant-rbac143-pers-${sufixo}`;

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
        data: { id, nome: `Tenant rbac 143 ${n}`, slug: `rbac143-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
    }
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, NOVO), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, ANTIGO), { timeout: 60_000 });

    // Tenant ANTIGO: o FINANCEIRO de sistema como o seed antigo o deixava (sem abrir exercício),
    // e um papel personalizado do cliente sem ela (o cliente decide os seus papéis).
    await desligar(ANTIGO, 'FINANCEIRO', CODIGOS);
    await db.role.create({ data: { tenantId: ANTIGO, nome: 'Tesouraria', isSystem: false } });
    await ligar(ANTIGO, 'Tesouraria', 'financas:ver');

    // Tenant PERSONALIZADO: um papel do cliente que se chama «FINANCEIRO» mas não é de sistema.
    await db.role.create({ data: { tenantId: PERSONALIZADO, nome: 'FINANCEIRO', isSystem: false } });
    await ligar(PERSONALIZADO, 'FINANCEIRO', 'financas:ver');
  });

  it('(B) tenant novo: o FINANCEIRO de sistema nasce com abrir exercício; reabrir período só no ADMIN', async () => {
    const p = await papeis(NOVO);
    expect(p['FINANCEIRO']).toBeDefined();
    expect(p['FINANCEIRO'], 'FINANCEIRO tem financas:exercicio:abrir').toContain(ABRIR);
    expect(p['ADMIN'], 'ADMIN tem financas:exercicio:abrir').toContain(ABRIR);
    expect(p['GESTOR'], 'GESTOR não tem financas:exercicio:abrir (#366)').not.toContain(ABRIR);
    expect(p['OPERADOR'], 'OPERADOR não tem financas:exercicio:abrir').not.toContain(ABRIR);
    expect(p['LEITURA'], 'LEITURA não tem financas:exercicio:abrir').not.toContain(ABRIR);

    const comReabrir = Object.entries(p)
      .filter(([, codes]) => codes.includes('financas:periodo:reabrir'))
      .map(([nome]) => nome);
    expect(comReabrir, 'financas:periodo:reabrir só no ADMIN').toEqual(['ADMIN']);
  });

  it('(M) a migração liga abrir exercício só ao FINANCEIRO de sistema, e é idempotente', async () => {
    const instrucoes = instrucoesDaMigracao();
    const antes = await papeis(ANTIGO);
    const antesPers = await papeis(PERSONALIZADO);
    const catalogoAntes = (await db.permission.count()) as number;
    for (const code of CODIGOS) {
      expect(antes['FINANCEIRO'], `pré-condição: o tenant antigo não tem ${code} no FINANCEIRO`).not.toContain(code);
    }

    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    const depois = await papeis(ANTIGO);

    // 1. FINANCEIRO de sistema: ganhou abrir exercício e só ela.
    expect(depois['FINANCEIRO']).toEqual([...antes['FINANCEIRO']!, ...CODIGOS].sort());

    // 2. Todos os outros papéis do tenant (de sistema e personalizados) ficaram iguais.
    const semFinanceiro = (m: Record<string, string[]>) => {
      const { FINANCEIRO: _f, ...resto } = m;
      return resto;
    };
    expect(semFinanceiro(depois)).toEqual(semFinanceiro(antes));
    expect(depois['Tesouraria (personalizado)']).toEqual(['financas:ver']);
    for (const code of CODIGOS) {
      expect(depois['GESTOR']).not.toContain(code);
      expect(depois['OPERADOR']).not.toContain(code);
      expect(depois['LEITURA']).not.toContain(code);
    }

    // 3. Um papel personalizado chamado «FINANCEIRO» noutro tenant não é tocado, e não nasce
    //    nenhum papel de sistema onde não havia.
    expect(await papeis(PERSONALIZADO)).toEqual(antesPers);
    expect(Object.keys(await papeis(PERSONALIZADO))).toEqual(['FINANCEIRO (personalizado)']);

    // 4. O catálogo global fica intacto (a permissão já existe).
    expect(await db.permission.count()).toBe(catalogoAntes);

    // 5. Idempotente (sem duplicados nem erro de unicidade).
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
