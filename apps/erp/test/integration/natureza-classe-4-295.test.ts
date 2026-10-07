/**
 * Oráculo — issue #295: a classe 4 (Terceiros) tem natureza CONTA A CONTA, e os
 * tenants que já existem são corrigidos por uma migração de dados.
 *
 * Contra Postgres real (Testcontainers), com o `bootstrapContabilidade` real:
 *   (B) Um tenant novo nasce com 421, 44331, 431, 4622, 481, 492 CREDORA/PASSIVO e
 *       411, 429, 4432, 4512 DEVEDORA/ATIVO — e, em toda a classe 4, natureza e tipo
 *       batem com o JSON e com `derivarTipoConta`.
 *   (M) A migração `prisma/migrations/<ts>_natureza_classe_4/migration.sql`, corrida
 *       sobre um tenant ANTIGO (classe 4 forçada a DEVEDORA/ATIVO, como o seed antigo
 *       a deixava), põe cada conta da classe 4 com a natureza do JSON e o tipo PASSIVO
 *       nas CREDORA; não toca nas classes 1–3, 5–8; não toca numa conta da classe 4
 *       criada pelo utilizador fora do plano canónico; é idempotente.
 *
 * O container já aplicou TODAS as migrations antes de haver tenants (setup.ts), por
 * isso o efeito sobre um tenant existente prova-se reexecutando o SQL do ficheiro.
 * Um ficheiro em falta põe os casos (M) vermelhos com mensagem, não o ficheiro inteiro.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const MIGRATIONS = path.resolve(process.cwd(), 'prisma/migrations');

/** O SQL da migração `*_natureza_classe_4`, partido em instruções (sem comentários). */
function instrucoesDaMigracao(): string[] {
  const dirs = readdirSync(MIGRATIONS).filter((d) => d.endsWith('_natureza_classe_4'));
  expect(dirs, 'existe exactamente uma migração prisma/migrations/<ts>_natureza_classe_4').toHaveLength(1);
  const sql = readFileSync(path.join(MIGRATIONS, dirs[0]!, 'migration.sql'), 'utf8');
  const semComentarios = sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
  const instrucoes = semComentarios
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  expect(instrucoes.length, 'a migração tem pelo menos um UPDATE').toBeGreaterThan(0);
  return instrucoes;
}

type ContaJSON = { codigo: string; classe: number; natureza: string };

