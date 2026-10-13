/**
 * Oráculo da issue #429 — tenants anteriores à spec 19 (sem `Assinatura`) passam a tê-la.
 *
 * O defeito: `lib/auth.ts` (e `limites-plano.ts`) tratam um tenant sem `Assinatura` como
 * acesso aberto e sem limites, mas `listarTenantsComAcesso` (crons `transporte-alertas` e
 * `abrir-exercicio`) só parte das assinaturas em TRIAL/ATIVA/LEITURA. No `demo` (e em
 * qualquer tenant anterior à spec 19) os utilizadores entram com acesso total e os crons
 * nunca correm.
 *
 * Contrato (decisão do orquestrador; a opção que não muda nada visível excepto os crons
 * passarem a correr):
 *   M1 Há uma migração de DADOS em `prisma/migrations/<ts>_<nome>/migration.sql`, escrita à
 *      mão, que faz `INSERT INTO "Assinatura" … SELECT … ON CONFLICT DO NOTHING` para os
 *      tenants que não têm Assinatura.
 *   M2 A Assinatura criada é `estado = ATIVA`, `planoAssinatura = EMPRESARIAL` (o plano cujos
 *      limites são -1: `limiteDoPlano` devolve `null`, como hoje sem Assinatura), sem
 *      referências Stripe e sem `leituraFim`. `estadoDeAcesso(ATIVA)` = `aberto`, como hoje.
 *   M3 Tenants que JÁ têm Assinatura ficam exactamente como estavam (estado e plano).
 *   M4 Idempotente: correr a migração uma segunda vez não falha nem cria nada.
 *   M5 Efeito pretendido: o tenant passa a entrar em `listarTenantsComAcesso` (os crons
 *      correm). Um tenant apagado (`deletedAt`) continua de fora, com ou sem backfill.
 *   S1 O seed do tenant demo (`seedPlataforma`, `prisma/seed/plataforma.ts`, chamado em
 *      `prisma/seed/index.ts` para o demo) cria a mesma Assinatura (ATIVA, EMPRESARIAL).
 *   S2 O seed é idempotente e não reescreve uma Assinatura que já exista (um tenant em
 *      TRIAL/BASICO continua TRIAL/BASICO depois do seed).
 *
 * A migração é encontrada pelo conteúdo (o nome é do implementador) e re-executada contra a
 * base efémera depois de criar os tenants deste ficheiro — no `migrate deploy` do globalSetup
 * a base estava vazia. Os ficheiros de integração correm em série (`fileParallelism: false`);
 * no fim apagam-se as Assinaturas que a re-execução criou (inclusive em tenants de outros
 * ficheiros), para não deixar resíduo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql.
 * SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

const RE_INSERT_ASSINATURA = /INSERT\s+INTO\s+(?:"?public"?\.)?"Assinatura"/i;

/** As migrações que fazem backfill de Assinatura (M1). */
function migracoesDeBackfill(): Array<{ nome: string; sql: string }> {
  const dir = path.resolve(process.cwd(), 'prisma/migrations');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ nome: d.name, ficheiro: path.join(dir, d.name, 'migration.sql') }))
    .filter((m) => existsSync(m.ficheiro))
    .map((m) => ({ nome: m.nome, sql: readFileSync(m.ficheiro, 'utf8') }))
    .filter((m) => RE_INSERT_ASSINATURA.test(m.sql));
}

