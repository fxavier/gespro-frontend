/**
 * ORÁCULO — issue #534 (nó E:planos-reparos-form, ADR-0049 §4–§5): `PRICE_ID_DUPLICADO` diz QUAL
 * campo colide, e `AuditoriaPlataforma.acao` passa de texto a enum Prisma sem perda de dados.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de implementação
 * que altere este ficheiro é BLOCKER.
 *
 * Contrato:
 *
 *   P1 `plano-admin.service` (criarPlano / actualizarPlano) recusa um Price já usado com
 *      BusinessRuleError('PRICE_ID_DUPLICADO') (409) e `details: { campo }`, onde `campo` é o campo
 *      DO PEDIDO cujo Price colide: 'stripePriceIdMensal' | 'stripePriceIdAnual'.
 *      Decisões do VERIFICADOR (o modelo recusa o mesmo Price em qualquer coluna de outro plano —
 *      «um Price pertence a um plano e a um ciclo», já trancado pelo oráculo do #526):
 *        - colisão cruzada (o mensal do pedido é o anual de outro plano, e vice-versa) é recusada
 *          e aponta o campo DO PEDIDO (mensal → 'stripePriceIdMensal');
 *        - o mesmo Price nos dois ciclos do mesmo pedido aponta o ANUAL (é o segundo, o que repete);
 *        - um ciclo livre e o outro a colidir aponta o que colide, nunca «o primeiro preenchido».
 *   P2 O mesmo vale quando a colisão só é apanhada pela base: uma escrita concorrente grava o
 *      Price entre a verificação e o INSERT, o `@unique` da coluna rebenta (P2002) e o serviço
 *      traduz pelo alvo da violação (meta.target / constraint) para o campo certo. Só há P2002
 *      para colisões na MESMA coluna (o `@unique` é por coluna); as cruzadas são do P1.
 *   A1 `AuditoriaPlataforma.acao` é um enum Postgres `AcaoAuditoriaPlataforma` com exactamente
 *      CRIAR, ACTUALIZAR, ARQUIVAR, DESARQUIVAR, APAGAR (os literais que já se gravam); o client
 *      exporta o enum; os 5 valores gravam-se e lêem-se iguais; um valor fora do enum é recusado
 *      pela base (SQL cru) e pelo client.
 *   A2 A migração que faz a troca é nova (posterior a 20261013160000), escrita à mão sem perda:
 *      CREATE TYPE + ALTER COLUMN "acao" TYPE … USING, sem DROP da coluna/tabela. Prova real: a
 *      migração corre num schema descartável sobre a tabela no estado anterior com linhas dos 5
 *      valores, e as linhas sobrevivem com o mesmo valor, agora do tipo enum.
 *
 * Códigos de plano `TPRF_*`; linhas de trilho com `codigo` `TPRF_*`.
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * ESTADO ESPERADO antes da implementação: RED.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: { id: 'caller', tenantId: 'x', permissions: [], emailVerificado: true },
  })),
}));

const SUB = 'kc-sub-plataforma-534';
const ACOES = ['CRIAR', 'ACTUALIZAR', 'ARQUIVAR', 'DESARQUIVAR', 'APAGAR'] as const;
const MIGRACOES = path.resolve(__dirname, '../../prisma/migrations');

/** A(s) migração(ões) que criam o tipo enum da acção. */
function migracoesDoEnum(): Array<{ nome: string; sql: string }> {
  return readdirSync(MIGRACOES)
    .filter((d) => existsSync(path.join(MIGRACOES, d, 'migration.sql')))
    .map((d) => ({ nome: d, sql: readFileSync(path.join(MIGRACOES, d, 'migration.sql'), 'utf8') }))
    .filter((m) => /CREATE\s+TYPE\s+("public"\.)?"AcaoAuditoriaPlataforma"/i.test(m.sql));
}

