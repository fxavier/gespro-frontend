/**
 * Oráculo — issue #113: o FINANCEIRO passa a registar pagamentos a fornecedores e a gerir
 * contas a pagar, e os tenants que já existem são corrigidos por uma migração de dados
 * (o `pnpm db:seed` não chega a tenants de produção).
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contra Postgres real (Testcontainers), com o `bootstrapRbac` real:
 *   (B) Um tenant novo nasce com o papel de sistema FINANCEIRO COM as três permissões
 *       (`compras:pagamento:registar`, `compras:conta-pagar:criar`, `compras:conta-pagar:cancelar`).
 *   (M) A migração — o único `prisma/migrations/<ts>_<nome>/migration.sql` que menciona
 *       `compras:pagamento:registar` — corrida sobre um tenant ANTIGO (FINANCEIRO de sistema
 *       sem as três, como o seed antigo o deixava):
 *         - liga as três ao FINANCEIRO de sistema e nada mais;
 *         - não toca nos outros papéis de sistema (ADMIN, GESTOR, OPERADOR, LEITURA);
 *         - não toca em papéis personalizados (`isSystem = false`), nem num personalizado
 *           que se chame «FINANCEIRO» noutro tenant (e não cria papéis de sistema onde não há);
 *         - não duplica nada (ON CONFLICT DO NOTHING) e é idempotente;
 *         - não mexe no catálogo global `Permission` (as três já lá estão).
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
const MARCADOR = 'compras:pagamento:registar';
const CONTAS_PAGAR = [
  'compras:conta-pagar:cancelar',
  'compras:conta-pagar:criar',
  'compras:pagamento:registar',
];

/** O SQL da migração que liga as permissões ao FINANCEIRO, partido em instruções (sem comentários). */
function instrucoesDaMigracao(): string[] {
  const dirs = readdirSync(MIGRATIONS).filter((d) => {
    const f = path.join(MIGRATIONS, d, 'migration.sql');
    return existsSync(f) && readFileSync(f, 'utf8').includes(MARCADOR);
  });
  expect(dirs, `existe exactamente uma migração em prisma/migrations que menciona ${MARCADOR}`).toHaveLength(1);
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

describe.skipIf(skip)('#113 — FINANCEIRO gere contas a pagar — DB efémera (Testcontainers)', () => {
  let db: any;
  let bootstrap: any;

  const sufixo = Date.now();
  const NOVO = `tenant-fcp113-novo-${sufixo}`;
  const ANTIGO = `tenant-fcp113-antigo-${sufixo}`;
  const PERSONALIZADO = `tenant-fcp113-pers-${sufixo}`;

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
        data: { id, nome: `Tenant fcp 113 ${n}`, slug: `fcp113-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
    }
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, NOVO), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrap.bootstrapRbac(tx, ANTIGO), { timeout: 60_000 });

    // Tenant ANTIGO: o FINANCEIRO de sistema como o seed antigo o deixava (sem as três),
    // e um papel personalizado do cliente sem elas (o cliente decide os seus papéis).
    await desligar(ANTIGO, 'FINANCEIRO', CONTAS_PAGAR);
    await db.role.create({ data: { tenantId: ANTIGO, nome: 'Tesouraria', isSystem: false } });
    await ligar(ANTIGO, 'Tesouraria', 'compras:ver');

    // Tenant PERSONALIZADO: um papel do cliente que se chama «FINANCEIRO» mas não é de sistema.
    await db.role.create({ data: { tenantId: PERSONALIZADO, nome: 'FINANCEIRO', isSystem: false } });
    await ligar(PERSONALIZADO, 'FINANCEIRO', 'compras:ver');
  });

  it('(B) tenant novo: o FINANCEIRO de sistema nasce com as três; OPERADOR e LEITURA sem elas', async () => {
    const p = await papeis(NOVO);
    expect(p['FINANCEIRO']).toBeDefined();
    for (const code of CONTAS_PAGAR) {
      expect(p['FINANCEIRO'], `FINANCEIRO tem ${code}`).toContain(code);
      expect(p['ADMIN'], `ADMIN tem ${code}`).toContain(code);
      expect(p['GESTOR'], `GESTOR tem ${code}`).toContain(code);
      expect(p['OPERADOR'], `OPERADOR não tem ${code}`).not.toContain(code);
      expect(p['LEITURA'], `LEITURA não tem ${code}`).not.toContain(code);
    }
  });

  it('(M) a migração liga as três só ao FINANCEIRO de sistema, e é idempotente', async () => {
    const instrucoes = instrucoesDaMigracao();
    const antes = await papeis(ANTIGO);
    const antesPers = await papeis(PERSONALIZADO);
    const catalogoAntes = (await db.permission.count()) as number;
    for (const code of CONTAS_PAGAR) {
      expect(antes['FINANCEIRO'], `pré-condição: o tenant antigo não tem ${code} no FINANCEIRO`).not.toContain(code);
    }

    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    const depois = await papeis(ANTIGO);

    // 1. FINANCEIRO de sistema: ganhou as três e só elas.
    expect(depois['FINANCEIRO']).toEqual([...antes['FINANCEIRO']!, ...CONTAS_PAGAR].sort());

    // 2. Todos os outros papéis do tenant (de sistema e personalizados) ficaram iguais.
    const semFinanceiro = (m: Record<string, string[]>) => {
      const { FINANCEIRO: _f, ...resto } = m;
      return resto;
    };
    expect(semFinanceiro(depois)).toEqual(semFinanceiro(antes));
    expect(depois['Tesouraria (personalizado)']).toEqual(['compras:ver']);
    for (const code of CONTAS_PAGAR) {
      expect(depois['OPERADOR']).not.toContain(code);
      expect(depois['LEITURA']).not.toContain(code);
    }

    // 3. Um papel personalizado chamado «FINANCEIRO» noutro tenant não é tocado, e não nasce
    //    nenhum papel de sistema onde não havia.
    expect(await papeis(PERSONALIZADO)).toEqual(antesPers);
    expect(Object.keys(await papeis(PERSONALIZADO))).toEqual(['FINANCEIRO (personalizado)']);

    // 4. O catálogo global fica intacto.
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