describe.skipIf(skip)('#429 — tenants sem Assinatura recebem ATIVA/EMPRESARIAL (DB efémera)', () => {
  let db: any;
  let listarTenantsComAcesso: () => Promise<Array<{ id: string; slug: string }>>;
  let limiteDoPlano: (db: any, tenantId: string, recurso: 'utilizadores' | 'armazens') => Promise<unknown>;
  let estadoDeAcesso: (estado: any, apagado: boolean) => string;

  const sufixo = `t429-${Date.now()}`;
  let seqNuit = 0;

  let migracao: { nome: string; sql: string } | null = null;
  let erroPrimeiraCorrida: unknown = null;
  let erroSegundaCorrida: unknown = null;
  let contagemAposPrimeira = -1;
  let contagemAposSegunda = -1;
  let acessoAntes: string[] = [];
  /** Tenants que já tinham Assinatura antes de qualquer coisa deste ficheiro (para limpar). */
  let comAssinaturaAntes = new Set<string>();

  const t: Record<string, string> = {};

  async function criarTenant(nome: string, opcoes: { apagado?: boolean } = {}): Promise<string> {
    const id = `t-${nome}-${sufixo}`;
    seqNuit += 1;
    await db.tenant.create({
      data: {
        id,
        nome: `Tenant ${nome}`,
        slug: `${nome}-${sufixo}`,
        nuit: `8${String(Date.now()).slice(-6)}${String(seqNuit).padStart(2, '0')}`,
        deletedAt: opcoes.apagado ? new Date() : null,
      },
    });
    return id;
  }

  async function correrSql(sql: string): Promise<void> {
    const c = new Client({ connectionString: process.env.INTEGRATION_DB_URL });
    await c.connect();
    try {
      await c.query(sql); // protocolo simples: aceita vários comandos
    } finally {
      await c.end();
    }
  }

  async function assinatura(tenantId: string): Promise<any> {
    return db.assinatura.findUnique({ where: { tenantId } });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ listarTenantsComAcesso } = (await import('@/server/provisioning/tenants-com-acesso')) as any);
    ({ limiteDoPlano } = (await import('@/server/billing/limites-plano')) as any);
    ({ estadoDeAcesso } = (await import('@/lib/state-machines')) as any);

    comAssinaturaAntes = new Set(
      (await db.assinatura.findMany({ select: { tenantId: true } })).map((a: any) => a.tenantId),
    );

    // Migração: tenants criados ANTES de a re-executar.
    t.semAss = await criarTenant('sem-ass');
    t.semAssApagado = await criarTenant('sem-ass-apagado', { apagado: true });
    t.trialBasico = await criarTenant('trial-basico');
    await db.assinatura.create({
      data: {
        tenantId: t.trialBasico,
        estado: 'TRIAL',
        planoAssinatura: 'BASICO',
        trialFim: new Date(Date.now() + 10 * 86_400_000),
      },
    });
    t.fechadaProf = await criarTenant('fechada-prof');
    await db.assinatura.create({
      data: {
        tenantId: t.fechadaProf,
        estado: 'FECHADA',
        planoAssinatura: 'PROFISSIONAL',
        trialFim: new Date(Date.now() - 90 * 86_400_000),
      },
    });

    acessoAntes = (await listarTenantsComAcesso()).map((x) => x.id);

    const encontradas = migracoesDeBackfill();
    migracao = encontradas.length === 1 ? encontradas[0] : null;
    if (migracao) {
      try {
        await correrSql(migracao.sql);
      } catch (e) {
        erroPrimeiraCorrida = e;
      }
      contagemAposPrimeira = await db.assinatura.count();
      try {
        await correrSql(migracao.sql);
      } catch (e) {
        erroSegundaCorrida = e;
      }
      contagemAposSegunda = await db.assinatura.count();
    }
  });

  afterAll(async () => {
    if (!db) return;
    // Remove as Assinaturas criadas pela re-execução e pelo seed neste ficheiro.
    await db.assinatura.deleteMany({
      where: { tenantId: { notIn: [...comAssinaturaAntes] } },
    });
  });

  // ── M1 ──────────────────────────────────────────────────────────────────────
  it('M1 — existe UMA migração de dados que insere em "Assinatura" com ON CONFLICT DO NOTHING', () => {
    const encontradas = migracoesDeBackfill().map((m) => m.nome);
    expect(encontradas, 'falta a migração de backfill da Assinatura (#429)').toHaveLength(1);
    expect(migracao!.sql).toMatch(/ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i);
  });

  it('pré-condição: antes da migração o tenant sem Assinatura fica fora dos crons', () => {
    expect(acessoAntes).not.toContain(t.semAss);
    expect(acessoAntes).toContain(t.trialBasico);
  });

  // ── M2 ──────────────────────────────────────────────────────────────────────
  it('M2 — o tenant sem Assinatura recebe ATIVA no plano EMPRESARIAL, sem Stripe nem Leitura', async () => {
    expect(migracao, 'falta a migração de backfill').not.toBeNull();
    expect(erroPrimeiraCorrida, String(erroPrimeiraCorrida)).toBeNull();
    const a = await assinatura(t.semAss);
    expect(a, 'o tenant sem Assinatura continua sem ela').not.toBeNull();
    expect(a.estado).toBe('ATIVA');
    expect(a.planoAssinatura).toBe('EMPRESARIAL');
    expect(a.stripeCustomerId).toBeNull();
    expect(a.stripeSubscriptionId).toBeNull();
    expect(a.leituraFim).toBeNull();
  });

  it('M2 — o acesso visível não muda: aberto e sem limites de utilizadores nem de armazéns', async () => {
    const a = await assinatura(t.semAss);
    expect(a, 'o tenant sem Assinatura continua sem ela').not.toBeNull();
    expect(estadoDeAcesso(a.estado, false)).toBe('aberto');
    expect(await limiteDoPlano(db, t.semAss, 'utilizadores')).toBeNull();
    expect(await limiteDoPlano(db, t.semAss, 'armazens')).toBeNull();
  });

  // ── M3 ──────────────────────────────────────────────────────────────────────
  it.each([
    ['trialBasico', 'TRIAL', 'BASICO'],
    ['fechadaProf', 'FECHADA', 'PROFISSIONAL'],
  ])('M3 — Assinatura já existente (%s) fica como estava: %s / %s', async (chave, estado, plano) => {
    expect(migracao, 'falta a migração de backfill').not.toBeNull();
    expect(erroPrimeiraCorrida, String(erroPrimeiraCorrida)).toBeNull();
    const a = await assinatura(t[chave]);
    expect(a.estado).toBe(estado);
    expect(a.planoAssinatura).toBe(plano);
  });

  // ── M4 ──────────────────────────────────────────────────────────────────────
  it('M4 — segunda execução não falha nem cria Assinaturas novas', () => {
    expect(migracao, 'falta a migração de backfill').not.toBeNull();
    expect(erroSegundaCorrida, String(erroSegundaCorrida)).toBeNull();
    expect(contagemAposPrimeira).toBeGreaterThan(0);
    expect(contagemAposSegunda).toBe(contagemAposPrimeira);
  });

  // ── M5 ──────────────────────────────────────────────────────────────────────
  it('M5 — depois da migração o tenant entra nos crons; o apagado continua de fora', async () => {
    expect(migracao, 'falta a migração de backfill').not.toBeNull();
    const ids = (await listarTenantsComAcesso()).map((x) => x.id);
    expect(ids).toContain(t.semAss);
    expect(ids).toContain(t.trialBasico);
    expect(ids).not.toContain(t.semAssApagado);
    expect(ids).not.toContain(t.fechadaProf);
  });

  // ── S1 / S2 ─────────────────────────────────────────────────────────────────
  it('S1 — o seed do demo (seedPlataforma) cria a Assinatura ATIVA/EMPRESARIAL, idempotente', async () => {
    const { seedPlataforma } = (await import('../../prisma/seed/plataforma')) as any;
    const id = await criarTenant('seed-demo');
    await seedPlataforma(db, id);
    await seedPlataforma(db, id); // idempotente: não rebenta no @unique(tenantId)
    const a = await assinatura(id);
    expect(a, 'o seed do demo não criou Assinatura').not.toBeNull();
    expect(a.estado).toBe('ATIVA');
    expect(a.planoAssinatura).toBe('EMPRESARIAL');
    expect(a.stripeSubscriptionId).toBeNull();
    expect(await db.assinatura.count({ where: { tenantId: id } })).toBe(1);
    expect((await listarTenantsComAcesso()).map((x) => x.id)).toContain(id);
  });

  it('S2 — o seed não reescreve uma Assinatura que já exista', async () => {
    const { seedPlataforma } = (await import('../../prisma/seed/plataforma')) as any;
    const id = await criarTenant('seed-existente');
    await db.assinatura.create({
      data: {
        tenantId: id,
        estado: 'TRIAL',
        planoAssinatura: 'BASICO',
        trialFim: new Date(Date.now() + 10 * 86_400_000),
      },
    });
    await seedPlataforma(db, id);
    const a = await assinatura(id);
    expect(a.estado).toBe('TRIAL');
    expect(a.planoAssinatura).toBe('BASICO');
    // Prova de que o seed passou pelo tenant (a ConfiguracaoFiscal existe), e mesmo assim
    // a Assinatura não mudou.
    expect(await db.configuracaoFiscal.count({ where: { tenantId: id } })).toBe(1);
  });
});