describe.skipIf(skip)('#534 — Price ID duplicado por campo e acção de auditoria como enum — DB efémera', () => {
  let db: any;
  const sufixo = Date.now();
  const s6 = `${sufixo}`.slice(-6);
  let seq = 0;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.auditoriaPlataforma.deleteMany({ where: { codigo: { startsWith: 'TPRF_' } } });
      await db.plano.deleteMany({ where: { codigo: { startsWith: 'TPRF_' } } });
    } catch {
      // limpeza de melhor esforço
    }
    await db.$disconnect();
  });

  // ─── utilitários ────────────────────────────────────────────────────────────

  type Svc = {
    criar: (input: any, ctx: any) => Promise<any>;
    actualizar: (id: string, input: any, ctx: any) => Promise<any>;
  };

  /** Import dinâmico com caminho em variável: na fase vermelha falha o caso, não o ficheiro. */
  async function svc(): Promise<Svc> {
    const caminho: string = '@/server/services/plataforma/plano-admin.service';
    const mod: any = await import(/* @vite-ignore */ caminho);
    const f = mod.planoAdminService ?? mod;
    return {
      criar: (i, c) => f.criarPlano(i, c),
      actualizar: (id, i, c) => f.actualizarPlano(id, i, c),
    };
  }

  function codigo(rotulo: string): string {
    seq += 1;
    return `TPRF_${rotulo}_${s6}${seq}`;
  }

  function price(rotulo: string): string {
    seq += 1;
    return `price_tprf_${rotulo}_${s6}_${seq}`;
  }

  function ctx() {
    seq += 1;
    return { keycloakSub: SUB, requestId: `req-534-${sufixo}-${seq}` };
  }

  function entrada(rotulo: string, over: Record<string, unknown> = {}) {
    return {
      codigo: codigo(rotulo),
      nome: `Plano ${rotulo} ${s6}`,
      descricao: `Plano de teste ${rotulo}`,
      precoMensalUsd: '12.50',
      precoAnualUsd: '125.00',
      stripePriceIdMensal: null,
      stripePriceIdAnual: null,
      limiteUtilizadores: 5,
      limiteArmazens: -1,
      suporte: 'Email (48h)',
      funcionalidades: ['Facturação'],
      ordem: 70,
      destaque: false,
      ...over,
    };
  }

  async function criarOk(rotulo: string, over: Record<string, unknown> = {}): Promise<any> {
    const s = await svc();
    const input = entrada(rotulo, over);
    await s.criar(input, ctx());
    const p = await db.plano.findUnique({ where: { codigo: input.codigo } });
    expect(p, `o plano ${input.codigo} não foi criado`).not.toBeNull();
    return p;
  }

  async function erroDe(p: Promise<unknown>): Promise<any> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    return null;
  }

  function esperarDuplicado(e: any, campo: 'stripePriceIdMensal' | 'stripePriceIdAnual', rotulo: string) {
    expect(e, `${rotulo}: passou e devia ter sido recusado`).not.toBeNull();
    expect(e.name, `${rotulo}: ${e?.name} ${e?.message}`).toBe('BusinessRuleError');
    expect(e.code).toBe('PRICE_ID_DUPLICADO');
    expect(e.status).toBe(409);
    expect(e.details, `${rotulo}: PRICE_ID_DUPLICADO sem details.campo`).toMatchObject({ campo });
  }

  // ─── P1 — campo em causa, apanhado pela verificação ─────────────────────────

  describe('P1 — PRICE_ID_DUPLICADO indica o campo do pedido que colide', () => {
    it('criar: mensal igual ao mensal de outro plano → campo stripePriceIdMensal; nada gravado', async () => {
      const s = await svc();
      const p = price('mm');
      await criarOk('MM1', { stripePriceIdMensal: p });
      const input = entrada('MM2', { stripePriceIdMensal: p });

      const e = await erroDe(s.criar(input, ctx()));

      esperarDuplicado(e, 'stripePriceIdMensal', 'mensal × mensal');
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: input.codigo } })).toBe(0);
    });

    it('criar: anual igual ao anual de outro plano → campo stripePriceIdAnual', async () => {
      const s = await svc();
      const p = price('aa');
      await criarOk('AA1', { stripePriceIdAnual: p });
      const input = entrada('AA2', { stripePriceIdAnual: p });

      esperarDuplicado(await erroDe(s.criar(input, ctx())), 'stripePriceIdAnual', 'anual × anual');
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
    });

    it('criar: mensal do pedido igual ao ANUAL de outro plano → campo stripePriceIdMensal', async () => {
      const s = await svc();
      const p = price('ma');
      await criarOk('MA1', { stripePriceIdAnual: p });
      const input = entrada('MA2', { stripePriceIdMensal: p });

      esperarDuplicado(await erroDe(s.criar(input, ctx())), 'stripePriceIdMensal', 'mensal × anual de outro');
    });

    it('criar: anual do pedido igual ao MENSAL de outro plano → campo stripePriceIdAnual', async () => {
      const s = await svc();
      const p = price('am');
      await criarOk('AM1', { stripePriceIdMensal: p });
      const input = entrada('AM2', { stripePriceIdAnual: p });

      esperarDuplicado(await erroDe(s.criar(input, ctx())), 'stripePriceIdAnual', 'anual × mensal de outro');
    });

    it('criar: mensal livre e anual a colidir → aponta o anual, não o primeiro preenchido', async () => {
      const s = await svc();
      const p = price('livre');
      await criarOk('LV1', { stripePriceIdMensal: p });
      const input = entrada('LV2', { stripePriceIdMensal: price('livre2'), stripePriceIdAnual: p });

      esperarDuplicado(await erroDe(s.criar(input, ctx())), 'stripePriceIdAnual', 'mensal livre, anual ocupado');
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
    });

    it('criar: o mesmo Price nos dois ciclos do mesmo pedido → aponta o anual (o que repete)', async () => {
      const s = await svc();
      const p = price('dois');
      const input = entrada('DOIS', { stripePriceIdMensal: p, stripePriceIdAnual: p });

      esperarDuplicado(await erroDe(s.criar(input, ctx())), 'stripePriceIdAnual', 'mesmo Price nos dois ciclos');
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
    });

    it('actualizar: anual para o anual de outro plano → campo stripePriceIdAnual; nada muda', async () => {
      const s = await svc();
      const p = price('ed');
      await criarOk('ED1', { stripePriceIdAnual: p });
      const meuMensal = price('edm');
      const alvo = await criarOk('ED2', { stripePriceIdMensal: meuMensal });

      const e = await erroDe(
        s.actualizar(
          alvo.id,
          entrada('ED2', { codigo: alvo.codigo, stripePriceIdMensal: meuMensal, stripePriceIdAnual: p }),
          ctx(),
        ),
      );

      esperarDuplicado(e, 'stripePriceIdAnual', 'edição do anual');
      const d = await db.plano.findUnique({ where: { id: alvo.id } });
      expect(d.stripePriceIdAnual).toBeNull();
      expect(d.stripePriceIdMensal).toBe(meuMensal);
      expect(await db.auditoriaPlataforma.count({ where: { codigo: alvo.codigo, acao: 'ACTUALIZAR' } })).toBe(0);
    });

    it('actualizar: mensal para o mensal de outro plano → campo stripePriceIdMensal', async () => {
      const s = await svc();
      const p = price('edm2');
      await criarOk('EM1', { stripePriceIdMensal: p });
      const alvo = await criarOk('EM2');

      const e = await erroDe(
        s.actualizar(alvo.id, entrada('EM2', { codigo: alvo.codigo, stripePriceIdMensal: p }), ctx()),
      );

      esperarDuplicado(e, 'stripePriceIdMensal', 'edição do mensal');
    });
  });

  // ─── P2 — campo em causa, apanhado pela base (P2002) ────────────────────────

  describe('P2 — colisão só apanhada pelo @unique (P2002) também indica o campo', () => {
    /** Espera até haver um backend à espera de tranca numa instrução sobre "Plano". */
    async function esperarBloqueio(ms = 15_000): Promise<boolean> {
      const fim = Date.now() + ms;
      while (Date.now() < fim) {
        const r: Array<{ n: number }> = await db.$queryRaw`
          SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%Plano%'`;
        if (r[0]?.n > 0) return true;
        await new Promise((res) => setTimeout(res, 100));
      }
      return false;
    }

    async function corrida(coluna: 'stripePriceIdMensal' | 'stripePriceIdAnual') {
      const s = await svc();
      const p = price(`race${coluna === 'stripePriceIdMensal' ? 'm' : 'a'}`);
      let libertar!: () => void;
      const portao = new Promise<void>((r) => (libertar = r));
      let marcarInserido!: () => void;
      const inserido = new Promise<void>((r) => (marcarInserido = r));

      // Uma escrita concorrente grava o Price e fica por confirmar: a verificação do serviço não a
      // vê, e o INSERT do serviço fica à espera da tranca do índice único até ela confirmar.
      const outra = db.$transaction(
        async (tx: any) => {
          await tx.plano.create({
            data: {
              codigo: codigo('RACEA'),
              nome: 'Corrida',
              descricao: 'Plano concorrente',
              precoMensalUsd: '1.00',
              precoAnualUsd: '10.00',
              limiteUtilizadores: 1,
              limiteArmazens: 1,
              suporte: 'Email',
              ordem: 71,
              [coluna]: p,
            },
          });
          marcarInserido();
          await portao;
        },
        { timeout: 60_000, maxWait: 15_000 },
      );
      await inserido;

      const input = entrada('RACEB', { [coluna]: p });
      const pedido = erroDe(s.criar(input, ctx()));
      const bloqueou = await esperarBloqueio();
      libertar();
      await outra;
      const e = await pedido;

      expect(bloqueou, 'o INSERT do serviço não chegou a esperar pela escrita concorrente: o caminho P2002 não foi exercido').toBe(true);
      esperarDuplicado(e, coluna, `P2002 em ${coluna}`);
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: input.codigo } })).toBe(0);
    }

    it('P2002 no mensal → campo stripePriceIdMensal', async () => {
      await corrida('stripePriceIdMensal');
    });

    it('P2002 no anual → campo stripePriceIdAnual', async () => {
      await corrida('stripePriceIdAnual');
    });
  });

  // ─── A1 — acção do trilho como enum ─────────────────────────────────────────

  describe('A1 — AuditoriaPlataforma.acao é o enum AcaoAuditoriaPlataforma', () => {
    it('a coluna é do tipo enum AcaoAuditoriaPlataforma, com exactamente os 5 literais', async () => {
      const col: Array<{ data_type: string; udt_name: string }> = await db.$queryRaw`
        SELECT data_type, udt_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'AuditoriaPlataforma' AND column_name = 'acao'`;
      expect(col).toHaveLength(1);
      expect(col[0].data_type).toBe('USER-DEFINED');
      expect(col[0].udt_name).toBe('AcaoAuditoriaPlataforma');

      const labels: Array<{ enumlabel: string }> = await db.$queryRaw`
        SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'AcaoAuditoriaPlataforma' ORDER BY e.enumsortorder`;
      expect(labels.map((l) => l.enumlabel).sort()).toEqual([...ACOES].sort());
    });

    it('o client Prisma exporta o enum com os 5 valores', async () => {
      const client: any = await import('@prisma/client');
      const en = client.AcaoAuditoriaPlataforma ?? client.$Enums?.AcaoAuditoriaPlataforma;
      expect(en, 'enum AcaoAuditoriaPlataforma não exportado pelo @prisma/client').toBeDefined();
      expect(Object.values(en).sort()).toEqual([...ACOES].sort());
    });

    it('grava e lê os 5 valores iguais', async () => {
      const cod = codigo('ENUM');
      for (const acao of ACOES) {
        await db.auditoriaPlataforma.create({
          data: { keycloakSub: SUB, acao, entidade: 'Plano', codigo: cod },
        });
      }
      const linhas = await db.auditoriaPlataforma.findMany({ where: { codigo: cod } });
      expect(linhas.map((l: any) => l.acao).sort()).toEqual([...ACOES].sort());
    });

    it('um valor fora do enum é recusado pela BASE (SQL cru) e nada fica gravado', async () => {
      const cod = codigo('FORA');
      const id = `tprf-fora-${s6}-${++seq}`;
      const e = await erroDe(
        db.$executeRawUnsafe(
          `INSERT INTO "AuditoriaPlataforma" ("id", "keycloakSub", "acao", "entidade", "codigo")
           VALUES ('${id}', '${SUB}', 'OUTRA', 'Plano', '${cod}')`,
        ),
      );
      expect(e, 'a base aceitou acao = OUTRA').not.toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: cod } })).toBe(0);
    });

    it('um valor fora do enum é recusado pelo client', async () => {
      const cod = codigo('FORAC');
      const e = await erroDe(
        db.auditoriaPlataforma.create({
          data: { keycloakSub: SUB, acao: 'OUTRA', entidade: 'Plano', codigo: cod },
        }),
      );
      expect(e, 'o client aceitou acao = OUTRA').not.toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: cod } })).toBe(0);
    });

    it('o serviço continua a gravar a acção do trilho (CRIAR) no novo tipo', async () => {
      const p = await criarOk('TRILHO');
      const linhas = await db.auditoriaPlataforma.findMany({ where: { codigo: p.codigo } });
      expect(linhas.map((l: any) => l.acao)).toEqual(['CRIAR']);
    });
  });

  // ─── A2 — migração sem perda ────────────────────────────────────────────────

  describe('A2 — migração nova, escrita à mão, sem perda de dados', () => {
    it('existe UMA migração nova que cria o tipo e converte a coluna com USING, sem DROP', () => {
      const ms = migracoesDoEnum();
      expect(ms.map((m) => m.nome), 'migração com CREATE TYPE "AcaoAuditoriaPlataforma"').toHaveLength(1);
      const [m] = ms;
      expect(m.nome > '20261013160000', `${m.nome} tem de ser posterior a 20261013160000`).toBe(true);
      expect(m.sql).toMatch(/ALTER\s+COLUMN\s+"acao"\s+(SET\s+DATA\s+)?TYPE\s+("public"\.)?"AcaoAuditoriaPlataforma"/i);
      expect(m.sql).toMatch(/USING\s+\(?\s*"?acao"?\s*(::\s*text\s*)?\)?\s*::\s*("public"\.)?"AcaoAuditoriaPlataforma"/i);
      expect(m.sql).not.toMatch(/DROP\s+COLUMN\s+"acao"/i);
      expect(m.sql).not.toMatch(/DROP\s+TABLE[^;]*"AuditoriaPlataforma"/i);
      expect(m.sql).not.toMatch(/ADD\s+COLUMN\s+"acao"/i);
    });

    it('corrida sobre a tabela no estado anterior, com os 5 valores, preserva todas as linhas', async () => {
      const ms = migracoesDoEnum();
      expect(ms).toHaveLength(1);
      const novaSql = ms[0].sql.replace(/"public"\./g, '');
      const anterior = readFileSync(
        path.join(MIGRACOES, '20261013160000_gestao_planos_auditoria_plataforma', 'migration.sql'),
        'utf8',
      )
        .split(';')
        .filter((st) => /"AuditoriaPlataforma"/.test(st))
        .map((st) => `${st};`)
        .join('\n');

      const pgmod: any = await import('pg');
      const Client = pgmod.Client ?? pgmod.default?.Client;
      const c = new Client({ connectionString: process.env.INTEGRATION_DB_URL });
      await c.connect();
      const schema = `m534_${s6}`;
      try {
        await c.query(`CREATE SCHEMA "${schema}"`);
        await c.query(`SET search_path TO "${schema}"`);
        await c.query(anterior);
        for (const [i, acao] of ACOES.entries()) {
          await c.query(
            `INSERT INTO "AuditoriaPlataforma" ("id","keycloakSub","acao","entidade","codigo","antes")
             VALUES ($1, $2, $3, 'Plano', 'TPRF_MIG', $4)`,
            [`mig-${i}`, SUB, acao, JSON.stringify({ i })],
          );
        }

        await c.query(novaSql);

        const r = await c.query(
          `SELECT id, acao::text AS acao, pg_typeof(acao)::text AS tipo, antes FROM "AuditoriaPlataforma" ORDER BY id`,
        );
        expect(r.rows).toHaveLength(5);
        r.rows.forEach((row: any, i: number) => {
          expect(row.id).toBe(`mig-${i}`);
          expect(row.acao).toBe(ACOES[i]);
          expect(row.tipo.replace(/"/g, '')).toMatch(/AcaoAuditoriaPlataforma$/);
          expect(row.antes).toEqual({ i });
        });
      } finally {
        await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
        await c.end();
      }
    });
  });
});