describe.skipIf(skip)('Natureza da classe 4 conta a conta (#295) — DB efémera (Testcontainers)', () => {
  let db: any;
  let derivarTipoConta: (classe: number, natureza: string) => string;
  let plano: ContaJSON[];

  const sufixo = Date.now();
  const NOVO = `tenant-nat295-novo-${sufixo}`;
  const ANTIGO = `tenant-nat295-antigo-${sufixo}`;
  const CODIGO_DO_UTILIZADOR = '42199';

  async function contas(tenantId: string) {
    return (await db.contaPGC.findMany({
      where: { tenantId },
      select: { codigo: true, classe: true, natureza: true, tipo: true },
    })) as Array<{ codigo: string; classe: string; natureza: string; tipo: string }>;
  }

  const naturezaJSON = () => {
    const m = new Map<string, string>();
    for (const c of plano) if (c.classe === 4 && !m.has(c.codigo)) m.set(c.codigo, c.natureza);
    return m;
  };

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    const bootstrap = await import('@/server/provisioning/tenant-bootstrap');
    derivarTipoConta = bootstrap.derivarTipoConta;
    plano = JSON.parse(readFileSync(path.resolve(process.cwd(), 'prisma/seed/data/plano-contas-pgc.json'), 'utf8'));

    for (const [id, n] of [
      [NOVO, 0],
      [ANTIGO, 1],
    ] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant natureza 295 ${n}`, slug: `nat295-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
      await db.$transaction((tx: any) => bootstrap.bootstrapContabilidade(tx, id), { timeout: 60_000 });
    }

    // Tenant ANTIGO: a classe 4 como o seed antigo a deixava (toda DEVEDORA ⇒ ATIVO).
    await db.contaPGC.updateMany({
      where: { tenantId: ANTIGO, classe: 'CLASSE_4' },
      data: { natureza: 'DEVEDORA', tipo: 'ATIVO' },
    });
    // Uma subconta criada pelo utilizador, fora do plano canónico: a migração é por código canónico.
    const mae = await db.contaPGC.findFirst({ where: { tenantId: ANTIGO, codigo: '421' } });
    await db.contaPGC.create({
      data: {
        tenantId: ANTIGO,
        codigo: CODIGO_DO_UTILIZADOR,
        nome: 'Fornecedor do utilizador #295',
        classe: 'CLASSE_4',
        tipo: 'ATIVO',
        natureza: 'DEVEDORA',
        nivel: 4,
        contaMaeId: mae.id,
      },
    });
  });

  it('(B) tenant novo: contas-chave da classe 4 com a natureza e o tipo certos', async () => {
    const porCodigo = new Map((await contas(NOVO)).map((c) => [c.codigo, c]));
    const esperado: Array<[string, string, string]> = [
      ['421', 'CREDORA', 'PASSIVO'],
      ['44331', 'CREDORA', 'PASSIVO'],
      ['431', 'CREDORA', 'PASSIVO'],
      ['4622', 'CREDORA', 'PASSIVO'],
      ['481', 'CREDORA', 'PASSIVO'],
      ['492', 'CREDORA', 'PASSIVO'],
      ['411', 'DEVEDORA', 'ATIVO'],
      ['429', 'DEVEDORA', 'ATIVO'],
      ['4432', 'DEVEDORA', 'ATIVO'],
      ['4512', 'DEVEDORA', 'ATIVO'],
    ];
    const observado = esperado.map(([codigo]) => [codigo, porCodigo.get(codigo)?.natureza, porCodigo.get(codigo)?.tipo]);
    expect(observado).toEqual(esperado);
  });

  it('(B) tenant novo: toda a classe 4 tem tipo = derivarTipoConta(4, natureza do JSON)', async () => {
    const nat = naturezaJSON();
    const divergentes = (await contas(NOVO))
      .filter((c) => c.classe === 'CLASSE_4')
      .filter((c) => c.natureza !== nat.get(c.codigo) || c.tipo !== derivarTipoConta(4, nat.get(c.codigo)!))
      .map((c) => `${c.codigo}:${c.natureza}/${c.tipo}`);
    expect(divergentes).toEqual([]);
  });

  it('(M) a migração corrige o tenant antigo para o JSON, só na classe 4 canónica, e é idempotente', async () => {
    const instrucoes = instrucoesDaMigracao();
    const antes = await contas(ANTIGO);

    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    const depois = await contas(ANTIGO);

    // 1. Classe 4 canónica = JSON (natureza) e tipo derivado.
    const nat = naturezaJSON();
    const divergentes = depois
      .filter((c) => c.classe === 'CLASSE_4' && nat.has(c.codigo))
      .filter((c) => c.natureza !== nat.get(c.codigo) || c.tipo !== derivarTipoConta(4, nat.get(c.codigo)!))
      .map((c) => `${c.codigo}:${c.natureza}/${c.tipo} (JSON ${nat.get(c.codigo)})`);
    expect(divergentes).toEqual([]);
    expect(depois.find((c) => c.codigo === '421')).toMatchObject({ natureza: 'CREDORA', tipo: 'PASSIVO' });
    expect(depois.find((c) => c.codigo === '44331')).toMatchObject({ natureza: 'CREDORA', tipo: 'PASSIVO' });
    expect(depois.find((c) => c.codigo === '411')).toMatchObject({ natureza: 'DEVEDORA', tipo: 'ATIVO' });

    // 2. Nada fora da classe 4 mudou; a conta do utilizador ficou como estava.
    const chave = (c: { codigo: string; natureza: string; tipo: string }) => `${c.codigo}:${c.natureza}/${c.tipo}`;
    const foraAntes = antes.filter((c) => c.classe !== 'CLASSE_4').map(chave).sort();
    const foraDepois = depois.filter((c) => c.classe !== 'CLASSE_4').map(chave).sort();
    expect(foraDepois).toEqual(foraAntes);
    expect(depois.find((c) => c.codigo === CODIGO_DO_UTILIZADOR)).toMatchObject({ natureza: 'DEVEDORA', tipo: 'ATIVO' });

    // 3. Idempotente: segunda corrida não muda nada.
    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    expect((await contas(ANTIGO)).map(chave).sort()).toEqual(depois.map(chave).sort());
  });

  it('(M) a migração não desfaz um tenant já correcto (o tenant novo fica igual)', async () => {
    const instrucoes = instrucoesDaMigracao();
    const chave = (c: { codigo: string; natureza: string; tipo: string }) => `${c.codigo}:${c.natureza}/${c.tipo}`;
    const antes = (await contas(NOVO)).map(chave).sort();
    for (const sql of instrucoes) await db.$executeRawUnsafe(sql);
    expect((await contas(NOVO)).map(chave).sort()).toEqual(antes);
  });
});
